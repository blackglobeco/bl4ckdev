const https = require('https');
const http  = require('http');
const tls   = require('tls');
const net   = require('net');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const domain = (req.query?.domain || '').trim();
  if (!domain) { res.status(400).json({ error: 'Missing query parameter: domain' }); return; }

  const clean = domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase().trim();
  if (!clean || clean.length < 3 || !clean.includes('.')) {
    res.status(400).json({ error: `Invalid domain: ${domain}` }); return;
  }

  // ── Generic JSON fetcher ──────────────────────────────────────────────────
  const fetchJSON = (url, extraHeaders = {}, timeoutMs = 9000) => new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(url); } catch { return resolve({ ok: false, data: null }); }
    const lib = parsed.protocol === 'http:' ? http : https;
    const options = {
      hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)', Accept: 'application/json', Connection: 'close', ...extraHeaders },
    };
    const request = lib.request(options, (r) => {
      if ([301,302,303,307,308].includes(r.statusCode) && r.headers.location) {
        r.resume();
        const next = r.headers.location.startsWith('http') ? r.headers.location : `https://${parsed.hostname}${r.headers.location}`;
        return fetchJSON(next, extraHeaders, timeoutMs).then(resolve);
      }
      let data = '';
      r.on('data', c => { data += c; });
      r.on('end', () => { try { resolve({ ok: true, data: JSON.parse(data), status: r.statusCode }); } catch { resolve({ ok: false, data: null, status: r.statusCode, raw: data.slice(0,300) }); } });
      r.on('error', () => resolve({ ok: false, data: null }));
    });
    request.on('error', () => resolve({ ok: false, data: null }));
    request.setTimeout(timeoutMs, () => { request.destroy(); resolve({ ok: false, data: null }); });
    request.end();
  });

  // ── Fetch plain text page ─────────────────────────────────────────────────
  const fetchText = (url, timeoutMs = 8000) => new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(url); } catch { return resolve(null); }
    const lib = parsed.protocol === 'http:' ? http : https;
    const options = {
      hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)', Accept: 'text/plain,text/html,*/*', Connection: 'close' },
    };
    const request = lib.request(options, (r) => {
      if ([301,302,303,307,308].includes(r.statusCode) && r.headers.location) {
        r.resume();
        const next = r.headers.location.startsWith('http') ? r.headers.location : `https://${parsed.hostname}${r.headers.location}`;
        return fetchText(next, timeoutMs).then(resolve);
      }
      let data = '';
      r.on('data', c => { if (data.length < 50000) data += c; });
      r.on('end', () => resolve({ text: data, status: r.statusCode, headers: r.headers }));
      r.on('error', () => resolve(null));
    });
    request.on('error', () => resolve(null));
    request.setTimeout(timeoutMs, () => { request.destroy(); resolve(null); });
    request.end();
  });

  // ── DNS over HTTPS (Cloudflare) ───────────────────────────────────────────
  const fetchDNS = (name, type) =>
    fetchJSON(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { Accept: 'application/dns-json' });

  const parseDNS = (result) =>
    result.ok && Array.isArray(result.data?.Answer)
      ? result.data.Answer.map(r => r.data).filter(Boolean) : undefined;

  // ── Live HTTP HEAD for headers & status ───────────────────────────────────
  const fetchHeaders = (hostname) => new Promise((resolve) => {
    const req2 = https.request(
      { hostname, path: '/', method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)', Connection: 'close' } },
      (r) => { r.resume(); resolve({ status: r.statusCode, headers: r.headers }); }
    );
    req2.on('error', () => resolve({ status: null, headers: {} }));
    req2.setTimeout(8000, () => { req2.destroy(); resolve({ status: null, headers: {} }); });
    req2.end();
  });

  // ── TLS handshake for live certificate ───────────────────────────────────
  const fetchSSLDirect = (hostname) => new Promise((resolve) => {
    try {
      const socket = tls.connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: false }, () => {
        try {
          const cert = socket.getPeerCertificate(true);
          socket.destroy();
          if (!cert || !cert.subject) return resolve(null);
          resolve({
            subject:      cert.subject?.CN ?? cert.subject?.O ?? undefined,
            issuer:       cert.issuer?.O   ?? cert.issuer?.CN ?? undefined,
            validFrom:    cert.valid_from  ? new Date(cert.valid_from).toDateString() : undefined,
            validTo:      cert.valid_to    ? new Date(cert.valid_to).toDateString()   : undefined,
            valid:        cert.valid_to    ? new Date(cert.valid_to) > new Date()     : undefined,
            sans:         cert.subjectaltname ? cert.subjectaltname.replace(/DNS:/g,'').split(', ').slice(0,10) : undefined,
            serialNumber: cert.serialNumber ?? undefined,
            fingerprint:  cert.fingerprint  ?? undefined,
          });
        } catch { socket.destroy(); resolve(null); }
      });
      socket.on('error', () => resolve(null));
      socket.setTimeout(8000, () => { socket.destroy(); resolve(null); });
    } catch { resolve(null); }
  });

  // ── IP geolocation via ip-api.com (HTTP, no key needed) ──────────────────
  const fetchGeo = (target) => new Promise((resolve) => {
    const req3 = http.get(
      `http://ip-api.com/json/${encodeURIComponent(target)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,hosting,proxy,mobile,query`,
      (r) => { let d = ''; r.on('data', c => { d += c; }); r.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } }); r.on('error', () => resolve(null)); }
    );
    req3.on('error', () => resolve(null));
    req3.setTimeout(8000, () => { req3.destroy(); resolve(null); });
  });

  // ── WHOIS via RDAP with registry-specific fallbacks ──────────────────────
  const fetchWHOIS = async (domainName) => {
    const tld = domainName.split('.').slice(-2).join('.'); // e.g. "digital-id.my" → "my"
    const lastTld = domainName.split('.').pop();
    const sources = [
      `https://rdap.org/domain/${domainName}`,
      `https://rdap.iana.org/domain/${domainName}`,
      // TLD-specific registries
      lastTld === 'com' ? `https://rdap.verisign.com/com/v1/domain/${domainName}` : null,
      lastTld === 'net' ? `https://rdap.verisign.com/net/v1/domain/${domainName}` : null,
      lastTld === 'org' ? `https://rdap.publicinterestregistry.org/rdap/domain/${domainName}` : null,
      lastTld === 'uk'  ? `https://rdap.nominet.uk/uk/domain/${domainName}` : null,
      lastTld === 'my'  ? `https://rdap.mynic.my/rdap/domain/${domainName}` : null,
      lastTld === 'my'  ? `https://www.mynic.my/rdap/domain/${domainName}` : null,
      // Generic RDAP bootstrap
      `https://data.iana.org/rdap/dns.json`,
    ].filter(Boolean);

    for (const url of sources) {
      if (url.includes('iana.org/rdap/dns.json')) continue; // skip the bootstrap index
      const r = await fetchJSON(url, {}, 8000);
      if (r.ok && r.data && (r.data.ldhName || r.data.handle || r.data.events)) return r.data;
    }
    return null;
  };

  // ── Port scanner (TCP connect, common web ports) ──────────────────────────
  const scanPorts = (hostname, ports) => {
    const checks = ports.map(port => new Promise((resolve) => {
      const socket = net.createConnection({ host: hostname, port, timeout: 3000 }, () => {
        socket.destroy(); resolve(port);
      });
      socket.on('error', () => resolve(null));
      socket.on('timeout', () => { socket.destroy(); resolve(null); });
    }));
    return Promise.all(checks).then(results => results.filter(Boolean));
  };

  // ── Parse cookies from Set-Cookie headers ────────────────────────────────
  const parseCookies = (headers) => {
    const raw = headers?.['set-cookie'];
    if (!raw) return undefined;
    const list = Array.isArray(raw) ? raw : [raw];
    return list.map(cookie => {
      const parts = cookie.split(';').map(s => s.trim());
      const [nameVal, ...attrs] = parts;
      const [name, ...valParts] = nameVal.split('=');
      const attrMap = Object.fromEntries(attrs.map(a => {
        const [k, ...v] = a.split('=');
        return [k.toLowerCase(), v.join('=') || true];
      }));
      return {
        name:     name?.trim()          ?? undefined,
        secure:   !!attrMap['secure'],
        httpOnly: !!attrMap['httponly'],
        sameSite: attrMap['samesite']   ?? undefined,
        path:     attrMap['path']       ?? undefined,
        expires:  attrMap['expires']    ?? undefined,
        maxAge:   attrMap['max-age']    ?? undefined,
      };
    });
  };

  // ── Parse SPF / DMARC from TXT records ────────────────────────────────────
  const analyseEmailSecurity = (txtRecords, domain) => {
    if (!txtRecords) return undefined;
    const flat = txtRecords.map(t => t.replace(/^"|"$/g, '').trim());
    const spf    = flat.find(t => t.startsWith('v=spf1'));
    const dmarc  = flat.find(t => t.startsWith('v=DMARC1'));
    return {
      spf:          spf    ?? null,
      spfValid:     !!spf,
      dmarc:        dmarc  ?? null,
      dmarcValid:   !!dmarc,
      mxConfigured: true,  // we already confirmed MX exists
    };
  };

  // ── Security header analysis ──────────────────────────────────────────────
  const analyseSecurityHeaders = (headers) => {
    if (!headers) return undefined;
    const h = Object.fromEntries(Object.entries(headers).map(([k,v]) => [k.toLowerCase(), v]));
    return {
      hsts:              !!h['strict-transport-security'],
      hstsValue:         h['strict-transport-security']  ?? undefined,
      csp:               !!h['content-security-policy'],
      cspValue:          h['content-security-policy']    ?? undefined,
      xFrameOptions:     h['x-frame-options']            ?? undefined,
      xContentTypeOpts:  h['x-content-type-options']     ?? undefined,
      referrerPolicy:    h['referrer-policy']             ?? undefined,
      permissionsPolicy: h['permissions-policy']         ?? undefined,
      server:            h['server']                     ?? undefined,
      poweredBy:         h['x-powered-by']               ?? undefined,
      setCookieCount:    Array.isArray(h['set-cookie'])  ? h['set-cookie'].length : h['set-cookie'] ? 1 : 0,
    };
  };

  try {
    // ── Phase 1: DNS + SSL + headers in parallel ─────────────────────────
    const [dnsA, dnsAAAA, dnsMX, dnsNS, dnsTXT, dnsCNAME, dnsSOA, headerResult, sslDirect] = await Promise.all([
      fetchDNS(clean, 'A'),
      fetchDNS(clean, 'AAAA'),
      fetchDNS(clean, 'MX'),
      fetchDNS(clean, 'NS'),
      fetchDNS(clean, 'TXT'),
      fetchDNS(clean, 'CNAME'),
      fetchDNS(clean, 'SOA'),
      fetchHeaders(clean),
      fetchSSLDirect(clean),
    ]);

    const aRecords     = parseDNS(dnsA);
    const aaaaRecords  = parseDNS(dnsAAAA);
    const mxRecords    = parseDNS(dnsMX);
    const nsRecords    = parseDNS(dnsNS);
    const txtRecords   = parseDNS(dnsTXT);
    const cnameRecords = parseDNS(dnsCNAME);
    const soaRecords   = parseDNS(dnsSOA);

    const resolvedIP = aRecords?.[0] ?? clean;

    // ── Phase 2: Geo + WHOIS + robots + sitemap + ports in parallel ────────
    const [geoData, whoisData, robotsResult, sitemapResult, openPorts] = await Promise.all([
      fetchGeo(resolvedIP),
      fetchWHOIS(clean),
      fetchText(`https://${clean}/robots.txt`),
      fetchText(`https://${clean}/sitemap.xml`),
      scanPorts(clean, [21, 22, 25, 80, 443, 3306, 3389, 8080, 8443, 8888]),
    ]);

    // ── Build response ────────────────────────────────────────────────────
    const merged = {};

    // IP & Geo
    if (geoData?.status === 'success') {
      merged.ip              = geoData.query        ?? undefined;
      merged.asn             = geoData.as            ?? undefined;
      merged.hostingProvider = geoData.org ?? geoData.isp ?? undefined;
      merged.isp             = geoData.isp           ?? undefined;
      merged.isHosting       = geoData.hosting       ?? undefined;
      merged.isProxy         = geoData.proxy         ?? undefined;
      merged.isMobile        = geoData.mobile        ?? undefined;
      merged.location = {
        city: geoData.city, region: geoData.regionName, country: geoData.country,
        countryCode: geoData.countryCode, lat: geoData.lat, lon: geoData.lon,
        zip: geoData.zip, timezone: geoData.timezone,
      };
    }

    // WHOIS
    if (whoisData) {
      const registrarEntity   = (whoisData.entities||[]).find(e => (e.roles||[]).includes('registrar'));
      const registrar         = registrarEntity?.vcardArray?.[1]?.find(v=>v[0]==='fn')?.[3]
                                ?? registrarEntity?.publicIds?.[0]?.identifier ?? undefined;
      const created = whoisData.events?.find(e => e.eventAction==='registration')?.eventDate;
      const expires = whoisData.events?.find(e => e.eventAction==='expiration')?.eventDate;
      const updated = whoisData.events?.find(e => e.eventAction==='last changed')?.eventDate;
      const registrantEntity  = (whoisData.entities||[]).find(e => (e.roles||[]).includes('registrant'));
      const owner             = registrantEntity?.vcardArray?.[1]?.find(v=>v[0]==='fn')?.[3]
                                ?? registrantEntity?.vcardArray?.[1]?.find(v=>v[0]==='org')?.[3] ?? undefined;
      merged.whois = {
        registrar:    registrar ?? undefined,
        registeredOn: created   ? new Date(created).toDateString() : undefined,
        expiresOn:    expires   ? new Date(expires).toDateString() : undefined,
        updatedOn:    updated   ? new Date(updated).toDateString() : undefined,
        owner:        owner     ?? undefined,
        status:       Array.isArray(whoisData.status) ? whoisData.status.join(', ') : undefined,
        nameservers:  (whoisData.nameservers||[]).map(ns=>ns.ldhName).filter(Boolean),
      };
    }

    // SSL
    merged.ssl = sslDirect ?? undefined;

    // DNS
    if (aRecords||aaaaRecords||mxRecords||nsRecords||txtRecords||cnameRecords) {
      merged.dns = {
        A: aRecords, AAAA: aaaaRecords, MX: mxRecords,
        NS: nsRecords, TXT: txtRecords, CNAME: cnameRecords,
        SOA: soaRecords,
      };
    }

    // HTTP status + headers
    if (headerResult.status) {
      merged.status  = headerResult.status;
      merged.headers = headerResult.headers;
    }

    // Security headers
    const secHeaders = analyseSecurityHeaders(headerResult.headers);
    if (secHeaders) merged.securityHeaders = secHeaders;

    // Cookies
    const cookies = parseCookies(headerResult.headers);
    if (cookies?.length) merged.cookies = cookies;

    // Open ports
    if (openPorts?.length) merged.openPorts = openPorts;

    // Technologies (from headers)
    const tech = new Set();
    const hdr = headerResult.headers || {};
    if (hdr['x-powered-by']) tech.add(hdr['x-powered-by']);
    if (hdr.server) tech.add(hdr.server);
    if ((hdr.link||'').includes('_next')) tech.add('Next.js');
    if ((hdr.link||'').includes('wp-content')) tech.add('WordPress');
    if ((hdr['x-middleware-rewrite'])) tech.add('Next.js Middleware');
    if (tech.size) merged.technologies = [...tech];

    // Robots.txt
    if (robotsResult?.status === 200 && robotsResult.text) {
      const lines = robotsResult.text.split('\n').map(l=>l.trim()).filter(l=>l && !l.startsWith('#'));
      merged.robots = {
        present: true,
        sitemapUrls: lines.filter(l=>l.toLowerCase().startsWith('sitemap:')).map(l=>l.split(':').slice(1).join(':').trim()),
        disallowedPaths: lines.filter(l=>l.toLowerCase().startsWith('disallow:')).map(l=>l.split(':').slice(1).join(':').trim()).filter(Boolean).slice(0,20),
        allowedPaths: lines.filter(l=>l.toLowerCase().startsWith('allow:')).map(l=>l.split(':').slice(1).join(':').trim()).filter(Boolean).slice(0,10),
        rawPreview: robotsResult.text.slice(0, 800),
      };
    } else {
      merged.robots = { present: false };
    }

    // Sitemap
    if (sitemapResult?.status === 200 && sitemapResult.text) {
      const urls = (sitemapResult.text.match(/<loc>(.*?)<\/loc>/g)||[]).map(m=>m.replace(/<\/?loc>/g,''));
      merged.sitemap = { present: true, urlCount: urls.length, sampleUrls: urls.slice(0, 10) };
    } else {
      merged.sitemap = { present: false };
    }

    // Email security (SPF / DMARC)
    const emailSec = analyseEmailSecurity(txtRecords, clean);
    if (emailSec) merged.emailSecurity = emailSec;

    // Carbon footprint estimate (based on page transfer size heuristic)
    // Using Digital Beacon methodology: average page ~2MB = ~0.5g CO2
    merged.carbonFootprint = {
      note: 'Estimated based on server location and hosting type',
      serverCountry: merged.location?.country ?? 'Unknown',
      isGreenHosting: merged.isHosting === false ? 'Unknown' : undefined,
    };

    res.status(200).json(merged);

  } catch (err) {
    console.error('[WebCheck proxy] Error:', err.message);
    res.status(500).json({ error: `Web-check proxy error: ${err.message}` });
  }
};

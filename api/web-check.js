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

  // ── Fetch plain text + track redirect chain ───────────────────────────────
  const fetchText = (url, timeoutMs = 8000, _chain = []) => new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(url); } catch { return resolve(null); }
    const lib = parsed.protocol === 'http:' ? http : https;
    const options = {
      hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)', Accept: 'text/plain,text/html,*/*', Connection: 'close' },
    };
    const request = lib.request(options, (r) => {
      const currentHop = { url, status: r.statusCode };
      if ([301,302,303,307,308].includes(r.statusCode) && r.headers.location) {
        r.resume();
        const next = r.headers.location.startsWith('http') ? r.headers.location : `${parsed.protocol}//${parsed.hostname}${r.headers.location}`;
        return fetchText(next, timeoutMs, [..._chain, currentHop]).then(resolve);
      }
      let data = '';
      r.on('data', c => { if (data.length < 50000) data += c; });
      r.on('end', () => resolve({ text: data, status: r.statusCode, headers: r.headers, redirectChain: _chain }));
      r.on('error', () => resolve(null));
    });
    request.on('error', () => resolve(null));
    request.setTimeout(timeoutMs, () => { request.destroy(); resolve(null); });
    request.end();
  });

  // ── Certificate Transparency log lookup (CertSpotter) ─────────────────────
  const fetchCertSpotter = (domainName) =>
    fetchJSON(`https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domainName)}&include_subdomains=true&expand=dns_names`, {}, 8000);

  // ── Parse homepage HTML ───────────────────────────────────────────────────
  const analyseHomepage = (htmlResult, clean) => {
    if (!htmlResult?.text) return undefined;
    const html = htmlResult.text;
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim().slice(0, 200) || undefined;
    const generator = (html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)?.[1]
                    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']generator["']/i)?.[1])
                    ?.trim() || undefined;
    const hrefMatches = [...html.matchAll(/(?:href|src)=["'](https?:\/\/[^"']+)["']/gi)].map(m => m[1]);
    const seen = new Set();
    const externalLinks = [];
    for (const link of hrefMatches) {
      try {
        const host = new URL(link).hostname.toLowerCase();
        if (host === clean || host.endsWith(`.${clean}`)) continue;
        if (seen.has(host)) continue;
        seen.add(host);
        externalLinks.push(host);
      } catch { /* ignore */ }
    }
    // Extract JS script src URLs (same-origin, for bundle scanning)
    const scriptSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
      .map(m => m[1])
      .filter(s => s.endsWith('.js') && !s.includes('node_modules'))
      .slice(0, 8);

    // Extract WebSocket URLs from inline scripts and src attributes
    const wsUrls = [...html.matchAll(/["'`](wss?:\/\/[^"'`\s]+)["'`]/gi)].map(m => m[1]);

    return {
      title, generator,
      externalDomains: externalLinks.slice(0, 25),
      externalDomainCount: externalLinks.length,
      htmlSnippet: html.slice(0, 500),
      scriptSrcs,
      wsUrls: wsUrls.length ? wsUrls.slice(0, 10) : undefined,
    };
  };

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

  // ── CORS misconfiguration test ────────────────────────────────────────────
  const fetchCORSTest = (hostname) => new Promise((resolve) => {
    const req2 = https.request(
      { hostname, path: '/', method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)', 'Origin': 'https://evil-cors-test.com', 'Connection': 'close' } },
      (r) => {
        r.resume();
        const acao = (r.headers['access-control-allow-origin'] || '').trim();
        const acac = (r.headers['access-control-allow-credentials'] || '').trim().toLowerCase();
        resolve({
          allowOrigin: acao || null,
          allowCredentials: acac || null,
          wildcardCORS: acao === '*',
          reflectedCORS: acao === 'https://evil-cors-test.com',
          credentialedReflect: acao === 'https://evil-cors-test.com' && acac === 'true',
        });
      }
    );
    req2.on('error', () => resolve(null));
    req2.setTimeout(8000, () => { req2.destroy(); resolve(null); });
    req2.end();
  });

  // ── HTTP methods audit ────────────────────────────────────────────────────
  // Sends OPTIONS to discover allowed methods. TRACE and PUT/DELETE without
  // auth are critical security issues.
  const auditHTTPMethods = (hostname) => new Promise((resolve) => {
    const req2 = https.request(
      { hostname, path: '/', method: 'OPTIONS',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)', Connection: 'close' } },
      (r) => {
        r.resume();
        const allow = r.headers['allow'] || r.headers['access-control-allow-methods'] || '';
        const methods = allow.toUpperCase().split(/[\s,]+/).map(m => m.trim()).filter(Boolean);
        resolve({
          raw: allow || null,
          methods,
          traceEnabled:  methods.includes('TRACE'),
          putEnabled:    methods.includes('PUT'),
          deleteEnabled: methods.includes('DELETE'),
          connectEnabled: methods.includes('CONNECT'),
          dangerousMethods: methods.filter(m => ['TRACE','PUT','DELETE','CONNECT'].includes(m)),
        });
      }
    );
    req2.on('error', () => resolve(null));
    req2.setTimeout(6000, () => { req2.destroy(); resolve(null); });
    req2.end();
  });

  // ── Open redirect test ────────────────────────────────────────────────────
  // Tests common redirect params for reflection. A 3xx with Location echoing
  // the injected URL = open redirect vulnerability.
  const testOpenRedirect = (hostname) => {
    const target = 'https://evil-redirect-test.com';
    const params = ['next', 'url', 'redirect', 'return', 'goto', 'redir', 'destination', 'target'];
    const checks = params.map(param => new Promise((resolve) => {
      const path = `/?${param}=${encodeURIComponent(target)}`;
      const req2 = https.request(
        { hostname, path, method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)', Connection: 'close' } },
        (r) => {
          r.resume();
          const location = r.headers['location'] || '';
          if ([301,302,303,307,308].includes(r.statusCode) && location.includes('evil-redirect-test.com')) {
            resolve({ param, redirectsTo: location, status: r.statusCode });
          } else {
            resolve(null);
          }
        }
      );
      req2.on('error', () => resolve(null));
      req2.setTimeout(5000, () => { req2.destroy(); resolve(null); });
      req2.end();
    }));
    return Promise.all(checks).then(results => {
      const found = results.filter(Boolean);
      return found.length ? { vulnerable: true, findings: found } : { vulnerable: false };
    });
  };

  // ── Path traversal probe ──────────────────────────────────────────────────
  // Tests whether the server leaks filesystem content via encoded path traversal.
  const testPathTraversal = (hostname) => {
    const payloads = [
      '/../../../etc/passwd',
      '/..%2F..%2F..%2Fetc%2Fpasswd',
      '/%2e%2e/%2e%2e/%2e%2e/etc/passwd',
      '/....//....//etc/passwd',
    ];
    const checks = payloads.map(path => new Promise((resolve) => {
      const req2 = https.request(
        { hostname, path, method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)', Connection: 'close' } },
        (r) => {
          let data = '';
          r.on('data', c => { if (data.length < 2000) data += c; });
          r.on('end', () => {
            // Classic Unix passwd file signature
            const leaked = r.statusCode === 200 && /root:[^:]*:[0-9]/.test(data);
            resolve(leaked ? { payload: path, status: r.statusCode } : null);
          });
          r.on('error', () => resolve(null));
        }
      );
      req2.on('error', () => resolve(null));
      req2.setTimeout(5000, () => { req2.destroy(); resolve(null); });
      req2.end();
    }));
    return Promise.all(checks).then(results => {
      const found = results.filter(Boolean);
      return found.length ? { vulnerable: true, findings: found } : { vulnerable: false };
    });
  };

  // ── JS bundle secret scanner ──────────────────────────────────────────────
  // Fetches up to 5 JS files from the page and scans for hardcoded secrets.
  // Patterns cover the most common leaked credential types.
  const SECRET_PATTERNS = [
    { name: 'Supabase Anon Key',    regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}/g },
    { name: 'Supabase Service Role',regex: /supabase[^"'\s]*service[_-]?role[^"'\s]*/gi },
    { name: 'Stripe Secret Key',    regex: /sk_live_[A-Za-z0-9]{24,}/g },
    { name: 'Stripe Publishable',   regex: /pk_live_[A-Za-z0-9]{24,}/g },
    { name: 'AWS Access Key',       regex: /AKIA[0-9A-Z]{16}/g },
    { name: 'AWS Secret Key',       regex: /aws[_\-\s]?secret[^"'\s]{0,20}["'\s:=]+[A-Za-z0-9\/+]{40}/gi },
    { name: 'Firebase API Key',     regex: /AIza[0-9A-Za-z_-]{35}/g },
    { name: 'Firebase Config',      regex: /firebaseConfig\s*=\s*\{[^}]{50,}/g },
    { name: 'GitHub Token',         regex: /gh[pousr]_[A-Za-z0-9]{36,}/g },
    { name: 'Generic API Key',      regex: /['"`]?(?:api[_-]?key|apikey|api_token)['"` ]?\s*[:=]\s*['"`]([A-Za-z0-9_\-]{20,})['"`]/gi },
    { name: 'Generic Secret',       regex: /['"`]?(?:secret|private[_-]?key|client[_-]?secret)['"` ]?\s*[:=]\s*['"`]([A-Za-z0-9_\-]{16,})['"`]/gi },
    { name: 'SendGrid Key',         regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g },
    { name: 'Twilio Account SID',   regex: /AC[a-z0-9]{32}/g },
    { name: 'Mailchimp API Key',     regex: /[0-9a-f]{32}-us[0-9]{1,2}/g },
    { name: 'Hardcoded Password',   regex: /['"`]?password['"`]?\s*[:=]\s*['"`]([^'"`\s]{8,})['"`]/gi },
  ];

  // Internal IP patterns — should never appear in client-side bundles
  const INTERNAL_IP_PATTERN = /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;
  const STAGING_URL_PATTERN  = /https?:\/\/(?:staging|stage|dev|test|uat|internal|localhost)[.\-/][^\s"'`]{3,60}/gi;

  const scanJSBundle = async (hostname, scriptSrc) => {
    // Resolve relative URLs
    let url = scriptSrc;
    if (scriptSrc.startsWith('//')) url = `https:${scriptSrc}`;
    else if (scriptSrc.startsWith('/')) url = `https://${hostname}${scriptSrc}`;
    else if (!scriptSrc.startsWith('http')) url = `https://${hostname}/${scriptSrc}`;

    // Only fetch from same origin
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.endsWith(clean) && parsed.hostname !== clean) return null;
    } catch { return null; }

    return new Promise((resolve) => {
      const req2 = https.request(
        { hostname: new URL(url).hostname, path: new URL(url).pathname + new URL(url).search, method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)', Connection: 'close' } },
        (r) => {
          let data = '';
          r.on('data', c => { if (data.length < 500000) data += c; }); // cap at 500KB
          r.on('end', () => {
            if (r.statusCode !== 200) return resolve(null);
            const findings = [];
            for (const { name, regex } of SECRET_PATTERNS) {
              regex.lastIndex = 0;
              const matches = [...data.matchAll(regex)].slice(0, 3);
              for (const match of matches) {
                const raw = match[0].slice(0, 120);
                // Skip obvious placeholders
                if (/your[_-]?key|example|placeholder|xxxx|1234|test|demo/i.test(raw)) continue;
                findings.push({ type: name, snippet: raw });
              }
            }
            // Internal IP leak
            const ips = [...new Set([...data.matchAll(INTERNAL_IP_PATTERN)].map(m => m[1]))];
            if (ips.length) findings.push({ type: 'Internal IP Address', snippet: ips.slice(0, 5).join(', ') });
            // Staging URL leak
            const stagingUrls = [...new Set([...data.matchAll(STAGING_URL_PATTERN)].map(m => m[0]))];
            if (stagingUrls.length) findings.push({ type: 'Staging/Dev URL', snippet: stagingUrls.slice(0, 3).join(', ') });

            resolve(findings.length ? { src: scriptSrc, findings } : null);
          });
          r.on('error', () => resolve(null));
        }
      );
      req2.on('error', () => resolve(null));
      req2.setTimeout(7000, () => { req2.destroy(); resolve(null); });
      req2.end();
    });
  };

  // ── Supabase-specific checks ──────────────────────────────────────────────
  // If a Supabase URL is detected in the page, probe storage and check JWT type.
  const checkSupabase = async (html) => {
    if (!html) return undefined;

    // Extract Supabase project URL
    const projectMatch = html.match(/https:\/\/([a-z0-9]{20})\.supabase\.co/i);
    if (!projectMatch) return undefined;

    const projectUrl = projectMatch[0];
    const projectId  = projectMatch[1];

    // Check for service_role key (should NEVER be in client-side code)
    const jwtMatches = [...html.matchAll(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)];
    let serviceRoleKeyFound = false;
    const keyTypes = [];
    for (const m of jwtMatches) {
      try {
        const payload = JSON.parse(Buffer.from(m[0].split('.')[1], 'base64').toString());
        const role = payload?.role ?? payload?.aud ?? '';
        keyTypes.push(role);
        if (role === 'service_role') serviceRoleKeyFound = true;
      } catch { /* ignore malformed JWT */ }
    }

    // Probe public storage bucket listing
    const bucketProbe = await fetchJSON(`${projectUrl}/storage/v1/bucket`, {}, 5000);
    const publicBuckets = bucketProbe.ok && Array.isArray(bucketProbe.data)
      ? bucketProbe.data.filter(b => b.public).map(b => b.name) : [];

    return {
      projectId,
      projectUrl,
      serviceRoleKeyFound,
      keyTypes: [...new Set(keyTypes)],
      publicStorageBuckets: publicBuckets,
      publicBucketCount: publicBuckets.length,
    };
  };

  // ── Reflected XSS test ────────────────────────────────────────────────────
  // Injects payloads into common GET params and checks if they're echoed back
  // unescaped. Uses safe, non-executing markers (no alert() calls).
  const testReflectedXSS = (hostname) => {
    const marker  = 'XSSTEST9x7z';
    const payloads = [
      `<${marker}>`,
      `">${marker}<"`,
      `'>${marker}<'`,
    ];
    const params = ['q', 'search', 'id', 'query', 'term', 's', 'keyword'];
    const checks = [];
    for (const param of params) {
      for (const payload of payloads) {
        checks.push(new Promise((resolve) => {
          const path = `/?${param}=${encodeURIComponent(payload)}`;
          const req2 = https.request(
            { hostname, path, method: 'GET',
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)', Connection: 'close' } },
            (r) => {
              let data = '';
              r.on('data', c => { if (data.length < 20000) data += c; });
              r.on('end', () => {
                // Check if our marker was reflected without encoding
                if (r.statusCode === 200 && data.includes(marker) && data.includes('<' + marker + '>')) {
                  resolve({ param, payload, status: r.statusCode });
                } else {
                  resolve(null);
                }
              });
              r.on('error', () => resolve(null));
            }
          );
          req2.on('error', () => resolve(null));
          req2.setTimeout(5000, () => { req2.destroy(); resolve(null); });
          req2.end();
        }));
      }
    }
    return Promise.all(checks).then(results => {
      const found = results.filter(Boolean);
      return found.length ? { vulnerable: true, findings: found.slice(0, 5) } : { vulnerable: false };
    });
  };

  // ── Login form detection ──────────────────────────────────────────────────
  // Detects login forms and checks for security weaknesses:
  // POST vs GET method, CSRF token presence, user enumeration, rate limiting.
  const auditLoginForm = async (hostname, html) => {
    if (!html) return undefined;

    // Look for password input — strong indicator of a login form
    if (!/type=["']password["']/i.test(html)) return undefined;

    // Try common login paths if not on homepage
    const loginPaths = ['/', '/login', '/signin', '/auth', '/account/login', '/user/login', '/wp-login.php'];
    let loginHtml = html;
    let loginPath = '/';

    if (!/action=["'][^"']*["']\s[^>]*type=["']password["']|type=["']password["'][^>]*>/i.test(html)) {
      for (const p of loginPaths.slice(1)) {
        const r = await fetchText(`https://${hostname}${p}`, 5000);
        if (r?.status === 200 && /type=["']password["']/i.test(r.text || '')) {
          loginHtml = r.text;
          loginPath = p;
          break;
        }
      }
    }
    if (!loginHtml) return undefined;

    // Parse form attributes
    const formMatch = loginHtml.match(/<form[^>]*action=["']?([^"'\s>]*)["']?[^>]*>([\s\S]*?)<\/form>/i);
    const formAction  = formMatch?.[1] || '/';
    const formMethod  = (loginHtml.match(/<form[^>]*method=["']?(\w+)["']?/i)?.[1] || 'GET').toUpperCase();
    const hasCSRF     = /csrf|_token|authenticity_token|nonce/i.test(loginHtml);
    const hasCaptcha  = /captcha|recaptcha|hcaptcha|turnstile/i.test(loginHtml);

    // Probe for user enumeration: submit a known-bad username and check response length/content
    const enumProbe = await new Promise((resolve) => {
      const body = 'username=nonexistent_user_enum_test@example.com&password=WrongPass123!';
      const req2 = https.request(
        { hostname, path: formAction.startsWith('/') ? formAction : `/${formAction}`, method: 'POST',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)', 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), Connection: 'close' } },
        (r) => {
          let data = '';
          r.on('data', c => { if (data.length < 5000) data += c; });
          r.on('end', () => {
            const userNotFound = /user not found|no account|email.*not.*exist|does not exist/i.test(data);
            const wrongPassword = /wrong password|incorrect password|invalid password/i.test(data);
            resolve({
              status: r.statusCode,
              userEnumeration: userNotFound, // leaks whether user exists
              wrongPasswordMsg: wrongPassword,
            });
          });
          r.on('error', () => resolve(null));
        }
      );
      req2.on('error', () => resolve(null));
      req2.setTimeout(6000, () => { req2.destroy(); resolve(null); });
      req2.write(body);
      req2.end();
    });

    return {
      loginPath,
      formMethod,
      formUsesGET: formMethod === 'GET',
      hasCSRFToken: hasCSRF,
      hasCaptcha,
      userEnumeration: enumProbe?.userEnumeration ?? null,
      probeStatus: enumProbe?.status ?? null,
    };
  };

  // ── TLS handshake for live certificate ───────────────────────────────────
  const fetchSSLDirect = (hostname) => new Promise((resolve) => {
    try {
      const socket = tls.connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: false }, () => {
        try {
          const cert = socket.getPeerCertificate(true);
          socket.destroy();
          if (!cert || !cert.subject) return resolve(null);
          const validToDate = cert.valid_to ? new Date(cert.valid_to) : null;
          const daysUntilExpiry = validToDate ? Math.floor((validToDate - new Date()) / 86400000) : undefined;
          resolve({
            subject:        cert.subject?.CN ?? cert.subject?.O ?? undefined,
            issuer:         cert.issuer?.O   ?? cert.issuer?.CN ?? undefined,
            validFrom:      cert.valid_from  ? new Date(cert.valid_from).toDateString() : undefined,
            validTo:        cert.valid_to    ? new Date(cert.valid_to).toDateString()   : undefined,
            valid:          cert.valid_to    ? new Date(cert.valid_to) > new Date()     : undefined,
            daysUntilExpiry,
            expiringSoon:   daysUntilExpiry !== undefined && daysUntilExpiry >= 0 && daysUntilExpiry < 30,
            selfSigned:     !!(cert.issuer?.CN && cert.subject?.CN && cert.issuer.CN === cert.subject.CN),
            sans:           cert.subjectaltname ? cert.subjectaltname.replace(/DNS:/g,'').split(', ').slice(0,10) : undefined,
            serialNumber:   cert.serialNumber ?? undefined,
            fingerprint:    cert.fingerprint  ?? undefined,
          });
        } catch { socket.destroy(); resolve(null); }
      });
      socket.on('error', () => resolve(null));
      socket.setTimeout(8000, () => { socket.destroy(); resolve(null); });
    } catch { resolve(null); }
  });

  // ── IP geolocation via ip-api.com ─────────────────────────────────────────
  const fetchGeo = (target) => new Promise((resolve) => {
    const req3 = http.get(
      `http://ip-api.com/json/${encodeURIComponent(target)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,hosting,proxy,mobile,query`,
      (r) => { let d = ''; r.on('data', c => { d += c; }); r.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } }); r.on('error', () => resolve(null)); }
    );
    req3.on('error', () => resolve(null));
    req3.setTimeout(8000, () => { req3.destroy(); resolve(null); });
  });

  // ── WHOIS via RDAP ────────────────────────────────────────────────────────
  const fetchWHOIS = async (domainName) => {
    const lastTld = domainName.split('.').pop();
    const sources = [
      `https://rdap.org/domain/${domainName}`,
      `https://rdap.iana.org/domain/${domainName}`,
      lastTld === 'com' ? `https://rdap.verisign.com/com/v1/domain/${domainName}` : null,
      lastTld === 'net' ? `https://rdap.verisign.com/net/v1/domain/${domainName}` : null,
      lastTld === 'org' ? `https://rdap.publicinterestregistry.org/rdap/domain/${domainName}` : null,
      lastTld === 'uk'  ? `https://rdap.nominet.uk/uk/domain/${domainName}` : null,
      lastTld === 'my'  ? `https://rdap.mynic.my/rdap/domain/${domainName}` : null,
      lastTld === 'my'  ? `https://www.mynic.my/rdap/domain/${domainName}` : null,
    ].filter(Boolean);
    for (const url of sources) {
      const r = await fetchJSON(url, {}, 8000);
      if (r.ok && r.data && (r.data.ldhName || r.data.handle || r.data.events)) return r.data;
    }
    return null;
  };

  // ── Port scanner — 20 ports including dangerous services ──────────────────
  const scanPorts = (hostname, ports) => {
    const checks = ports.map(port => new Promise((resolve) => {
      const socket = net.createConnection({ host: hostname, port, timeout: 3000 }, () => { socket.destroy(); resolve(port); });
      socket.on('error', () => resolve(null));
      socket.on('timeout', () => { socket.destroy(); resolve(null); });
    }));
    return Promise.all(checks).then(results => results.filter(Boolean));
  };
  const DANGEROUS_PORTS = new Set([6379, 27017, 5432, 5900, 9200, 2375, 5984, 11211, 4444]);
  const PORT_LABELS = {
    21: 'FTP', 22: 'SSH', 25: 'SMTP', 80: 'HTTP', 443: 'HTTPS',
    3000: 'Dev server', 3306: 'MySQL', 3389: 'RDP', 6379: 'Redis (no auth by default)',
    27017: 'MongoDB (no auth by default)', 5432: 'PostgreSQL', 5900: 'VNC remote desktop',
    9200: 'Elasticsearch (no auth by default)', 2375: 'Docker API (unauthenticated)',
    5984: 'CouchDB', 11211: 'Memcached (DDoS amplification risk)',
    4444: 'Metasploit default / suspicious', 8080: 'HTTP alt', 8443: 'HTTPS alt', 8888: 'Jupyter/dev',
  };

  // ── Parse cookies ─────────────────────────────────────────────────────────
  const parseCookies = (headers) => {
    const raw = headers?.['set-cookie'];
    if (!raw) return undefined;
    const list = Array.isArray(raw) ? raw : [raw];
    return list.map(cookie => {
      const parts = cookie.split(';').map(s => s.trim());
      const [nameVal, ...attrs] = parts;
      const [name] = nameVal.split('=');
      const attrMap = Object.fromEntries(attrs.map(a => { const [k,...v] = a.split('='); return [k.toLowerCase(), v.join('=') || true]; }));
      return { name: name?.trim(), secure: !!attrMap['secure'], httpOnly: !!attrMap['httponly'], sameSite: attrMap['samesite'], path: attrMap['path'], expires: attrMap['expires'], maxAge: attrMap['max-age'] };
    });
  };

  // ── DKIM check ────────────────────────────────────────────────────────────
  const checkDKIM = async (domainName) => {
    const selectors = ['default','google','mail','dkim','k1','selector1','selector2','smtp','mailjet','sendgrid','mailchimp','mandrill'];
    const results = await Promise.all(selectors.map(async (sel) => {
      const r = await fetchDNS(`${sel}._domainkey.${domainName}`, 'TXT');
      const records = parseDNS(r);
      if (!records?.length) return null;
      const rec = records.find(r => r.includes('v=DKIM1') || r.includes('k=rsa') || r.includes('p='));
      if (!rec) return null;
      return { selector: sel, record: rec.replace(/^"|"$/g, '').trim() };
    }));
    const found = results.filter(Boolean);
    return { configured: found.length > 0, selectors: found, selectorCount: found.length };
  };

  // ── Exposed sensitive file probe ──────────────────────────────────────────
  const probeExposedFiles = async (hostname) => {
    const targets = [
      { path: '/.env',              label: '.env (environment secrets)' },
      { path: '/.git/config',       label: '.git/config (source repository)' },
      { path: '/wp-config.php.bak', label: 'wp-config.php.bak (WordPress backup)' },
      { path: '/phpinfo.php',       label: 'phpinfo.php (PHP configuration)' },
      { path: '/.DS_Store',         label: '.DS_Store (macOS directory listing)' },
      { path: '/backup.zip',        label: 'backup.zip (site backup archive)' },
      { path: '/config.json',       label: 'config.json (application config)' },
      { path: '/.env.local',        label: '.env.local (local env secrets)' },
      { path: '/.env.production',   label: '.env.production (production secrets)' },
      { path: '/server.js',         label: 'server.js (exposed server code)' },
    ];
    const checks = targets.map(({ path, label }) => new Promise((resolve) => {
      const req2 = https.request(
        { hostname, path, method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)', Connection: 'close' } },
        (r) => { r.resume(); resolve(r.statusCode === 200 ? { path, label, status: r.statusCode } : null); }
      );
      req2.on('error', () => resolve(null));
      req2.setTimeout(5000, () => { req2.destroy(); resolve(null); });
      req2.end();
    }));
    return (await Promise.all(checks)).filter(Boolean);
  };

  // ── Dangling CNAME detection ──────────────────────────────────────────────
  const DANGLING_PROVIDERS = [
    { pattern: 'github.io', name: 'GitHub Pages' }, { pattern: 'herokuapp.com', name: 'Heroku' },
    { pattern: 'azurewebsites.net', name: 'Azure Web Apps' }, { pattern: 'cloudfront.net', name: 'AWS CloudFront' },
    { pattern: 'fastly.net', name: 'Fastly CDN' }, { pattern: 'ghost.io', name: 'Ghost.io' },
    { pattern: 'netlify.app', name: 'Netlify' }, { pattern: 'vercel.app', name: 'Vercel' },
    { pattern: 'surge.sh', name: 'Surge.sh' }, { pattern: 'bitbucket.io', name: 'Bitbucket Pages' },
    { pattern: 'shopify.com', name: 'Shopify' }, { pattern: 'squarespace.com', name: 'Squarespace' },
    { pattern: 'unbounce.com', name: 'Unbounce' }, { pattern: 'wpengine.com', name: 'WP Engine' },
    { pattern: 'pantheonsite.io', name: 'Pantheon' }, { pattern: 'acquia-sites.com', name: 'Acquia' },
    { pattern: 'readthedocs.io', name: 'ReadTheDocs' }, { pattern: 'strikingly.com', name: 'Strikingly' },
    { pattern: 'webflow.io', name: 'Webflow' }, { pattern: 'smugmug.com', name: 'SmugMug' },
  ];
  const analyseDanglingCNAMEs = (cnameRecords) => {
    if (!cnameRecords?.length) return undefined;
    const risky = [];
    for (const cname of cnameRecords) {
      for (const { pattern, name } of DANGLING_PROVIDERS) {
        if (cname.toLowerCase().includes(pattern)) { risky.push({ cname, provider: name, risk: 'potential_takeover' }); break; }
      }
    }
    return risky.length ? risky : undefined;
  };

  // ── Email security analysis ───────────────────────────────────────────────
  const analyseEmailSecurity = (txtRecords, dmarcTxtRecords, dkimResult) => {
    if (!txtRecords && !dmarcTxtRecords) return undefined;
    const flat      = (txtRecords      || []).map(t => t.replace(/^"|"$/g, '').trim());
    const flatDmarc = (dmarcTxtRecords || []).map(t => t.replace(/^"|"$/g, '').trim());
    const spf   = flat.find(t => t.startsWith('v=spf1')) ?? null;
    const dmarc = flatDmarc.find(t => t.startsWith('v=DMARC1')) ?? flat.find(t => t.startsWith('v=DMARC1')) ?? null;
    let spfStrength = 'none';
    if (spf) {
      if (/-all/i.test(spf)) spfStrength = 'hard_fail';
      else if (/~all/i.test(spf)) spfStrength = 'soft_fail';
      else if (/[?]all/i.test(spf)) spfStrength = 'neutral';
      else if (/[+]all/i.test(spf)) spfStrength = 'pass_all';
      else spfStrength = 'unknown';
    }
    let dmarcPolicy = 'none';
    if (dmarc) { const m = dmarc.match(/p=(none|quarantine|reject)/i); dmarcPolicy = m ? m[1].toLowerCase() : 'none'; }
    const dmarcPct   = (dmarc && dmarc.match(/pct=(\d+)/i))?.[1] ?? null;
    const dmarcSp    = (dmarc && dmarc.match(/sp=(none|quarantine|reject)/i))?.[1]?.toLowerCase() ?? null;
    const dmarcRua   = (dmarc && dmarc.match(/rua=([^;]+)/i))?.[1]?.trim() ?? null;
    const dmarcAdkim = (dmarc && dmarc.match(/adkim=([rs])/i))?.[1]?.toLowerCase() ?? null;
    const dmarcAspf  = (dmarc && dmarc.match(/aspf=([rs])/i))?.[1]?.toLowerCase() ?? null;
    const spfStrong = !!spf && spfStrength === 'hard_fail';
    const dmarcApexStrong = !!dmarc && ['quarantine','reject'].includes(dmarcPolicy);
    const dmarcSpPolicy = dmarcSp ?? dmarcPolicy;
    const dmarcSubStrong = ['quarantine','reject'].includes(dmarcSpPolicy);
    const dmarcStrong = dmarcApexStrong && dmarcSubStrong;
    const spoofable = !dmarcStrong;
    let spoofReason = '';
    if (!spf) spoofReason += 'No SPF record. ';
    else if (!spfStrong) spoofReason += `SPF uses "${spfStrength}" — weak. `;
    if (!dmarc) spoofReason += 'No DMARC record. ';
    else if (!dmarcApexStrong) spoofReason += `DMARC apex policy is "${dmarcPolicy}" — not enforced. `;
    else if (!dmarcSubStrong) spoofReason += `DMARC subdomain policy (sp=${dmarcSpPolicy}) — subdomains unprotected. `;
    return {
      spf, spfValid: !!spf, spfStrength, spfStrong,
      dmarc, dmarcValid: !!dmarc, dmarcPolicy, dmarcStrong,
      dmarcApexStrong, dmarcSubStrong, dmarcSpPolicy,
      dmarcPct: dmarcPct ?? undefined, dmarcSp: dmarcSp ?? undefined,
      dmarcRua: dmarcRua ?? undefined, dmarcAdkim: dmarcAdkim ?? undefined, dmarcAspf: dmarcAspf ?? undefined,
      spoofable, spoofReason: spoofReason.trim() || null, mxConfigured: true,
      dkim: dkimResult ?? undefined,
    };
  };

  // ── Security headers analysis ─────────────────────────────────────────────
  const analyseSecurityHeaders = (headers) => {
    if (!headers) return undefined;
    const h = Object.fromEntries(Object.entries(headers).map(([k,v]) => [k.toLowerCase(), v]));
    const cspValue = h['content-security-policy'] ?? undefined;
    let cspWeaknesses = undefined;
    if (cspValue) {
      const w = [];
      if (/unsafe-inline/i.test(cspValue))                  w.push('unsafe-inline');
      if (/unsafe-eval/i.test(cspValue))                    w.push('unsafe-eval');
      if (/(^|;)\s*script-src[^;]*\*/i.test(cspValue))      w.push('wildcard script-src');
      if (/(^|;)\s*default-src[^;]*\*/i.test(cspValue))     w.push('wildcard default-src');
      if (/(^|;)\s*script-src[^;]*data:/i.test(cspValue))   w.push('data: URI in script-src');
      if (w.length) cspWeaknesses = w;
    }
    const hstsValue = h['strict-transport-security'] ?? undefined;
    let hstsStrength = undefined;
    if (hstsValue) {
      const maxAgeMatch = hstsValue.match(/max-age=(\d+)/i);
      const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
      const includesSubdomains = /includeSubDomains/i.test(hstsValue);
      const preload = /preload/i.test(hstsValue);
      hstsStrength = { maxAge, includesSubdomains, preload, strong: maxAge >= 15552000 && includesSubdomains };
    }
    return {
      hsts: !!h['strict-transport-security'], hstsValue, hstsStrength,
      csp: !!h['content-security-policy'], cspValue, cspWeaknesses,
      xFrameOptions: h['x-frame-options'] ?? undefined,
      clickjackingProtected: !!(h['x-frame-options'] || /frame-ancestors/i.test(h['content-security-policy'] || '')),
      xContentTypeOpts: h['x-content-type-options'] ?? undefined,
      referrerPolicy: h['referrer-policy'] ?? undefined,
      permissionsPolicy: h['permissions-policy'] ?? undefined,
      server: h['server'] ?? undefined,
      poweredBy: h['x-powered-by'] ?? undefined,
      setCookieCount: Array.isArray(h['set-cookie']) ? h['set-cookie'].length : h['set-cookie'] ? 1 : 0,
    };
  };

  // ── WAF / CDN fingerprinting ──────────────────────────────────────────────
  const detectWAFAndCDN = (headers) => {
    if (!headers) return undefined;
    const h = Object.fromEntries(Object.entries(headers).map(([k,v]) => [k.toLowerCase(), String(v)]));
    const detected = new Set();
    if (h['x-sucuri-id'] || h['x-sucuri-cache'])               detected.add('Sucuri WAF');
    if (h['x-amz-cf-id'] || h['x-amz-request-id'])             detected.add('AWS CloudFront');
    if (h['x-fastly-request-id'])                               detected.add('Fastly CDN');
    if (h['x-iinfo'] || h['x-cdn'] === 'Imperva')              detected.add('Imperva / Incapsula WAF');
    if (h['x-akamai-transformed'] || h['x-akamai-request-id']) detected.add('Akamai CDN');
    if (h['server']?.toLowerCase().includes('cloudflare') || h['cf-ray'] || h['cf-cache-status']) detected.add('Cloudflare');
    if (h['x-azure-ref'])                                       detected.add('Azure Front Door');
    if (h['x-varnish'])                                         detected.add('Varnish Cache');
    if (h['x-cache']?.includes('Hit from cloudfront'))         detected.add('AWS CloudFront');
    if (h['x-cache']?.toLowerCase().includes('hit'))           detected.add('CDN Cache (generic)');
    if (h['x-vercel-id'])                                       detected.add('Vercel Edge');
    if (h['x-nf-request-id'])                                   detected.add('Netlify');
    if (h['via']?.toLowerCase().includes('squid'))              detected.add('Squid Proxy');
    if (h['server']?.toLowerCase().includes('ddos-guard'))      detected.add('DDoS-Guard');
    if (h['x-fw-hash'] || h['x-fw-type'])                      detected.add('Fortinet WAF');
    if (h['x-datadog-trace-id'])                                detected.add('Datadog APM');
    return detected.size ? [...detected] : undefined;
  };

  // ── Security score calculator (A–F, 0–100) ───────────────────────────────
  const calculateSecurityScore = (data) => {
    let score = 100;
    const deductions = [];
    const add = (severity, reason, pts) => { score -= pts; deductions.push({ severity, reason, points: pts }); };

    // SSL
    if (data.ssl?.valid === false)      add('CRITICAL', 'SSL certificate expired/invalid', 15);
    if (data.ssl?.expiringSoon)         add('CRITICAL', `SSL expires in ${data.ssl.daysUntilExpiry} days`, 10);
    if (data.ssl?.selfSigned)           add('HIGH',     'Self-signed SSL certificate', 8);
    if (!data.ssl)                      add('CRITICAL', 'No SSL/TLS', 15);

    // Exposed files
    if (data.exposedFiles?.length)      add('CRITICAL', `${data.exposedFiles.length} sensitive file(s) exposed`, 15);

    // Dangerous ports
    if (data.dangerousPorts?.length)    add('CRITICAL', `${data.dangerousPorts.length} dangerous port(s) open`, 15);

    // Dangling CNAMEs
    if (data.danglingCNAMEs?.length)    add('CRITICAL', 'Dangling CNAME(s) — takeover risk', 15);

    // JS secrets
    if (data.jsBundleSecrets?.length)   add('CRITICAL', `Secrets found in JS bundle(s)`, 15);

    // Supabase
    if (data.supabase?.serviceRoleKeyFound) add('CRITICAL', 'Supabase service_role key exposed client-side', 15);
    if (data.supabase?.publicBucketCount > 0) add('HIGH', `${data.supabase.publicBucketCount} public Supabase storage bucket(s)`, 8);

    // Active attacks
    if (data.reflectedXSS?.vulnerable)  add('HIGH',     'Reflected XSS vulnerability detected', 8);
    if (data.openRedirect?.vulnerable)  add('HIGH',     'Open redirect vulnerability detected', 8);
    if (data.pathTraversal?.vulnerable) add('CRITICAL', 'Path traversal vulnerability detected', 15);

    // CORS
    if (data.corsTest?.credentialedReflect) add('CRITICAL', 'CORS reflects Origin + credentials', 15);
    else if (data.corsTest?.reflectedCORS)  add('HIGH',     'CORS reflects arbitrary Origin', 8);
    else if (data.corsTest?.wildcardCORS)   add('MEDIUM',   'CORS wildcard (*)', 3);

    // HTTP methods
    if (data.httpMethods?.traceEnabled)  add('HIGH',   'TRACE method enabled (XST risk)', 8);
    if (data.httpMethods?.putEnabled)    add('MEDIUM',  'PUT method enabled', 3);
    if (data.httpMethods?.deleteEnabled) add('MEDIUM',  'DELETE method enabled', 3);

    // Login form
    if (data.loginAudit?.formUsesGET)     add('HIGH',   'Login form uses GET (credentials in URL)', 8);
    if (data.loginAudit?.userEnumeration) add('MEDIUM',  'Login form leaks user existence', 3);
    if (data.loginAudit && !data.loginAudit.hasCSRFToken) add('HIGH', 'Login form missing CSRF token', 8);

    // Security headers
    if (!data.securityHeaders?.hsts)              add('HIGH',   'HSTS not set', 8);
    if (data.securityHeaders?.hstsStrength && !data.securityHeaders.hstsStrength.strong) add('MEDIUM', 'HSTS weak', 3);
    if (!data.securityHeaders?.csp)               add('HIGH',   'CSP missing', 8);
    if (data.securityHeaders?.cspWeaknesses?.length) add('MEDIUM', 'CSP has weaknesses', 3);
    if (!data.securityHeaders?.clickjackingProtected) add('MEDIUM', 'No clickjacking protection', 3);

    // Email
    if (data.emailSecurity) {
      if (!data.emailSecurity.spfValid)    add('HIGH',   'No SPF record', 8);
      else if (!data.emailSecurity.spfStrong) add('MEDIUM', 'SPF weak', 3);
      if (!data.emailSecurity.dmarcValid)  add('HIGH',   'No DMARC record', 8);
      else if (!data.emailSecurity.dmarcStrong) add('HIGH', 'DMARC not enforced', 8);
      if (data.emailSecurity.dkim && !data.emailSecurity.dkim.configured) add('MEDIUM', 'No DKIM configured', 3);
    }

    // Path traversal redirect chain
    if (data.redirectChain?.length > 3)   add('LOW',    'Long redirect chain (3+ hops)', 1);

    score = Math.max(0, score);
    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
    return { score, grade, deductions };
  };

  try {
    // ── Phase 1: DNS + SSL + headers + CORS + HTTP methods (parallel) ────
    const [dnsA, dnsAAAA, dnsMX, dnsNS, dnsTXT, dnsCNAME, dnsSOA, headerResult, sslDirect, dnsDMARC, corsResult, httpMethodsResult] = await Promise.all([
      fetchDNS(clean, 'A'),
      fetchDNS(clean, 'AAAA'),
      fetchDNS(clean, 'MX'),
      fetchDNS(clean, 'NS'),
      fetchDNS(clean, 'TXT'),
      fetchDNS(clean, 'CNAME'),
      fetchDNS(clean, 'SOA'),
      fetchHeaders(clean),
      fetchSSLDirect(clean),
      fetchDNS(`_dmarc.${clean}`, 'TXT'),
      fetchCORSTest(clean),
      auditHTTPMethods(clean),
    ]);

    const aRecords     = parseDNS(dnsA);
    const aaaaRecords  = parseDNS(dnsAAAA);
    const mxRecords    = parseDNS(dnsMX);
    const nsRecords    = parseDNS(dnsNS);
    const txtRecords   = parseDNS(dnsTXT);
    const cnameRecords = parseDNS(dnsCNAME);
    const soaRecords   = parseDNS(dnsSOA);
    const dmarcRecords = parseDNS(dnsDMARC);
    const resolvedIP   = aRecords?.[0] ?? clean;

    // ── Phase 2: Geo + WHOIS + content + ports + CT log + active tests ───
    const [
      geoData, whoisData, robotsResult, sitemapResult,
      openPorts, certSpotterResult, homepageResult,
      exposedFiles, dkimResult, openRedirectResult, pathTraversalResult, xssResult,
    ] = await Promise.all([
      fetchGeo(resolvedIP),
      fetchWHOIS(clean),
      fetchText(`https://${clean}/robots.txt`),
      fetchText(`https://${clean}/sitemap.xml`),
      scanPorts(clean, [21,22,25,80,443,3306,3389,6379,27017,5432,5900,9200,2375,5984,11211,4444,8080,8443,8888,3000]),
      fetchCertSpotter(clean),
      fetchText(`https://${clean}/`),
      probeExposedFiles(clean),
      checkDKIM(clean),
      testOpenRedirect(clean),
      testPathTraversal(clean),
      testReflectedXSS(clean),
    ]);

    const homepage = analyseHomepage(homepageResult, clean);
    const html = homepageResult?.text || '';

    // ── Phase 3: JS bundle scanning + Supabase + login audit (parallel) ──
    const scriptSrcs = homepage?.scriptSrcs || [];
    const [jsBundleResults, supabaseResult, loginAuditResult] = await Promise.all([
      Promise.all(scriptSrcs.map(src => scanJSBundle(clean, src))),
      checkSupabase(html),
      auditLoginForm(clean, html),
    ]);

    const jsBundleSecrets = jsBundleResults.filter(Boolean);

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
      const registrarEntity  = (whoisData.entities||[]).find(e => (e.roles||[]).includes('registrar'));
      const registrar        = registrarEntity?.vcardArray?.[1]?.find(v=>v[0]==='fn')?.[3] ?? registrarEntity?.publicIds?.[0]?.identifier ?? undefined;
      const created = whoisData.events?.find(e => e.eventAction==='registration')?.eventDate;
      const expires = whoisData.events?.find(e => e.eventAction==='expiration')?.eventDate;
      const updated = whoisData.events?.find(e => e.eventAction==='last changed')?.eventDate;
      const registrantEntity = (whoisData.entities||[]).find(e => (e.roles||[]).includes('registrant'));
      const owner = registrantEntity?.vcardArray?.[1]?.find(v=>v[0]==='fn')?.[3] ?? registrantEntity?.vcardArray?.[1]?.find(v=>v[0]==='org')?.[3] ?? undefined;
      merged.whois = {
        registrar: registrar ?? undefined,
        registeredOn: created ? new Date(created).toDateString() : undefined,
        expiresOn:    expires ? new Date(expires).toDateString() : undefined,
        updatedOn:    updated ? new Date(updated).toDateString() : undefined,
        owner: owner ?? undefined,
        status: Array.isArray(whoisData.status) ? whoisData.status.join(', ') : undefined,
        nameservers: (whoisData.nameservers||[]).map(ns=>ns.ldhName).filter(Boolean),
      };
    }

    // SSL
    merged.ssl = sslDirect ?? undefined;

    // DNS
    if (aRecords||aaaaRecords||mxRecords||nsRecords||txtRecords||cnameRecords) {
      merged.dns = { A: aRecords, AAAA: aaaaRecords, MX: mxRecords, NS: nsRecords, TXT: txtRecords, CNAME: cnameRecords, SOA: soaRecords };
    }

    // Dangling CNAMEs
    const danglingCNAMEs = analyseDanglingCNAMEs(cnameRecords);
    if (danglingCNAMEs) merged.danglingCNAMEs = danglingCNAMEs;

    // HTTP status + headers
    if (headerResult.status) { merged.status = headerResult.status; merged.headers = headerResult.headers; }

    // Redirect chain (from homepage fetch)
    if (homepageResult?.redirectChain?.length) {
      merged.redirectChain = [...homepageResult.redirectChain, { url: `https://${clean}/`, status: homepageResult.status }];
    }

    // Security headers
    const secHeaders = analyseSecurityHeaders(headerResult.headers);
    if (secHeaders) merged.securityHeaders = secHeaders;

    // CORS
    if (corsResult) merged.corsTest = corsResult;

    // HTTP methods
    if (httpMethodsResult) merged.httpMethods = httpMethodsResult;

    // Cookies
    const cookies = parseCookies(headerResult.headers);
    if (cookies?.length) merged.cookies = cookies;

    // Open ports
    if (openPorts?.length) {
      merged.openPorts = openPorts;
      const dangerousPorts = openPorts.filter(p => DANGEROUS_PORTS.has(p));
      if (dangerousPorts.length) merged.dangerousPorts = dangerousPorts.map(p => ({ port: p, service: PORT_LABELS[p] ?? 'Unknown' }));
    }

    // Exposed files
    if (exposedFiles?.length) merged.exposedFiles = exposedFiles;

    // JS bundle secrets
    if (jsBundleSecrets.length) merged.jsBundleSecrets = jsBundleSecrets;

    // Supabase
    if (supabaseResult) merged.supabase = supabaseResult;

    // Active attack test results
    merged.openRedirect   = openRedirectResult;
    merged.pathTraversal  = pathTraversalResult;
    merged.reflectedXSS   = xssResult;

    // Login audit
    if (loginAuditResult) merged.loginAudit = loginAuditResult;

    // WAF / CDN
    const wafCdn = detectWAFAndCDN(headerResult.headers);

    // Technologies
    const tech = new Set();
    const hdr = headerResult.headers || {};
    if (hdr['x-powered-by']) tech.add(hdr['x-powered-by']);
    if (hdr.server) tech.add(hdr.server);
    if ((hdr.link||'').includes('_next')) tech.add('Next.js');
    if ((hdr.link||'').includes('wp-content')) tech.add('WordPress');
    if (hdr['x-middleware-rewrite']) tech.add('Next.js Middleware');
    if (wafCdn) wafCdn.forEach(w => tech.add(w));
    if (homepage?.generator) tech.add(homepage.generator);
    const htmlSignatures = [
      [/wp-content|wp-includes/i,'WordPress'],[/cdn\.shopify\.com|Shopify\.theme/i,'Shopify'],
      [/wix\.com|_wixCss/i,'Wix'],[/cdn\.prod\.website-files\.com/i,'Webflow'],
      [/joomla/i,'Joomla'],[/Drupal\.settings|\/sites\/default\//i,'Drupal'],
      [/Squarespace/i,'Squarespace'],[/ghost-url|content="Ghost"/i,'Ghost'],
      [/__NEXT_DATA__|_next\/static/i,'Next.js'],[/__NUXT__/i,'Nuxt.js'],
      [/data-reactroot|react-dom/i,'React'],[/ng-version=/i,'Angular'],
      [/cdn\.jsdelivr\.net\/npm\/vue|__VUE__/i,'Vue.js'],[/svelte/i,'Svelte'],
      [/astro-island|astro-root/i,'Astro'],[/gatsby/i,'Gatsby'],
      [/laravel_session|laravel/i,'Laravel'],[/django|csrfmiddlewaretoken/i,'Django'],
      [/rails|_rails_/i,'Ruby on Rails'],[/cloudflare/i,'Cloudflare'],
      [/__cf_bm|cf_clearance/i,'Cloudflare'],[/hs-scripts\.com|hubspot/i,'HubSpot'],
      [/gtag\/js|ga\.js/i,'Google Analytics'],[/segment\.com\/analytics/i,'Segment'],
      [/cdn\.intercom\.io/i,'Intercom'],[/sentry\.io|sentry_key/i,'Sentry'],
      [/js\.stripe\.com/i,'Stripe'],[/datadog-rum/i,'Datadog RUM'],
      [/bootstrap/i,'Bootstrap'],[/tailwindcss/i,'Tailwind CSS'],
      [/materialize/i,'Materialize CSS'],[/supabase/i,'Supabase'],
    ];
    for (const [pattern, name] of htmlSignatures) { if (pattern.test(html)) tech.add(name); }
    if (tech.size) merged.technologies = [...tech];

    // WebSocket URLs from homepage
    if (homepage?.wsUrls?.length) merged.webSockets = { found: true, urls: homepage.wsUrls };

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
    } else { merged.robots = { present: false }; }

    // Sitemap
    if (sitemapResult?.status === 200 && sitemapResult.text) {
      const urls = (sitemapResult.text.match(/<loc>(.*?)<\/loc>/g)||[]).map(m=>m.replace(/<\/?loc>/g,''));
      merged.sitemap = { present: true, urlCount: urls.length, sampleUrls: urls.slice(0, 10) };
    } else { merged.sitemap = { present: false }; }

    // Email security
    const emailSec = analyseEmailSecurity(txtRecords, dmarcRecords, dkimResult);
    if (emailSec) merged.emailSecurity = emailSec;

    // Certificate Transparency
    if (certSpotterResult.ok && Array.isArray(certSpotterResult.data)) {
      const names = new Set();
      for (const issuance of certSpotterResult.data) {
        for (const n of (issuance.dns_names || [])) names.add(String(n).toLowerCase().replace(/^\*\./, ''));
      }
      const subdomainNames = [...names].filter(n => n !== clean && n.endsWith(`.${clean}`));
      merged.certTransparency = { totalCertificates: certSpotterResult.data.length, uniqueNames: names.size, subdomainCount: subdomainNames.length, sampleSubdomains: subdomainNames.slice(0, 15) };
    } else { merged.certTransparency = { totalCertificates: 0, uniqueNames: 0, subdomainCount: 0 }; }

    // Homepage
    if (homepage) merged.homepage = homepage;

    // Carbon footprint estimate
    merged.carbonFootprint = { note: 'Estimated based on server location and hosting type', serverCountry: merged.location?.country ?? 'Unknown' };

    // Security score — computed last so it sees all findings
    merged.securityScore = calculateSecurityScore(merged);

    res.status(200).json(merged);

  } catch (err) {
    console.error('[WebCheck proxy] Error:', err.message);
    res.status(500).json({ error: `Web-check proxy error: ${err.message}` });
  }
};

const https = require('https');

// Give this function the maximum Vercel duration via config export
// (upgrade to Pro for maxDuration: 60 — on hobby this just sets intent)
module.exports.config = { maxDuration: 60 };

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

  // ── Generic HTTPS JSON fetcher ────────────────────────────────────────────
  const fetchJSON = (url, extraHeaders = {}, timeoutMs = 25000) => new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(url); } catch { return resolve({ ok: false, data: null }); }

    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)',
        Accept:       'application/json',
        Connection:   'close',
        ...extraHeaders,
      },
    };

    const request = https.request(options, (r) => {
      if ([301,302,303,307,308].includes(r.statusCode) && r.headers.location) {
        r.resume();
        const next = r.headers.location.startsWith('http')
          ? r.headers.location
          : `https://${parsed.hostname}${r.headers.location}`;
        return fetchJSON(next, extraHeaders, timeoutMs).then(resolve);
      }
      let data = '';
      r.on('data', c => { data += c; });
      r.on('end', () => {
        try { resolve({ ok: true, data: JSON.parse(data), status: r.statusCode }); }
        catch { resolve({ ok: false, data: null, status: r.statusCode }); }
      });
      r.on('error', () => resolve({ ok: false, data: null }));
    });

    request.on('error', () => resolve({ ok: false, data: null }));
    request.setTimeout(timeoutMs, () => { request.destroy(); resolve({ ok: false, data: null }); });
    request.end();
  });

  try {
    // Run both crt.sh queries in parallel — wildcard query + apex query
    // Wildcard (%.domain): finds certs issued directly for subdomains
    // Apex (domain):       finds certs where subdomains appear as SANs
    const [wildcardResult, apexResult] = await Promise.all([
      fetchJSON(`https://crt.sh/?q=%.${clean}&output=json`, { Accept: 'application/json' }, 25000),
      fetchJSON(`https://crt.sh/?q=${clean}&output=json`,   { Accept: 'application/json' }, 25000),
    ]);

    const allCerts = [
      ...(Array.isArray(wildcardResult.data) ? wildcardResult.data : []),
      ...(Array.isArray(apexResult.data)     ? apexResult.data     : []),
    ];

    if (allCerts.length === 0) {
      return res.status(200).json({ total: 0, active: 0, expired: 0, list: [] });
    }

    const seen    = new Set();
    const entries = [];

    for (const cert of allCerts) {
      // name_value holds newline-separated SANs; also check common_name
      const raw   = [cert.name_value || '', cert.common_name || ''].join('\n');
      const names = raw.split(/[\n,\s]+/);

      for (const name of names) {
        const n = name.trim().toLowerCase().replace(/^\*\./, ''); // strip wildcard prefix
        if (!n || n === clean || seen.has(n)) continue;
        if (!n.endsWith(`.${clean}`)) continue;
        seen.add(n);
        entries.push({
          subdomain: n,
          issuer:    cert.issuer_name ?? undefined,
          validTo:   cert.not_after ? new Date(cert.not_after).toDateString() : undefined,
          expired:   cert.not_after ? new Date(cert.not_after) < new Date()   : undefined,
        });
      }
    }

    // Deduplicate — keep the active cert entry over an expired one for the same subdomain
    const deduped = Object.values(
      entries.reduce((acc, s) => {
        if (!acc[s.subdomain] || (s.expired === false && acc[s.subdomain].expired !== false)) {
          acc[s.subdomain] = s;
        }
        return acc;
      }, {})
    );

    // Sort: active certs first, then alphabetically
    const sorted = deduped.sort((a, b) => {
      if (a.expired === false && b.expired !== false) return -1;
      if (b.expired === false && a.expired !== false) return  1;
      return a.subdomain.localeCompare(b.subdomain);
    });

    const active  = sorted.filter(s => s.expired === false).length;
    const expired = sorted.filter(s => s.expired === true).length;

    return res.status(200).json({
      total:   sorted.length,
      active,
      expired,
      list:    sorted.slice(0, 100),
    });

  } catch (err) {
    console.error('[Subdomains] Error:', err.message);
    return res.status(500).json({ error: `Subdomain lookup error: ${err.message}` });
  }
};

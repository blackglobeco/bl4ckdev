// Vercel max duration hint (Hobby plan: ~10s effective limit)
module.exports.config = { maxDuration: 60 };

// ── crt.sh source ─────────────────────────────────────────────────────────────
async function fetchCrtSh(clean) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const [wildcardRes, apexRes] = await Promise.all([
      fetch(`https://crt.sh/?q=%.${clean}&output=json`, {
        signal:  controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)' },
      }).catch(() => null),
      fetch(`https://crt.sh/?q=${clean}&output=json`, {
        signal:  controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)' },
      }).catch(() => null),
    ]);

    clearTimeout(timer);

    const parseSafe = async (r) => {
      if (!r || !r.ok) return [];
      try { return await r.json(); } catch { return []; }
    };

    const allCerts = [
      ...(await parseSafe(wildcardRes)),
      ...(await parseSafe(apexRes)),
    ];

    const seen    = new Set();
    const entries = [];

    for (const cert of allCerts) {
      const raw   = [cert.name_value || '', cert.common_name || ''].join('\n');
      const names = raw.split(/[\n,\s]+/);

      for (const name of names) {
        const n = name.trim().toLowerCase().replace(/^\*\./, '');
        if (!n || n === clean || seen.has(n)) continue;
        if (!n.endsWith(`.${clean}`)) continue;
        seen.add(n);
        entries.push({
          subdomain: n,
          issuer:    cert.issuer_name ?? undefined,
          validTo:   cert.not_after   ? new Date(cert.not_after).toDateString() : undefined,
          expired:   cert.not_after   ? new Date(cert.not_after) < new Date()   : undefined,
          source:    'crtsh',
        });
      }
    }

    console.log(`[crt.sh] Found ${entries.length} subdomains for ${clean}`);
    return entries;

  } catch (err) {
    console.warn('[crt.sh] Error:', err.message);
    return [];
  }
}

// ── HackerTarget source ───────────────────────────────────────────────────────
// Endpoint: https://api.hackertarget.com/hostsearch/?q=example.com
// Returns:  plain-text CSV  →  subdomain,ip  (one per line)
// Free tier: 100 req/day, no API key required
// Optional: pass HACKERTARGET_API_KEY env var to use authenticated tier
async function fetchHackerTarget(clean) {
  try {
    const apiKey  = process.env.HACKERTARGET_API_KEY || '';
    const keyParam = apiKey ? `&apikey=${encodeURIComponent(apiKey)}` : '';
    const url     = `https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(clean)}${keyParam}`;

    const res = await fetch(url, {
      signal:  AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)' },
    });

    if (!res.ok) {
      console.warn(`[HackerTarget] HTTP ${res.status}`);
      return [];
    }

    const text = await res.text();

    // API returns "error check your search parameter" or "error ..." on failure
    if (!text || text.trim().startsWith('error') || text.trim().startsWith('Error')) {
      console.warn('[HackerTarget] API error response:', text.slice(0, 120));
      return [];
    }

    const seen    = new Set();
    const entries = [];

    for (const line of text.trim().split('\n')) {
      const parts     = line.split(',');
      const subdomain = parts[0]?.trim().toLowerCase();
      const ip        = parts[1]?.trim() || undefined;

      if (!subdomain || seen.has(subdomain)) continue;
      if (!subdomain.endsWith(`.${clean}`))  continue;

      seen.add(subdomain);
      entries.push({ subdomain, ip, source: 'hackertarget' });
    }

    console.log(`[HackerTarget] Found ${entries.length} subdomains for ${clean}`);
    return entries;

  } catch (err) {
    console.warn('[HackerTarget] Error:', err.message);
    return [];
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const domain = (req.query?.domain || '').trim();
  if (!domain) {
    return res.status(400).json({ error: 'Missing query parameter: domain' });
  }

  const clean = domain
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
    .trim();

  if (!clean || clean.length < 3 || !clean.includes('.')) {
    return res.status(400).json({ error: `Invalid domain: ${domain}` });
  }

  try {
    // Both sources run in parallel — fast enough for Vercel Hobby (8s timeout each)
    const [crtshResult, htResult] = await Promise.allSettled([
      fetchCrtSh(clean),
      fetchHackerTarget(clean),
    ]);

    const crtshEntries = crtshResult.status === 'fulfilled' ? crtshResult.value : [];
    const htEntries    = htResult.status    === 'fulfilled' ? htResult.value    : [];

    // ── Merge: crt.sh provides cert metadata; HackerTarget provides IP ──────
    const mergedMap = {};

    // Load crt.sh first (has cert expiry info)
    for (const s of crtshEntries) {
      mergedMap[s.subdomain] = s;
    }

    // Enrich with HackerTarget data
    for (const s of htEntries) {
      if (!mergedMap[s.subdomain]) {
        // New entry — only from HackerTarget
        mergedMap[s.subdomain] = s;
      } else {
        // Already known from crt.sh — add IP and update source tag
        mergedMap[s.subdomain] = {
          ...mergedMap[s.subdomain],
          ip:     s.ip ?? mergedMap[s.subdomain].ip,
          source: 'crtsh,hackertarget',
        };
      }
    }

    const deduped = Object.values(mergedMap);

    // Sort: active SSL cert first, then alphabetically
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
      sources: {
        crtsh:        crtshEntries.length,
        hackertarget: htEntries.length,
      },
      list: sorted.slice(0, 200),
    });

  } catch (err) {
    console.error('[Subdomains] Error:', err.message);
    return res.status(500).json({ error: `Subdomain lookup error: ${err.message}` });
  }
};

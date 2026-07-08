// Vercel max duration hint (Hobby plan: ~10s effective limit)
module.exports.config = { maxDuration: 60 };

// ── Dangling CNAME providers (subdomain takeover risk) ────────────────────────
const DANGLING_PROVIDERS = [
  { pattern: 'github.io',          name: 'GitHub Pages' },
  { pattern: 'herokuapp.com',       name: 'Heroku' },
  { pattern: 'azurewebsites.net',   name: 'Azure Web Apps' },
  { pattern: 'cloudfront.net',      name: 'AWS CloudFront' },
  { pattern: 'fastly.net',          name: 'Fastly CDN' },
  { pattern: 'ghost.io',            name: 'Ghost.io' },
  { pattern: 'netlify.app',         name: 'Netlify' },
  { pattern: 'vercel.app',          name: 'Vercel' },
  { pattern: 'surge.sh',            name: 'Surge.sh' },
  { pattern: 'bitbucket.io',        name: 'Bitbucket Pages' },
  { pattern: 'shopify.com',         name: 'Shopify' },
  { pattern: 'squarespace.com',     name: 'Squarespace' },
  { pattern: 'unbounce.com',        name: 'Unbounce' },
  { pattern: 'wpengine.com',        name: 'WP Engine' },
  { pattern: 'pantheonsite.io',     name: 'Pantheon' },
  { pattern: 'acquia-sites.com',    name: 'Acquia' },
  { pattern: 'readthedocs.io',      name: 'ReadTheDocs' },
  { pattern: 'strikingly.com',      name: 'Strikingly' },
  { pattern: 'webflow.io',          name: 'Webflow' },
  { pattern: 'smugmug.com',         name: 'SmugMug' },
];

// ── DNS brute-force wordlist (80 common subdomains) ───────────────────────────
const BRUTE_FORCE_NAMES = [
  'www', 'api', 'mail', 'email', 'smtp', 'imap', 'pop', 'pop3',
  'dev', 'development', 'staging', 'stage', 'uat', 'qa', 'test', 'sandbox',
  'admin', 'administrator', 'portal', 'dashboard', 'panel', 'cpanel', 'webmail',
  'blog', 'shop', 'store', 'app', 'mobile', 'mx', 'mx1', 'mx2',
  'cdn', 'static', 'assets', 'media', 'img', 'images', 'files', 'uploads',
  'docs', 'help', 'support', 'status', 'monitor', 'health',
  'auth', 'login', 'sso', 'oauth', 'id', 'accounts',
  'api2', 'api3', 'v1', 'v2', 'v3',
  'vpn', 'remote', 'gateway', 'proxy', 'waf',
  'ftp', 'sftp', 'ssh',
  'git', 'gitlab', 'github', 'bitbucket', 'jenkins', 'ci', 'cd', 'build',
  'jira', 'confluence', 'wiki', 'internal', 'intranet', 'corp',
  'db', 'database', 'mysql', 'postgres', 'redis', 'mongo',
  'metrics', 'grafana', 'kibana', 'elastic', 'log', 'logs',
  'ns1', 'ns2', 'ns3', 'dns', 'dns1', 'dns2',
  'old', 'legacy', 'backup', 'archive', 'beta', 'alpha', 'preview',
];

// ── DNS over HTTPS helper (Cloudflare DoH) ───────────────────────────────────
async function dnsLookup(name, type = 'A') {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
      {
        signal:  AbortSignal.timeout(5000),
        headers: { Accept: 'application/dns-json', 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)' },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.Answer)) return null;
    return data.Answer.map(r => r.data).filter(Boolean);
  } catch {
    return null;
  }
}

// ── Live HTTP status check per subdomain ──────────────────────────────────────
// Attempts HTTPS first, falls back to HTTP. Returns status code + redirect target.
// Batched in groups to avoid hammering DNS/HTTP simultaneously.
async function checkLiveHTTP(subdomain, timeoutMs = 4000) {
  for (const proto of ['https', 'http']) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${proto}://${subdomain}/`, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)', Connection: 'close' },
      });
      clearTimeout(timer);
      const location = res.headers.get('location') || undefined;
      return {
        live:     true,
        protocol: proto,
        httpStatus: res.status,
        redirectsTo: [301, 302, 303, 307, 308].includes(res.status) ? location : undefined,
      };
    } catch {
      // try next protocol
    }
  }
  return { live: false };
}

// ── Takeover risk check ────────────────────────────────────────────────────────
// Returns a provider name if the CNAME points to a known provider that
// could be vulnerable to subdomain takeover.
async function checkTakeoverRisk(subdomain) {
  const cnameRecords = await dnsLookup(subdomain, 'CNAME');
  if (!cnameRecords?.length) return undefined;
  for (const cname of cnameRecords) {
    for (const { pattern, name } of DANGLING_PROVIDERS) {
      if (cname.toLowerCase().includes(pattern)) {
        return { cname, provider: name, risk: 'potential_takeover' };
      }
    }
  }
  return undefined;
}

// ── DNS brute-force source ────────────────────────────────────────────────────
// Resolves each common name against the target domain using DoH.
// Returns entries that have at least one A record (confirmed DNS hit).
async function fetchBruteForce(clean) {
  // Run in batches of 15 to stay within Vercel's concurrency comfort zone
  const batchSize = 15;
  const entries = [];

  for (let i = 0; i < BRUTE_FORCE_NAMES.length; i += batchSize) {
    const batch = BRUTE_FORCE_NAMES.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (name) => {
        const full = `${name}.${clean}`;
        const aRecords = await dnsLookup(full, 'A');
        if (!aRecords?.length) return null;
        return {
          subdomain: full,
          ip:        aRecords[0],
          source:    'bruteforce',
        };
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) entries.push(r.value);
    }
  }

  console.log(`[BruteForce] Found ${entries.length} subdomains for ${clean}`);
  return entries;
}

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
async function fetchHackerTarget(clean) {
  try {
    const apiKey   = process.env.HACKERTARGET_API_KEY || '';
    const keyParam = apiKey ? `&apikey=${encodeURIComponent(apiKey)}` : '';
    const url      = `https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(clean)}${keyParam}`;

    const res = await fetch(url, {
      signal:  AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomainIntel/1.0)' },
    });

    if (!res.ok) {
      console.warn(`[HackerTarget] HTTP ${res.status}`);
      return [];
    }

    const text = await res.text();

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
    // All three discovery sources run in parallel
    const [crtshResult, htResult, bruteResult] = await Promise.allSettled([
      fetchCrtSh(clean),
      fetchHackerTarget(clean),
      fetchBruteForce(clean),
    ]);

    const crtshEntries  = crtshResult.status  === 'fulfilled' ? crtshResult.value  : [];
    const htEntries     = htResult.status     === 'fulfilled' ? htResult.value     : [];
    const bruteEntries  = bruteResult.status  === 'fulfilled' ? bruteResult.value  : [];

    // ── Merge: crt.sh provides cert metadata; HackerTarget + brute provide IPs
    const mergedMap = {};

    // Load crt.sh first (has cert expiry info)
    for (const s of crtshEntries) {
      mergedMap[s.subdomain] = s;
    }

    // Enrich with HackerTarget data
    for (const s of htEntries) {
      if (!mergedMap[s.subdomain]) {
        mergedMap[s.subdomain] = s;
      } else {
        mergedMap[s.subdomain] = {
          ...mergedMap[s.subdomain],
          ip:     s.ip ?? mergedMap[s.subdomain].ip,
          source: 'crtsh,hackertarget',
        };
      }
    }

    // Enrich with brute-force DNS results
    for (const s of bruteEntries) {
      if (!mergedMap[s.subdomain]) {
        mergedMap[s.subdomain] = s;
      } else {
        // Already known — just add IP if missing, update source tag
        const existing = mergedMap[s.subdomain];
        mergedMap[s.subdomain] = {
          ...existing,
          ip:     existing.ip ?? s.ip,
          source: existing.source.includes('bruteforce')
            ? existing.source
            : existing.source + ',bruteforce',
        };
      }
    }

    const deduped = Object.values(mergedMap);

    // ── Live HTTP status check (batch of up to 40 subdomains) ────────────
    // Prioritise: active SSL certs first, then brute-force hits, then the rest
    const prioritised = [
      ...deduped.filter(s => s.expired === false),
      ...deduped.filter(s => s.source?.includes('bruteforce') && s.expired === undefined),
      ...deduped.filter(s => s.expired === true),
      ...deduped.filter(s => s.expired === undefined && !s.source?.includes('bruteforce')),
    ];
    // De-dup after sort (Set preserves insertion order)
    const ordered = [...new Map(prioritised.map(s => [s.subdomain, s])).values()];

    // Only live-check the first 40 to stay within Vercel time limits
    const toCheck = ordered.slice(0, 40);
    const rest     = ordered.slice(40);

    const liveCheckBatchSize = 10;
    for (let i = 0; i < toCheck.length; i += liveCheckBatchSize) {
      const batch = toCheck.slice(i, i + liveCheckBatchSize);
      const liveResults = await Promise.allSettled(
        batch.map(s => checkLiveHTTP(s.subdomain))
      );
      for (let j = 0; j < batch.length; j++) {
        const r = liveResults[j];
        if (r.status === 'fulfilled') {
          toCheck[i + j] = { ...toCheck[i + j], ...r.value };
        }
      }
    }

    // ── Takeover risk check (only on entries that resolved DNS) ──────────
    // Run against first 20 entries to stay within time budget
    const takeoverCandidates = toCheck.slice(0, 20);
    const takeoverResults = await Promise.allSettled(
      takeoverCandidates.map(s => checkTakeoverRisk(s.subdomain))
    );
    for (let i = 0; i < takeoverCandidates.length; i++) {
      const r = takeoverResults[i];
      if (r.status === 'fulfilled' && r.value) {
        toCheck[i] = { ...toCheck[i], takeoverRisk: r.value };
      }
    }

    // Recombine checked + unchecked
    const sorted = [...toCheck, ...rest].sort((a, b) => {
      // Live subdomains first
      if (a.live === true  && b.live !== true) return -1;
      if (b.live === true  && a.live !== true)  return  1;
      // Then active SSL cert
      if (a.expired === false && b.expired !== false) return -1;
      if (b.expired === false && a.expired !== false) return  1;
      // Takeover risks bubble up
      if (a.takeoverRisk && !b.takeoverRisk) return -1;
      if (b.takeoverRisk && !a.takeoverRisk) return  1;
      return a.subdomain.localeCompare(b.subdomain);
    });

    const active        = sorted.filter(s => s.expired === false).length;
    const expired       = sorted.filter(s => s.expired === true).length;
    const liveCount     = sorted.filter(s => s.live === true).length;
    const takeoverRisks = sorted.filter(s => s.takeoverRisk).length;

    return res.status(200).json({
      total: sorted.length,
      active,
      expired,
      live: liveCount,
      takeoverRisks,
      sources: {
        crtsh:        crtshEntries.length,
        hackertarget: htEntries.length,
        bruteforce:   bruteEntries.length,
      },
      list: sorted.slice(0, 200),
    });

  } catch (err) {
    console.error('[Subdomains] Error:', err.message);
    return res.status(500).json({ error: `Subdomain lookup error: ${err.message}` });
  }
};

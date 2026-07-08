// api/cti.js
// Cyber Threat Intelligence router — Vercel Hobby single-function consolidation
// Usage: /api/cti?module=<name>&...params
//
// Modules:
//   otx         — ?module=otx&type=ip|domain|email&value=...
//   virustotal  — ?module=virustotal&type=ip|domain|url&value=...
//   abuseipdb   — ?module=abuseipdb&ip=...
//   xon         — ?module=xon&email=...
//   leakcheck   — ?module=leakcheck&email=...

const https = require('https');

// ── shared fetch helper ───────────────────────────────────────────────────────

const request = (options, postBody = null) => new Promise((resolve) => {
  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', c => { data += c; });
    res.on('end', () => {
      try { resolve({ body: JSON.parse(data), status: res.statusCode }); }
      catch { resolve({ body: data, status: res.statusCode }); }
    });
  });
  req.on('error', err => resolve({ body: null, status: 0, error: err.message }));
  req.setTimeout(20000, () => { req.destroy(); resolve({ body: null, status: 0, error: 'timeout' }); });
  if (postBody) req.write(postBody);
  req.end();
});

// ── VirusTotal ────────────────────────────────────────────────────────────────

const handleVirusTotal = async (query, res) => {
  const { type, value } = query;
  if (!type || !value) return res.status(400).json({ error: 'Missing type or value. type: ip | domain | url' });

  const VT_KEY = process.env.VIRUSTOTAL_API_KEY || '';
  if (!VT_KEY) return res.status(503).json({ error: 'VirusTotal API key not configured (VIRUSTOTAL_API_KEY)' });

  const vtGet = (path) => request({
    hostname: 'www.virustotal.com', path, method: 'GET',
    headers: { 'x-apikey': VT_KEY, 'Accept': 'application/json' },
  });

  const vtPost = (path, url) => {
    const body = `url=${encodeURIComponent(url)}`;
    return request({
      hostname: 'www.virustotal.com', path, method: 'POST',
      headers: { 'x-apikey': VT_KEY, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, body);
  };

  try {
    const t = type.toLowerCase();

    if (t === 'ip') {
      const { body, status } = await vtGet(`/api/v3/ip_addresses/${encodeURIComponent(value)}`);
      if (status === 404) return res.status(200).json({ type, value, found: false });
      if (status === 429) return res.status(429).json({ error: 'VirusTotal rate limit reached' });
      if (status !== 200 || !body) return res.status(502).json({ error: `VirusTotal returned HTTP ${status}` });
      const attrs = body.data?.attributes ?? {};
      const stats = attrs.last_analysis_stats ?? {};
      return res.status(200).json({ type, value, found: true, malicious: stats.malicious ?? 0, suspicious: stats.suspicious ?? 0, harmless: stats.harmless ?? 0, undetected: stats.undetected ?? 0, country: attrs.country ?? null, asn: attrs.asn ?? null, as_owner: attrs.as_owner ?? null, reputation: attrs.reputation ?? 0, tags: attrs.tags ?? [] });
    }

    if (t === 'domain') {
      const { body, status } = await vtGet(`/api/v3/domains/${encodeURIComponent(value)}`);
      if (status === 404) return res.status(200).json({ type, value, found: false });
      if (status === 429) return res.status(429).json({ error: 'VirusTotal rate limit reached' });
      if (status !== 200 || !body) return res.status(502).json({ error: `VirusTotal returned HTTP ${status}` });
      const attrs = body.data?.attributes ?? {};
      const stats = attrs.last_analysis_stats ?? {};
      return res.status(200).json({ type, value, found: true, malicious: stats.malicious ?? 0, suspicious: stats.suspicious ?? 0, harmless: stats.harmless ?? 0, undetected: stats.undetected ?? 0, reputation: attrs.reputation ?? 0, categories: [...new Set(Object.values(attrs.categories ?? {}))], creation_date: attrs.creation_date ?? null, tags: attrs.tags ?? [] });
    }

    if (t === 'url') {
      const submit = await vtPost('/api/v3/urls', value);
      if (submit.status === 429) return res.status(429).json({ error: 'VirusTotal rate limit reached' });
      if (![200, 201].includes(submit.status) || !submit.body) return res.status(502).json({ error: `VirusTotal URL submit failed: HTTP ${submit.status}` });
      const analysisId = submit.body.data?.id;
      if (!analysisId) return res.status(502).json({ error: 'No analysis ID returned from VirusTotal' });
      const result = await vtGet(`/api/v3/analyses/${encodeURIComponent(analysisId)}`);
      if (result.status !== 200 || !result.body) return res.status(502).json({ error: `VirusTotal analysis fetch failed: HTTP ${result.status}` });
      const stats = result.body.data?.attributes?.stats ?? {};
      return res.status(200).json({ type, value, found: true, malicious: stats.malicious ?? 0, suspicious: stats.suspicious ?? 0, harmless: stats.harmless ?? 0, undetected: stats.undetected ?? 0 });
    }

    res.status(400).json({ error: 'Invalid type. Must be: ip, domain, or url' });
  } catch (err) {
    res.status(500).json({ error: `VirusTotal proxy error: ${err.message}` });
  }
};

// ── AbuseIPDB ─────────────────────────────────────────────────────────────────

const handleAbuseIPDB = async (query, res) => {
  const { ip, maxAge } = query;
  if (!ip) return res.status(400).json({ error: 'Missing ip parameter' });

  const ABUSE_KEY = process.env.ABUSEIPDB_API_KEY || '';
  if (!ABUSE_KEY) return res.status(503).json({ error: 'AbuseIPDB API key not configured (ABUSEIPDB_API_KEY)' });

  const params = new URLSearchParams({ ipAddress: ip, maxAgeInDays: String(parseInt(maxAge ?? '90', 10) || 90), verbose: 'true' });

  try {
    const { body, status } = await request({
      hostname: 'api.abuseipdb.com',
      path: `/api/v2/check?${params.toString()}`,
      method: 'GET',
      headers: { 'Key': ABUSE_KEY, 'Accept': 'application/json' },
    });

    if (status === 429) return res.status(429).json({ error: 'AbuseIPDB rate limit reached' });
    if (status === 422) return res.status(400).json({ error: 'Invalid IP address format' });
    if (status !== 200 || !body) return res.status(502).json({ error: `AbuseIPDB returned HTTP ${status}` });

    const data = body.data ?? {};
    res.status(200).json({ ip, abuse_score: data.abuseConfidenceScore ?? 0, total_reports: data.totalReports ?? 0, distinct_users: data.numDistinctUsers ?? 0, country: data.countryCode ?? null, country_name: data.countryName ?? null, isp: data.isp ?? null, domain: data.domain ?? null, usage_type: data.usageType ?? null, is_tor: data.isTor ?? false, is_public: data.isPublic ?? true, last_reported: data.lastReportedAt ?? null });
  } catch (err) {
    res.status(500).json({ error: `AbuseIPDB proxy error: ${err.message}` });
  }
};

// ── XposedOrNot ───────────────────────────────────────────────────────────────

const handleXON = async (query, res) => {
  const { email } = query;
  if (!email) return res.status(400).json({ error: 'Missing email parameter' });

  try {
    const { body, status } = await request({
      hostname: 'api.xposedornot.com',
      path: `/v1/check-email/${encodeURIComponent(email)}`,
      method: 'GET',
      headers: { 'User-Agent': 'BlackAI-GO', 'Accept': 'application/json' },
    });

    if (status === 404) return res.status(200).json({ email, found: false, total: 0, breaches: [] });
    if (status === 429) return res.status(429).json({ error: 'XposedOrNot rate limit reached' });
    if (status !== 200 || !body) return res.status(502).json({ error: `XposedOrNot returned HTTP ${status}` });

    const names = [];
    for (const group of (body.breaches || [])) {
      if (Array.isArray(group)) names.push(...group.filter(Boolean).map(String));
      else if (group) names.push(String(group));
    }
    res.status(200).json({ email, found: names.length > 0, total: names.length, breaches: names.map(n => ({ name: n })) });
  } catch (err) {
    res.status(500).json({ error: `XposedOrNot proxy error: ${err.message}` });
  }
};

// ── LeakCheck ─────────────────────────────────────────────────────────────────

const handleLeakCheck = async (query, res) => {
  const { email } = query;
  if (!email) return res.status(400).json({ error: 'Missing email parameter' });

  try {
    const { body, status } = await request({
      hostname: 'leakcheck.io',
      path: `/api/public?check=${encodeURIComponent(email)}`,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlackAI-GO)', 'Accept': 'application/json' },
    });

    if (status === 404) return res.status(200).json({ email, found: false, total: 0, breaches: [] });
    if (status === 429) return res.status(429).json({ error: 'LeakCheck rate limit reached' });
    if (status !== 200 || !body) return res.status(502).json({ error: `LeakCheck returned HTTP ${status}` });

    const names = [];
    for (const src of (body.sources || [])) {
      if (typeof src === 'object' && src.name) names.push(String(src.name));
      else if (typeof src === 'string' && src) names.push(src);
    }
    res.status(200).json({ email, found: names.length > 0, total: names.length, breaches: names.map(n => ({ name: n })) });
  } catch (err) {
    res.status(500).json({ error: `LeakCheck proxy error: ${err.message}` });
  }
};

// ── AlienVault OTX ───────────────────────────────────────────────────────────

const handleOTX = async (query, res) => {
  const { type, value } = query;
  if (!type || !value) return res.status(400).json({ error: 'Missing type or value. type: ip | domain | email' });

  const OTX_API_KEY = process.env.OTX_API_KEY || '';

  let indicatorType;
  let sections;

  switch (type.toLowerCase()) {
    case 'ip':
      indicatorType = 'IPv4';
      sections = ['general', 'reputation', 'geo', 'malware', 'url_list', 'passive_dns'];
      break;
    case 'domain':
      indicatorType = 'domain';
      sections = ['general', 'geo', 'malware', 'url_list', 'passive_dns', 'http_scans', 'whois'];
      break;
    case 'email':
      indicatorType = 'email';
      sections = ['general'];
      break;
    default:
      return res.status(400).json({ error: 'Invalid type. Must be: ip, domain, or email' });
  }

  const fetchSection = (section) => new Promise((resolve) => {
    const options = {
      hostname: 'otx.alienvault.com',
      path: `/api/v1/indicators/${indicatorType}/${encodeURIComponent(value)}/${section}`,
      method: 'GET',
      headers: { 'X-OTX-API-KEY': OTX_API_KEY, 'Accept': 'application/json' },
    };

    const req = https.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try { resolve({ section, data: JSON.parse(data), status: response.statusCode }); }
        catch { resolve({ section, data: null, status: response.statusCode }); }
      });
    });

    req.on('error', (err) => resolve({ section, data: null, error: err.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ section, data: null, error: 'timeout' }); });
    req.end();
  });

  try {
    const results = await Promise.all(sections.map(fetchSection));
    const combined = {};
    results.forEach(({ section, data }) => { if (data) combined[section] = data; });
    res.status(200).json({ type, value, results: combined });
  } catch (err) {
    res.status(500).json({ error: `OTX proxy error: ${err.message}` });
  }
};

// ── Router ────────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { module: mod, ...rest } = req.query;

  switch (mod) {
    case 'otx':         return handleOTX(rest, res);
    case 'virustotal':  return handleVirusTotal(rest, res);
    case 'abuseipdb':   return handleAbuseIPDB(rest, res);
    case 'xon':         return handleXON(rest, res);
    case 'leakcheck':   return handleLeakCheck(rest, res);
    default:
      res.status(400).json({ error: 'Missing or invalid module. Options: otx | virustotal | abuseipdb | xon | leakcheck' });
  }
};

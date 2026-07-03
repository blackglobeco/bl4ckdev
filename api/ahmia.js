const https = require('https');
const http  = require('http');

const TOR_RELAY_URL = process.env.TOR_PROXY_URL || 'https://tor-prox.onrender.com';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:137.0) Gecko/20100101 Firefox/137.0',
];
const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

const ONION_ENGINES = [
  { name: 'DeepSearches', url: 'http://searchgf7gdtauh7bhnbyed4ivxqmuoat3nm6zfrg3ymkq6mtnpye3ad.onion/search?q={query}' },
];

const ONION_VALID = /[a-z2-7]{16,56}\.onion/i;

// ─── ORIGINAL working Ahmia clearweb fetch (unchanged from your working code) ─
const fetchUrl = (hostname, path, cookieHeader = '', redirectCount = 0) => {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) { reject(new Error('Too many redirects')); return; }
    const options = {
      hostname,
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive',
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
      },
    };
    const request = https.get(options, (response) => {
      const { statusCode, headers } = response;
      const setCookies = headers['set-cookie'] || [];
      const cookies = setCookies.map(c => c.split(';')[0]).join('; ');
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        const location = headers.location;
        if (!location) { reject(new Error('Redirect with no location')); return; }
        response.resume();
        let newHostname = hostname, newPath = location;
        if (location.startsWith('http')) {
          const url = new URL(location);
          newHostname = url.hostname;
          newPath = url.pathname + url.search;
        }
        resolve(fetchUrl(newHostname, newPath, cookies || cookieHeader, redirectCount + 1));
        return;
      }
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ html: body, statusCode, cookies }));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.setTimeout(15000, () => { request.destroy(); reject(new Error('Timed out')); });
  });
};

// ─── ORIGINAL working Ahmia HTML parser (unchanged) ──────────────────────────
function parseAhmiaHtml(html, q) {
  const normalizeUrl = (u) => u.replace(/\/+$/, '').toLowerCase();
  const seenUrls = new Set();
  const results = [];

  const olStart = html.indexOf('<ol class="searchResults">');
  const resultArea = olStart !== -1 ? html.substring(olStart) : html;
  const liRegex = /<li class="result">([\s\S]*?)<\/li>/g;
  let match;

  while ((match = liRegex.exec(resultArea)) !== null && results.length < 8) {
    const block = match[1];
    const hrefMatch = /href="([^"]+redirect_url=[^"]+)"/.exec(block);
    if (!hrefMatch) continue;

    let url = '';
    try {
      const redirectParam = hrefMatch[1].match(/redirect_url=([^&"]+)/);
      url = redirectParam ? decodeURIComponent(redirectParam[1]) : hrefMatch[1];
    } catch { url = hrefMatch[1]; }

    if (!url) continue;

    if (!url.match(/[a-z2-7]{16,56}\.onion/i)) {
      const onionMatch = /https?:\/\/[a-z0-9.]+\.onion[^\s"']*/i.exec(block);
      if (onionMatch) url = onionMatch[0];
      else continue;
    }

    const key = normalizeUrl(url);
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);

    const titleMatch = /<a[^>]+>([\s\S]*?)<\/a>/i.exec(block);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      : '(no title)';

    const descMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
    const description = descMatch
      ? descMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      : 'No description available';

    results.push({ title, description, url, engine: 'AhmiaWeb' });
  }
  return results;
}

// ─── Tor relay fetch — mirrors crawl-onion.js exactly ────────────────────────
// Relay returns: { success, title, text, links, charCount }
// "text" is plain-text stripped HTML — we scan it for bare .onion URLs
// "links" is an array of { href, text } extracted by the relay — gold for parsing
function fetchViaRelay(targetUrl) {
  return new Promise((resolve, reject) => {
    const endpoint = `${TOR_RELAY_URL}/fetch?url=${encodeURIComponent(targetUrl)}`;
    const parsed   = new URL(endpoint);
    const lib      = parsed.protocol === 'https:' ? https : http;
    const options  = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers:  { 'Accept': 'application/json', 'User-Agent': randomUA() },
    };
    const request = lib.request(options, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk.toString(); });
      response.on('end', () => {
        try { resolve({ data: JSON.parse(body), status: response.statusCode }); }
        catch { reject(new Error(`Non-JSON relay response: ${body.slice(0, 120)}`)); }
      });
      response.on('error', reject);
    });
    request.on('error', reject);
    request.setTimeout(30000, () => { request.destroy(); reject(new Error('Relay timed out')); });
    request.end();
  });
}

// ─── Navigation/junk link patterns to discard ────────────────────────────────
const NAV_TITLE_RE = /^(directory|add link|last added|advertise|home|search|login|register|about|contact|back|next|prev|more|submit|index)$/i;
const NAV_URL_RE   = /\/(search|login|register|about|contact|advertise|add[_-]?link|index\.php\?a=add)\b/i;

// A result is "quality" if it has a real title (not a raw URL, not a nav label, not empty)
function isQualityResult(title, url) {
  if (!title || title.trim().length < 4) return false;
  if (NAV_TITLE_RE.test(title.trim())) return false;
  // Raw URL used as title (relay plain-text fallback) — skip
  if (/^https?:\/\//i.test(title)) return false;
  if (NAV_URL_RE.test(url)) return false;
  return true;
}

// ─── Parse onion engine response from relay ───────────────────────────────────
// Primary:  use data.links[] array (relay pre-extracts all <a> tags with href+text)
// Fallback: scan data.text for bare .onion URLs
function parseRelayResponse(data, engineName) {
  const results = [];

  // Strategy 1: relay provides data.links = [{ href, text }, ...]
  if (Array.isArray(data.links) && data.links.length > 0) {
    for (const link of data.links) {
      const url   = (link.href || link.url || '').trim();
      const title = (link.text || link.title || '').replace(/\s+/g, ' ').trim();
      if (!url || !ONION_VALID.test(url)) continue;
      if (!isQualityResult(title, url)) continue;
      results.push({ title: title.substring(0, 120), description: `Found via ${engineName}`, url, engine: engineName });
    }
    if (results.length > 0) {
      console.log(`[${engineName}] ${results.length} quality results via links[]`);
      return results;
    }
  }

  // Strategy 2: scan plain text for bare .onion URLs (last resort — no title available)
  const text = data.text || data.content || '';
  const bareRegex = /https?:\/\/[a-z2-7]{16,56}\.onion[^\s<>"']*/gi;
  let m;
  while ((m = bareRegex.exec(text)) !== null) {
    const url = m[0];
    if (!ONION_VALID.test(url) || NAV_URL_RE.test(url)) continue;
    // No title available from plain text — use domain as title
    const domainMatch = url.match(/\/\/([a-z0-9]+\.onion)/i);
    const title = domainMatch ? domainMatch[1] : url.substring(0, 60);
    results.push({ title, description: `Found via ${engineName}`, url, engine: engineName });
  }

  console.log(`[${engineName}] ${results.length} results via text scan`);
  return results;
}

async function fetchOnionEngine(engine, query) {
  const url = engine.url.replace('{query}', encodeURIComponent(query));
  try {
    const { data, status } = await fetchViaRelay(url);
    if (status !== 200 || !data.success) {
      console.warn(`[${engine.name}] relay error: ${data?.error}`);
      return { engine: engine.name, results: [] };
    }
    const results = parseRelayResponse(data, engine.name);
    return { engine: engine.name, results };
  } catch (err) {
    console.warn(`[${engine.name}] failed: ${err.message}`);
    return { engine: engine.name, results: [] };
  }
}

function deduplicateResults(allResults) {
  const seen = new Set();
  return allResults.filter(r => {
    const key = r.url.replace(/\/+$/, '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const q = req.query?.q;
  if (!q) { res.status(400).json({ error: 'Missing query parameter q' }); return; }

  const mode        = (req.query?.engines || 'all').toLowerCase();
  const useOnion    = mode === 'all' || mode === 'onion';
  const useClearweb = mode === 'all' || mode === 'clearweb';

  console.log(`[MultiEngine] Query: "${q}" | mode: ${mode}`);

  try {
    const tasks = [];

    // ── Track 1: Original working Ahmia clearweb (CSRF + parse — untouched) ──
    if (useClearweb) {
      const ahmiaTask = (async () => {
        try {
          console.log('[AhmiaWeb] Fetching homepage for CSRF token...');
          const { html: homeHtml, cookies: homeCookies } = await fetchUrl('ahmia.fi', '/');

          const csrfMatch = /<input[^>]+type="hidden"[^>]+name="([^"]+)"[^>]+value="([^"]+)"/.exec(homeHtml)
                         || /<input[^>]+type="hidden"[^>]+value="([^"]+)"[^>]+name="([^"]+)"/.exec(homeHtml);

          let searchPath = `/search/?q=${encodeURIComponent(q)}`;
          if (csrfMatch) {
            searchPath += `&${encodeURIComponent(csrfMatch[1])}=${encodeURIComponent(csrfMatch[2])}`;
          }

          const { html, statusCode } = await fetchUrl('ahmia.fi', searchPath, homeCookies);
          const results = parseAhmiaHtml(html, q);
          console.log(`[AhmiaWeb] ${results.length} results (status ${statusCode})`);
          return { engine: 'AhmiaWeb', results };
        } catch (err) {
          console.warn(`[AhmiaWeb] failed: ${err.message}`);
          return { engine: 'AhmiaWeb', results: [] };
        }
      })();
      tasks.push(ahmiaTask);
    }

    // ── Track 2: All onion engines in parallel via Tor relay ─────────────────
    if (useOnion) {
      for (const engine of ONION_ENGINES) {
        tasks.push(fetchOnionEngine(engine, q));
      }
    }

    const settled = await Promise.allSettled(tasks);

    const engineSummary = {};
    let allResults = [];
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        const { engine, results } = s.value;
        engineSummary[engine] = results.length;
        allResults.push(...results);
      }
    }

    const results = deduplicateResults(allResults).slice(0, 30);
    console.log(`[MultiEngine] Done — returning ${results.length} unique results`);

    res.status(200).json({
      results,
      query: q,
      total: results.length,
      engines: engineSummary,
    });

  } catch (err) {
    console.error('[MultiEngine] Fatal:', err.message);
    res.status(500).json({ error: err.message });
  }
};

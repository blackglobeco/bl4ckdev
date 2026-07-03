const https = require('https');
const http  = require('http');

// Tor relay running on Render — fetches .onion URLs via Tor and returns JSON
const TOR_RELAY_URL = process.env.TOR_PROXY_URL || 'https://tor-prox.onrender.com';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  console.log(`[CrawlOnion] VERSION: tor-relay-v6 | relay: ${TOR_RELAY_URL}`);

  const onionUrl = req.query?.url;
  if (!onionUrl) {
    res.status(400).json({ error: 'Missing query parameter: url' });
    return;
  }

  if (!onionUrl.match(/[a-z2-7]{16,56}\.onion/i)) {
    res.status(400).json({ error: 'Invalid or missing .onion URL' });
    return;
  }

  // Call the Tor relay REST API — simple HTTP GET, no proxy protocol needed
  const fetchFromRelay = (targetUrl) => {
    return new Promise((resolve, reject) => {
      const endpoint = `${TOR_RELAY_URL}/fetch?url=${encodeURIComponent(targetUrl)}`;
      const parsed   = new URL(endpoint);
      const lib      = parsed.protocol === 'https:' ? https : http;

      const options = {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   'GET',
        headers:  { 'Accept': 'application/json' },
      };

      const request = lib.request(options, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk.toString(); });
        response.on('end', () => {
          try {
            resolve({ data: JSON.parse(body), status: response.statusCode });
          } catch {
            reject(new Error(`Invalid JSON from relay: ${body.slice(0, 100)}`));
          }
        });
        response.on('error', reject);
      });

      request.on('error', reject);
      // Tor can be slow — allow 35s (within Vercel's 5min function limit)
      request.setTimeout(35000, () => {
        request.destroy();
        reject(new Error('Relay timed out after 35s'));
      });
      request.end();
    });
  };

  try {
    console.log(`[CrawlOnion] Fetching via Tor relay: ${onionUrl}`);
    const { data, status } = await fetchFromRelay(onionUrl);

    if (status !== 200 || !data.success) {
      console.warn(`[CrawlOnion] Relay error: ${data.error}`);
      res.status(502).json({
        success: false,
        error:   data.error || `Relay returned status ${status}`,
        url:     onionUrl,
      });
      return;
    }

    console.log(`[CrawlOnion] Success — ${data.charCount} chars from ${onionUrl}`);
    res.status(200).json({
      success:   true,
      url:       onionUrl,
      gateway:   TOR_RELAY_URL,
      title:     data.title,
      text:      data.text,
      links:     data.links,
      charCount: data.charCount,
    });

  } catch (err) {
    console.error(`[CrawlOnion] Failed: ${err.message}`);
    res.status(502).json({
      success: false,
      error:   err.message,
      url:     onionUrl,
    });
  }
};

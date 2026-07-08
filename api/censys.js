const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const ip = req.query?.ip;

  if (!ip) {
    res.status(400).json({ error: 'Missing IP address parameter' });
    return;
  }

  const CENSYS_TOKEN = process.env.CENSYS_API_SECRET || '';

  if (!CENSYS_TOKEN) {
    res.status(500).json({ error: 'Censys API token not configured on server.' });
    return;
  }

  return new Promise((resolve) => {
    // New Censys Platform API v3 — uses Bearer token, free tier supports host lookup
    const options = {
      hostname: 'api.platform.censys.io',
      path: `/v3/global/asset/host/${encodeURIComponent(ip)}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CENSYS_TOKEN}`,
        'Accept': 'application/json',
      },
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          res.status(response.statusCode || 200).json(parsed);
        } catch (e) {
          res.status(500).json({ error: 'Failed to parse Censys response' });
        }
        resolve();
      });
    });

    request.on('error', (err) => {
      console.error('[Censys Proxy] Error:', err.message);
      res.status(500).json({ error: `Proxy error: ${err.message}` });
      resolve();
    });

    request.setTimeout(15000, () => {
      request.destroy();
      res.status(504).json({ error: 'Request to Censys timed out' });
      resolve();
    });

    request.end();
  });
};

const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { type, value } = req.query;

  if (!type || !value) {
    res.status(400).json({ error: 'Missing type or value parameter. type must be: ip, email, or domain' });
    return;
  }

  const OTX_API_KEY = process.env.OTX_API_KEY || '';

  // Map input type to OTX indicator type and sections
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
      res.status(400).json({ error: 'Invalid type. Must be: ip, email, or domain' });
      return;
  }

  const fetchSection = (section) => {
    return new Promise((resolve) => {
      const path = `/api/v1/indicators/${indicatorType}/${encodeURIComponent(value)}/${section}`;
      const options = {
        hostname: 'otx.alienvault.com',
        path,
        method: 'GET',
        headers: {
          'X-OTX-API-KEY': OTX_API_KEY,
          'Accept': 'application/json',
        },
      };

      const request = https.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          try {
            resolve({ section, data: JSON.parse(data), status: response.statusCode });
          } catch (e) {
            resolve({ section, data: null, status: response.statusCode });
          }
        });
      });

      request.on('error', (err) => {
        resolve({ section, data: null, error: err.message });
      });

      request.setTimeout(15000, () => {
        request.destroy();
        resolve({ section, data: null, error: 'timeout' });
      });

      request.end();
    });
  };

  try {
    const results = await Promise.all(sections.map(fetchSection));
    const combined = {};
    results.forEach(({ section, data }) => {
      if (data) combined[section] = data;
    });
    res.status(200).json({ type, value, results: combined });
  } catch (err) {
    console.error('[OTX Proxy] Error:', err.message);
    res.status(500).json({ error: `Proxy error: ${err.message}` });
  }
};

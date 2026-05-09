const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const q = req.query?.q;
  if (!q) {
    res.status(400).json({ error: 'Missing query parameter q' });
    return;
  }

  const fetchUrl = (hostname, path, redirectCount = 0) => {
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
        },
      };
      const request = https.get(options, (response) => {
        const { statusCode, headers } = response;
        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          const location = headers.location;
          if (!location) { reject(new Error('Redirect with no location')); return; }
          response.resume();
          let newHostname = hostname;
          let newPath = location;
          if (location.startsWith('http')) {
            const url = new URL(location);
            newHostname = url.hostname;
            newPath = url.pathname + url.search;
          }
          resolve(fetchUrl(newHostname, newPath, redirectCount + 1));
          return;
        }
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ html: body, statusCode }));
        response.on('error', reject);
      });
      request.on('error', reject);
      request.setTimeout(15000, () => { request.destroy(); reject(new Error('Timed out')); });
    });
  };

  try {
    const { html, statusCode } = await fetchUrl('ahmia.fi', `/search/?q=${encodeURIComponent(q)}`);

    const results = [];

    // Jump directly to the results section — skip nav/header
    const mainStart = html.indexOf('id="ahmiaMainContent"');
    const searchArea = mainStart !== -1 ? html.substring(mainStart) : html;

    // Also find where results list starts specifically
    const resultsStart = searchArea.indexOf('<ul>');
    const resultArea = resultsStart !== -1 ? searchArea.substring(resultsStart) : searchArea;

    // Ahmia structure: <li> containing <h4><a href="URL">Title</a></h4> and <p>Description</p>
    const liRegex = /<li>([\s\S]*?)<\/li>/g;
    let match;

    while ((match = liRegex.exec(resultArea)) !== null && results.length < 8) {
      const block = match[1];

      // Must have an h4 with a link — actual search result
      const h4Match = /<h4[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (!h4Match) continue;

      const url = h4Match[1].trim();
      const title = h4Match[2].replace(/<[^>]+>/g, '').trim();

      // Skip Ahmia's own internal navigation links
      if (url.startsWith('/') || url.includes('ahmia.fi')) continue;

      // Get description
      const descMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
      const description = descMatch
        ? descMatch[1].replace(/<[^>]+>/g, '').trim()
        : 'No description available';

      results.push({ title, description, url });
    }

    // Keep debug_html showing the result area specifically so we can see the structure
    res.status(200).json({
      results,
      query: q,
      debug_html: resultArea.substring(0, 5000), // ← increased to 5000 to see actual results
      debug_status: statusCode,
    });

  } catch (err) {
    console.error('[Ahmia] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

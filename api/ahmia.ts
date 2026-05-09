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

        // Collect Set-Cookie headers
        const setCookies = headers['set-cookie'] || [];
        const cookies = setCookies.map(c => c.split(';')[0]).join('; ');

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

  try {
    // Step 1: Load homepage to get CSRF token + cookies
    console.log('[Ahmia] Fetching homepage for CSRF token...');
    const { html: homeHtml, cookies: homeCookies } = await fetchUrl('ahmia.fi', '/') as any;

    // Extract CSRF token: <input type="hidden" name="XXXXX" value="YYYYY">
    const csrfMatch = /<input[^>]+type="hidden"[^>]+name="([^"]+)"[^>]+value="([^"]+)"/.exec(homeHtml)
      || /<input[^>]+type="hidden"[^>]+value="([^"]+)"[^>]+name="([^"]+)"/.exec(homeHtml);

    let searchPath = `/search/?q=${encodeURIComponent(q)}`;

    if (csrfMatch) {
      const tokenName  = csrfMatch[1];
      const tokenValue = csrfMatch[2];
      searchPath += `&${encodeURIComponent(tokenName)}=${encodeURIComponent(tokenValue)}`;
      console.log(`[Ahmia] CSRF token found: ${tokenName}=${tokenValue}`);
    } else {
      console.warn('[Ahmia] No CSRF token found, proceeding without it');
    }

    // Step 2: Fetch search results with cookie + token
    console.log(`[Ahmia] Fetching search results: ${searchPath}`);
    const { html, statusCode } = await fetchUrl('ahmia.fi', searchPath, homeCookies) as any;

    const results = [];

    const mainStart = html.indexOf('id="ahmiaMainContent"');
    const searchArea = mainStart !== -1 ? html.substring(mainStart) : html;

    const resultsStart = searchArea.indexOf('<ul>');
    const resultArea = resultsStart !== -1 ? searchArea.substring(resultsStart) : searchArea;

    const liRegex = /<li>([\s\S]*?)<\/li>/g;
    let match;

    while ((match = liRegex.exec(resultArea)) !== null && results.length < 8) {
      const block = match[1];

      const h4Match = /<h4[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (!h4Match) continue;

      const url = h4Match[1].trim();
      const title = h4Match[2].replace(/<[^>]+>/g, '').trim();

      if (url.startsWith('/') || url.includes('ahmia.fi')) continue;

      const descMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
      const description = descMatch
        ? descMatch[1].replace(/<[^>]+>/g, '').trim()
        : 'No description available';

      results.push({ title, description, url });
    }

    res.status(200).json({
      results,
      query: q,
      debug_html: resultArea.substring(0, 5000),
      debug_status: statusCode,
    });

  } catch (err) {
    console.error('[Ahmia] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

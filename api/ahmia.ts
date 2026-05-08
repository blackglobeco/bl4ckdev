const https = require('https');
const url = require('url');

module.exports = async (req: any, res: any) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { q } = req.query;
  if (!q) {
    res.status(400).json({ error: 'Missing query parameter q' });
    return;
  }

  const ahmiaUrl = `https://ahmia.fi/search/?q=${encodeURIComponent(q)}`;

  const options = {
    hostname: 'ahmia.fi',
    path: `/search/?q=${encodeURIComponent(q)}`,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  };

  try {
    const data = await new Promise<string>((resolve, reject) => {
      const request = https.get(options, (response: any) => {
        let body = '';
        response.on('data', (chunk: any) => { body += chunk; });
        response.on('end', () => resolve(body));
        response.on('error', reject);
      });
      request.on('error', reject);
      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Request timed out'));
      });
    });

    // Parse results from Ahmia HTML
    const results: { title: string; url: string; description: string }[] = [];
    const resultRegex = /<li class="result">([\s\S]*?)<\/li>/g;
    const titleRegex = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
    const descRegex = /<p[^>]*>([\s\S]*?)<\/p>/;

    let match;
    while ((match = resultRegex.exec(data)) !== null && results.length < 8) {
      const block = match[1];
      const titleMatch = titleRegex.exec(block);
      const descMatch = descRegex.exec(block);
      if (titleMatch) {
        results.push({
          url: titleMatch[1],
          title: titleMatch[2].replace(/<[^>]+>/g, '').trim(),
          description: descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '',
        });
      }
    }

    res.status(200).json({ results, query: q });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch from Ahmia' });
  }
};

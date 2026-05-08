import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { q } = req.query;
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Missing query parameter q' });
  }

  try {
    const response = await fetch(
      `https://ahmia.fi/search/?q=${encodeURIComponent(q)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: `Ahmia returned ${response.status}` });
    }

    const html = await response.text();

    // Parse results from Ahmia HTML
    const results: { title: string; url: string; description: string }[] = [];
    const resultRegex = /<li class="result">([\s\S]*?)<\/li>/g;
    const titleRegex = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
    const descRegex = /<p[^>]*>([\s\S]*?)<\/p>/;

    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < 8) {
      const block = match[1];
      const titleMatch = titleRegex.exec(block);
      const descMatch = descRegex.exec(block);
      if (titleMatch) {
        results.push({
          url: titleMatch[1],
          title: titleMatch[2].replace(/<[^>]+>/g, '').trim(),
          description: descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : ''
        });
      }
    }

    return res.status(200).json({ results, query: q });
  } catch (err: any) {
    console.error('Ahmia proxy error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
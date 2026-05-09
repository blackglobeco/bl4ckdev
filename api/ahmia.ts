import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const q = req.query?.q as string;
  if (!q) {
    res.status(400).json({ error: 'Missing query parameter q' });
    return;
  }

  const fetchUrl = (
    hostname: string,
    path: string,
    cookieHeader = '',
    redirectCount = 0
  ): Promise<{ html: string; statusCode: number; cookies: string }> => {
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

        const setCookies = (headers['set-cookie'] || []) as string[];
        const cookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');

        if ([301, 302, 303, 307, 308].includes(statusCode ?? 0)) {
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
        response.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        response.on('end', () => resolve({ html: body, statusCode: statusCode ?? 200, cookies }));
        response.on('error', reject);
      });
      request.on('error', reject);
      request.setTimeout(15000, () => { request.destroy(); reject(new Error('Timed out')); });
    });
  };

  try {
    console.log('[Ahmia] Fetching homepage for CSRF token...');
    const { html: homeHtml, cookies: homeCookies } = await fetchUrl('ahmia.fi', '/');

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

    console.log(`[Ahmia] Fetching search results: ${searchPath}`);
    const { html, statusCode } = await fetchUrl('ahmia.fi', searchPath, homeCookies);

    const results: { title: string; description: string; url: string }[] = [];

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
      } catch {
        url = hrefMatch[1];
      }

      const titleMatch = /<a[^>]+>([\s\S]*?)<\/a>/i.exec(block);
      const title = titleMatch
        ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        : '(no title)';

      const descMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
      const description = descMatch
        ? descMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        : 'No description available';

      if (!url) continue;

      results.push({ title, description, url });
    }

    res.status(200).json({
      results,
      query: q,
      debug_html: resultArea.substring(0, 5000),
      debug_status: statusCode,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Ahmia] Error:', message);
    res.status(500).json({ error: message });
  }
}

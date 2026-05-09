const https = require('https');
const http = require('http');

module.exports = async (req: any, res: any) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const onionUrl: string = req.query?.url;
  if (!onionUrl) {
    res.status(400).json({ error: 'Missing query parameter: url' });
    return;
  }

  const onionMatch = onionUrl.match(/([a-z2-7]{16,56}\.onion)(\/[^\s]*)?/i);
  if (!onionMatch) {
    res.status(400).json({ error: 'Invalid or missing .onion URL' });
    return;
  }

  const onionHost = onionMatch[1];
  const onionPath = onionMatch[2] || '/';

  // Build gateway URLs — host portion replaces ".onion" with the gateway suffix
  const bareHost = onionHost.replace(/\.onion$/, '');

  const gateways = [
    `https://${bareHost}.onion.ly${onionPath}`,
    `https://${bareHost}.onion.pet${onionPath}`,
    `https://${bareHost}.tor2web.org${onionPath}`,
    `https://${bareHost}.tor2web.fi${onionPath}`,
    `https://${bareHost}.onion.ws${onionPath}`,
    `https://${bareHost}.onion.sh${onionPath}`,
  ];

  const fetchViaGateway = (gatewayUrl: string, depth = 0): Promise<{ html: string; status: number; gateway: string }> => {
    return new Promise((resolve, reject) => {
      if (depth > 3) { reject(new Error('Too many redirects')); return; }
      const parsed = new URL(gatewayUrl);
      const lib = parsed.protocol === 'https:' ? https : http;

      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
          'Connection': 'close',
        },
      };

      const request = lib.request(options, (response: any) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          const location: string = response.headers.location;
          const redirectUrl = location.startsWith('http')
            ? location
            : `${parsed.protocol}//${parsed.hostname}${location}`;
          fetchViaGateway(redirectUrl, depth + 1).then(resolve).catch(reject);
          return;
        }

        let body = '';
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString();
          if (body.length > 512_000) {
            request.destroy();
            resolve({ html: body.slice(0, 512_000), status: response.statusCode, gateway: gatewayUrl });
          }
        });
        response.on('end', () => resolve({ html: body, status: response.statusCode, gateway: gatewayUrl }));
        response.on('error', reject);
      });

      request.on('error', reject);
      request.setTimeout(20000, () => { request.destroy(); reject(new Error('Request timed out')); });
      request.end();
    });
  };

  const extractText = (html: string): string => {
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
    text = text.replace(/<\/(p|div|li|tr|h[1-6]|br|section|article|header|footer)>/gi, '\n');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&[a-z]+;/gi, ' ');
    return text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0).join('\n');
  };

  const extractTitle = (html: string): string => {
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    return match ? match[1].replace(/<[^>]+>/g, '').trim() : '(no title)';
  };

  const extractLinks = (html: string): { text: string; href: string }[] => {
    const links: { text: string; href: string }[] = [];
    const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null && links.length < 30) {
      const href = match[1];
      const text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (href && !href.startsWith('#') && !href.startsWith('javascript:') && text) {
        links.push({ text, href });
      }
    }
    return links;
  };

  let lastError = '';
  for (const gateway of gateways) {
    try {
      console.log(`[CrawlOnion] Trying: ${gateway}`);
      const { html, status, gateway: usedGateway } = await fetchViaGateway(gateway);

      if (status >= 400) {
        lastError = `HTTP ${status} from ${usedGateway}`;
        console.warn(`[CrawlOnion] ${lastError}`);
        continue;
      }

      const title = extractTitle(html);
      const text = extractText(html);
      const links = extractLinks(html);
      const truncated = text.length > 8_000 ? text.slice(0, 8_000) + '\n\n[... content truncated ...]' : text;

      console.log(`[CrawlOnion] Success via ${usedGateway}`);
      res.status(200).json({
        success: true,
        url: onionUrl,
        gateway: usedGateway,
        title,
        text: truncated,
        links: links.slice(0, 20),
        charCount: text.length,
      });
      return;

    } catch (err: any) {
      lastError = err.message;
      console.warn(`[CrawlOnion] Failed: ${lastError}`);
    }
  }

  res.status(502).json({
    success: false,
    error: `All gateways failed. Last error: ${lastError}`,
    url: onionUrl,
  });
};

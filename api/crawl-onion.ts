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

  // Validate it looks like an onion URL
  const onionMatch = onionUrl.match(/([a-z2-7]{16,56}\.onion)(\/[^\s]*)?/i);
  if (!onionMatch) {
    res.status(400).json({ error: 'Invalid or missing .onion URL' });
    return;
  }

  const onionHost = onionMatch[1];                        // e.g. abc123.onion
  const onionPath = onionMatch[2] || '/';                  // e.g. /some/path

  // ── Tor2Web gateway list (tried in order, first success wins) ──────────────
  // These are public gateways that proxy .onion → clearnet.
  // Some may be down; the fallback chain handles that.
  const gateways = [
    `https://${onionHost}.tor2web.io${onionPath}`,
    `https://${onionHost}.onion.ws${onionPath}`,
    `https://${onionHost}.onion.sh${onionPath}`,
    `https://${onionHost}.onion.city${onionPath}`,
    `https://${onionHost}.onion.cab${onionPath}`,
    `https://${onionHost}.s1.tor-gateways.de${onionPath}`,
  ];

  // ── Simple fetch helper ────────────────────────────────────────────────────
  const fetchViaGateway = (gatewayUrl: string): Promise<{ html: string; status: number; gateway: string }> => {
    return new Promise((resolve, reject) => {
      const parsed = new URL(gatewayUrl);
      const lib = parsed.protocol === 'https:' ? https : http;

      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
          'Connection': 'close',
        },
      };

      const request = lib.request(options, (response: any) => {
        // Follow single redirect
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          const location: string = response.headers.location;
          const redirectUrl = location.startsWith('http') ? location : `${parsed.protocol}//${parsed.hostname}${location}`;
          fetchViaGateway(redirectUrl)
            .then(resolve)
            .catch(reject);
          return;
        }

        let body = '';
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString();
          // Bail early if page is huge (>500 KB) to stay within Vercel limits
          if (body.length > 512_000) {
            request.destroy();
            resolve({ html: body.slice(0, 512_000), status: response.statusCode, gateway: gatewayUrl });
          }
        });
        response.on('end', () => resolve({ html: body, status: response.statusCode, gateway: gatewayUrl }));
        response.on('error', reject);
      });

      request.on('error', reject);
      request.on('timeout', () => { request.destroy(); reject(new Error('Request timed out')); });
      request.end();
    });
  };

  // ── Text extraction: strip HTML tags, collapse whitespace ─────────────────
  const extractText = (html: string): string => {
    // Remove <script>, <style>, <noscript> blocks entirely
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

    // Replace block elements with newlines for readability
    text = text.replace(/<\/(p|div|li|tr|h[1-6]|br|section|article|header|footer)>/gi, '\n');

    // Strip remaining tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode common HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&[a-z]+;/gi, ' ');

    // Collapse whitespace / blank lines
    text = text
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .join('\n');

    return text;
  };

  // ── Extract page title ─────────────────────────────────────────────────────
  const extractTitle = (html: string): string => {
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    return match ? match[1].replace(/<[^>]+>/g, '').trim() : '(no title)';
  };

  // ── Extract all visible links ──────────────────────────────────────────────
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

  // ── Try each gateway in sequence ──────────────────────────────────────────
  let lastError = '';
  for (const gateway of gateways) {
    try {
      console.log(`[CrawlOnion] Trying gateway: ${gateway}`);
      const { html, status, gateway: usedGateway } = await fetchViaGateway(gateway);

      if (status >= 400) {
        lastError = `Gateway ${usedGateway} returned HTTP ${status}`;
        console.warn(`[CrawlOnion] ${lastError}`);
        continue;
      }

      const title   = extractTitle(html);
      const text    = extractText(html);
      const links   = extractLinks(html);

      // Truncate text to ~8 000 chars so the AI response stays manageable
      const truncated = text.length > 8_000
        ? text.slice(0, 8_000) + '\n\n[... content truncated ...]'
        : text;

      console.log(`[CrawlOnion] Success via ${usedGateway} — ${text.length} chars extracted`);

      res.status(200).json({
        success:  true,
        url:      onionUrl,
        gateway:  usedGateway,
        title,
        text:     truncated,
        links:    links.slice(0, 20),
        charCount: text.length,
      });
      return;

    } catch (err: any) {
      lastError = err.message;
      console.warn(`[CrawlOnion] Gateway failed: ${lastError}`);
      // try next gateway
    }
  }

  // All gateways failed
  res.status(502).json({
    success: false,
    error: `All Tor2Web gateways failed. Last error: ${lastError}`,
    url: onionUrl,
  });
};

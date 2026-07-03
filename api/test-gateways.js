const https = require('https');
const http  = require('http');

const TOR_RELAY_URL = process.env.TOR_PROXY_URL || 'https://tor-prox.onrender.com';

const TEST_TARGETS = [
  'http://juhanurmihxlp77nkq76byazcldy2hlmovfu2epvl5ankdibsot4csyd.onion/',    // Ahmia
  'http://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion/',    // DuckDuckGo
  'http://www.facebookwkhpilnemxj7asber7cyc673qut2vxuiga3bd7qo2mucgid.onion/', // Facebook
];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  console.log(`[TestRelay] Using relay: ${TOR_RELAY_URL}`);

  // Simple HTTP GET to the relay's REST API
  const fetchViaRelay = (targetUrl) => {
    return new Promise((resolve) => {
      const started  = Date.now();
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
          const elapsed = Date.now() - started;
          let parsed_body = {};
          try { parsed_body = JSON.parse(body); } catch { parsed_body = { raw: body.slice(0, 200) }; }

          resolve({
            url:        targetUrl,
            status:     response.statusCode,
            elapsed_ms: elapsed,
            relay_response: parsed_body,
            verdict:    response.statusCode === 200 && parsed_body.success ? 'SUCCESS'
                      : response.statusCode === 200 ? 'RELAY_ERROR'
                      : 'FAILED',
          });
        });
        response.on('error', (err) => resolve({
          url: targetUrl, status: 0, elapsed_ms: Date.now() - started,
          error: err.message, verdict: 'FAILED',
        }));
      });

      request.on('error', (err) => resolve({
        url: targetUrl, status: 0, elapsed_ms: Date.now() - started,
        error: err.message, verdict: 'FAILED',
      }));

      request.setTimeout(35000, () => {
        request.destroy();
        resolve({
          url: targetUrl, status: 0, elapsed_ms: Date.now() - started,
          error: 'Timed out after 35s', verdict: 'TIMEOUT',
        });
      });

      request.end();
    });
  };

  // Health check — hit relay root first
  const healthCheck = await fetchViaRelay('http://check.torproject.org/');

  // Test onion targets concurrently
  const onionResults = await Promise.all(TEST_TARGETS.map(fetchViaRelay));
  const working = onionResults.filter(r => r.verdict === 'SUCCESS');

  res.status(200).json({
    relay: TOR_RELAY_URL,
    health_check: healthCheck,
    summary: {
      total:   onionResults.length,
      success: working.length,
      failed:  onionResults.length - working.length,
    },
    working_onions: working.map(r => r.url),
    results: onionResults,
  });
};

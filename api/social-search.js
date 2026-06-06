const https = require('https');

// ─────────────────────────────────────────────────────────────────────────────
// OpenMeasures Public API proxy
// Docs: https://docs.openmeasures.io/docs/guides/sources
//
// Maps user-friendly platform names → exact API site parameter values.
// Several platforms split into _video / _comment sub-types; we default to
// the content-bearing sub-type unless the caller passes the exact slug.
// ─────────────────────────────────────────────────────────────────────────────

const SITE_ALIASES = {
  // TikTok
  'tiktok':              'tiktok_comment',
  'tiktok_comment':      'tiktok_comment',
  'tiktok_video':        'tiktok_video',
  // BitChute
  'bitchute':            'bitchute_comment',
  'bitchute_comment':    'bitchute_comment',
  'bitchute_video':      'bitchute_video',
  // LBRY / Odysee
  'lbry':                'lbry_comment',
  'lbry_comment':        'lbry_comment',
  'lbry_video':          'lbry_video',
  'odysee':              'lbry_comment',
  // Rumble
  'rumble':              'rumble_comment',
  'rumble_comment':      'rumble_comment',
  'rumble_video':        'rumble_video',
  // RuTube
  'rutube':              'rutube_comment',
  'rutube_comment':      'rutube_comment',
  'rutube_video':        'rutube_video',
  // Truth Social — underscore required
  'truthsocial':         'truth_social',
  'truth_social':        'truth_social',
  'truth social':        'truth_social',
  // Scored / Win Communities — API slug is 'win'
  'scored':              'win',
  'win':                 'win',
  // WhatsApp
  'whatsapp':            'whatsapp',
  // Kiwi Farms
  'kiwifarms':           'kiwifarms',
  'kiwi farms':          'kiwifarms',
  // Platforms that pass through unchanged
  '4chan':               '4chan',
  '8kun':                '8kun',
  '8chan':               '8kun',
  'bluesky':             'bluesky',
  'fediverse':           'fediverse',
  'gab':                 'gab',
  'gettr':               'gettr',
  'mewe':                'mewe',
  'minds':               'minds',
  'ok':                  'ok',
  'odnoklassniki':       'ok',
  'parler':              'parler',
  'poal':                'poal',
  'telegram':            'telegram',
  'vk':                  'vk',
  'wimkin':              'wimkin',
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const term      = req.query?.term;
  const siteRaw   = (req.query?.site || 'telegram').toLowerCase().trim();
  const limit     = req.query?.limit     || '5';
  const querytype = req.query?.querytype || 'content';
  const since     = req.query?.since;
  const until     = req.query?.until;

  if (!term) {
    res.status(400).json({ error: 'Missing required query parameter: term' });
    return;
  }

  // Resolve alias → exact API slug
  const site = SITE_ALIASES[siteRaw];
  if (!site) {
    res.status(400).json({
      error: `Unknown platform "${siteRaw}". Valid values: ${Object.keys(SITE_ALIASES).join(', ')}`,
    });
    return;
  }

  // Build date window if not provided:
  // Free API only returns content at least 6 months old.
  let sinceParam = since;
  let untilParam = until;
  if (!sinceParam || !untilParam) {
    const untilDate = new Date();
    untilDate.setMonth(untilDate.getMonth() - 6);
    const sinceDate = new Date(untilDate);
    sinceDate.setFullYear(sinceDate.getFullYear() - 2);
    sinceParam = sinceParam || sinceDate.toISOString();
    untilParam = untilParam || untilDate.toISOString();
  }

  const params = new URLSearchParams({
    term,
    site,
    limit,
    querytype,
    since: sinceParam,
    until: untilParam,
  });

  const path = `/content?${params.toString()}`;
  console.log(`[OpenMeasures] site alias "${siteRaw}" → "${site}" | GET https://api.openmeasures.io${path}`);

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.openmeasures.io',
      path,
      method: 'GET',
      headers: {
        'Accept':     'application/json',
        'User-Agent': 'bl4ckdev/1.0',
      },
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        console.log(`[OpenMeasures] HTTP ${response.statusCode}`);

        if (response.statusCode === 429) {
          res.status(429).json({ error: 'Social Intelligence currently not available. Try again later.' });
          return resolve();
        }

        if (response.statusCode === 422) {
          res.status(422).json({
            error: `Social Intelligence rejected the request (HTTP 422). The resolved site slug was "${site}". Raw input was "${siteRaw}".`,
            resolved_site: site,
          });
          return resolve();
        }

        if (response.statusCode !== 200) {
          res.status(response.statusCode).json({
            error: `Social Intelligence returned HTTP ${response.statusCode}`,
            resolved_site: site,
          });
          return resolve();
        }

        try {
          const parsed = JSON.parse(data);
          res.setHeader('Cache-Control', 'no-store');
          // Attach the resolved site name so the client can confirm what was queried
          parsed._resolved_site = site;
          res.status(200).json(parsed);
        } catch (e) {
          console.error('[OpenMeasures] JSON parse error:', e.message);
          res.status(500).json({ error: 'Failed to parse Social Intelligence response' });
        }

        resolve();
      });

      response.on('error', (err) => {
        console.error('[OpenMeasures] Response error:', err.message);
        res.status(502).json({ error: `Upstream response error: ${err.message}` });
        resolve();
      });
    });

    request.on('error', (err) => {
      console.error('[OpenMeasures] Request error:', err.message);
      res.status(502).json({ error: `Proxy request failed: ${err.message}` });
      resolve();
    });

    request.setTimeout(15000, () => {
      request.destroy();
      res.status(504).json({ error: 'Social Intelligence request timed out' });
      resolve();
    });

    request.end();
  });
};

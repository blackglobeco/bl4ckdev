const https = require('https');

// ─────────────────────────────────────────────────────────────────────────────
// Netlas Responses Search API — city-based search
// Docs:    https://docs.netlas.io/api-reference/
// Cookbook: https://netlas.io/resources/cookbook/
//
// Endpoint: GET https://app.netlas.io/api/responses/
// Auth:     Authorization: Bearer <key>
// Query:    geo.city:London AND geo.country:GB
//           geo.city uses plain city name (no quotes for single word)
//           geo.country uses ISO 2-letter code
//
// KEY INSIGHT: Netlas GeoIP uses MaxMind/similar database which indexes
// IPs by nearest major city — not by municipal council boundaries.
// Ampang Jaya → indexed as "Kuala Lumpur"
// Subang Jaya → indexed as "Kuala Lumpur" or "Shah Alam"
// We resolve this by reverse-geocoding GPS lat/lon to nearest major city
// using a coordinate-to-major-city lookup instead of trusting Nominatim's
// municipal name.
// ─────────────────────────────────────────────────────────────────────────────

// Map full country name → ISO 2-letter code
const COUNTRY_ISO = {
  'Afghanistan':'AF','Albania':'AL','Algeria':'DZ','Argentina':'AR',
  'Australia':'AU','Austria':'AT','Bangladesh':'BD','Belgium':'BE',
  'Brazil':'BR','Cambodia':'KH','Canada':'CA','Chile':'CL',
  'China':'CN','Colombia':'CO','Czech Republic':'CZ','Denmark':'DK',
  'Egypt':'EG','Finland':'FI','France':'FR','Germany':'DE',
  'Ghana':'GH','Greece':'GR','Hong Kong':'HK','Hungary':'HU',
  'India':'IN','Indonesia':'ID','Iran':'IR','Iraq':'IQ',
  'Ireland':'IE','Israel':'IL','Italy':'IT','Japan':'JP',
  'Jordan':'JO','Kenya':'KE','South Korea':'KR','Kuwait':'KW',
  'Laos':'LA','Lebanon':'LB','Malaysia':'MY','Mexico':'MX',
  'Morocco':'MA','Myanmar':'MM','Nepal':'NP','Netherlands':'NL',
  'New Zealand':'NZ','Nigeria':'NG','Norway':'NO','Pakistan':'PK',
  'Peru':'PE','Philippines':'PH','Poland':'PL','Portugal':'PT',
  'Qatar':'QA','Romania':'RO','Russia':'RU','Saudi Arabia':'SA',
  'Singapore':'SG','South Africa':'ZA','Spain':'ES','Sri Lanka':'LK',
  'Sweden':'SE','Switzerland':'CH','Taiwan':'TW','Thailand':'TH',
  'Turkey':'TR','Ukraine':'UA','United Arab Emirates':'AE',
  'United Kingdom':'GB','United States':'US','Venezuela':'VE',
  'Vietnam':'VN','Yemen':'YE','Zimbabwe':'ZW',
};

// Resolve GPS coordinates to the nearest major city that GeoIP databases
// actually use — via ip-api's reverse geocode (free, no key)
function resolveNearestGeoIPCity(lat, lon) {
  return new Promise((resolve) => {
    // Use ip-api's fields to get city from coordinates via a nearby IP
    // Best free approach: BigDataCloud reverse geocode (no key, returns locality)
    const params = new URLSearchParams({
      latitude:       String(lat),
      longitude:      String(lon),
      localityLanguage: 'en',
    });

    const options = {
      hostname: 'api.bigdatacloud.net',
      path:     `/data/reverse-geocode-client?${params}`,
      method:   'GET',
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const d = JSON.parse(data);
          // BigDataCloud returns principalSubdivision, locality, city
          // "city" is the closest match to what GeoIP DBs use
          const city = d.city || d.locality || d.principalSubdivision || null;
          resolve(city);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(6000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return; }

  const NETLAS_KEY = process.env.NETLAS_API_KEY || '';
  if (!NETLAS_KEY) {
    res.status(500).json({ error: 'NETLAS_API_KEY not configured.' });
    return;
  }

  const { city, country, lat, lon, per_page = 20 } = req.body || {};
  if (!country) {
    res.status(400).json({ error: 'Missing country.' });
    return;
  }

  const countryCode = COUNTRY_ISO[country] || country.slice(0, 2).toUpperCase();

  // Resolve to a GeoIP-compatible city name using coordinates if available
  let geoCity = city || null;
  if (lat && lon) {
    const resolved = await resolveNearestGeoIPCity(lat, lon);
    if (resolved) geoCity = resolved;
    console.log(`[netlas] GPS (${lat},${lon}) → GeoIP city: "${resolved}" (Nominatim was: "${city}")`);
  }

  // Build query: city + country if we have a city, otherwise country only
  const query = geoCity
    ? `geo.city:${geoCity} AND geo.country:${countryCode}`
    : `geo.country:${countryCode}`;

  console.log(`[netlas] Query: ${query}`);

  const params = new URLSearchParams({
    q:           query,
    start:       '0',
    source_type: 'include',
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'app.netlas.io',
      path:     `/api/responses/?${params.toString()}`,
      method:   'GET',
      headers:  {
        'Authorization': `Bearer ${NETLAS_KEY}`,
        'Accept':        'application/json',
      },
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        try {
          const netlas = JSON.parse(data);

          console.log('[netlas] HTTP', response.statusCode,
            JSON.stringify(netlas).slice(0, 200));

          if (response.statusCode === 401 || response.statusCode === 403) {
            res.status(response.statusCode).json({ error: 'Netlas API key invalid or unauthorized.' });
            return resolve();
          }
          if (response.statusCode === 402) {
            res.status(402).json({ error: 'Netlas daily limit reached (50 req/day on free plan).' });
            return resolve();
          }
          if (response.statusCode === 429) {
            res.status(429).json({ error: 'Netlas rate limit hit. Try again shortly.' });
            return resolve();
          }
          if (response.statusCode !== 200) {
            res.status(response.statusCode).json({
              error: netlas?.message || netlas?.detail || `Netlas error ${response.statusCode}`,
            });
            return resolve();
          }

          const items = (netlas.items || []).slice(0, per_page);

          if (!items.length) {
            // City query returned 0 — fall back to country-only
            if (geoCity) {
              console.log(`[netlas] 0 results for city "${geoCity}", client should retry country-only`);
            }
            res.status(200).json({ result: { hits: [], resolvedCity: geoCity } });
            return resolve();
          }

          const hits = items.map(item => {
            const d     = item.data || {};
            const geo   = d.geo    || {};
            const whois = d.whois  || {};
            const asn   = whois.asn || {};
            const http  = d.http   || {};
            const cert  = d.certificate || {};

            const httpTitle = http.title;
            const tlsCN     = cert.subject?.common_name?.[0];
            const banner    = httpTitle
              ? String(httpTitle).slice(0, 120)
              : tlsCN ? `TLS: ${tlsCN}` : undefined;

            const asnNumbers = asn.number || [];
            const asnNum     = asnNumbers.length ? parseInt(asnNumbers[0]) : undefined;

            return {
              ip: d.ip,
              services: [{
                port:               d.port,
                transport_protocol: (d.prot4 || 'TCP').toUpperCase(),
                service_name:       (d.prot7 || d.protocol || 'UNKNOWN').toUpperCase(),
                banner,
                software:  undefined,
                labels:    undefined,
              }],
              autonomous_system: {
                name: d.isp || asn.name || 'Unknown ISP',
                asn:  asnNum,
              },
              location: {
                city:    geo.city    || geoCity || '',
                country: geo.country || countryCode,
              },
              last_updated_at: d['@timestamp']
                ? new Date(d['@timestamp']).toISOString()
                : new Date().toISOString(),
            };
          });

          res.status(200).json({ result: { hits, resolvedCity: geoCity } });
        } catch (e) {
          console.error('[netlas] Parse error:', e.message, '| raw:', data.slice(0, 200));
          res.status(500).json({ error: 'Failed to parse Netlas response' });
        }
        resolve();
      });
    });

    request.on('error', err => {
      console.error('[netlas] Request error:', err.message);
      res.status(500).json({ error: `Proxy error: ${err.message}` });
      resolve();
    });

    request.setTimeout(15000, () => {
      request.destroy();
      res.status(504).json({ error: 'Netlas request timed out' });
      resolve();
    });

    request.end();
  });
};

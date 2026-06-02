const https = require('https');

// Helper to make a single HTTPS GET and return parsed JSON
function httpsGet(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('JSON parse failed: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const mode   = req.query?.mode || 'cells';
  const OPENCELLID_KEY = process.env.OPENCELLID_API_KEY || '';
  if (!OPENCELLID_KEY) {
    res.status(500).json({ error: 'OpenCellID API key not configured on server.' });
    return;
  }

  // ── mode=size  ───────────────────────────────────────────────────────────
  if (mode === 'size') {
    const latmin = parseFloat(req.query?.latmin);
    const lonmin = parseFloat(req.query?.lonmin);
    const latmax = parseFloat(req.query?.latmax);
    const lonmax = parseFloat(req.query?.lonmax);
    if ([latmin, lonmin, latmax, lonmax].some(isNaN) || latmin >= latmax || lonmin >= lonmax) {
      res.status(400).json({ error: 'Invalid bbox params' }); return;
    }
    const bbox = `${latmin},${lonmin},${latmax},${lonmax}`;
    try {
      const r = await httpsGet({
        hostname: 'opencellid.org',
        path: `/cell/getInAreaSize?key=${OPENCELLID_KEY}&BBOX=${bbox}&format=json`,
        method: 'GET',
        headers: { 'Accept': 'application/json', 'User-Agent': 'bl4ckdev/1.0' },
      });
      res.status(r.status).json(r.body);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // ── mode=cells  ──────────────────────────────────────────────────────────
  // Step 1: getInArea to discover which cells exist in the bbox
  if (mode === 'cells') {
    const latmin = parseFloat(req.query?.latmin);
    const lonmin = parseFloat(req.query?.lonmin);
    const latmax = parseFloat(req.query?.latmax);
    const lonmax = parseFloat(req.query?.lonmax);
    if ([latmin, lonmin, latmax, lonmax].some(isNaN) || latmin >= latmax || lonmin >= lonmax) {
      res.status(400).json({ error: 'Invalid bbox params' }); return;
    }
    const bbox = `${latmin},${lonmin},${latmax},${lonmax}`;
    console.log(`[OpenCellID] getInArea BBOX=${bbox}`);
    try {
      const areaRes = await httpsGet({
        hostname: 'opencellid.org',
        path: `/cell/getInArea?key=${OPENCELLID_KEY}&BBOX=${bbox}&format=json&limit=100`,
        method: 'GET',
        headers: { 'Accept': 'application/json', 'User-Agent': 'bl4ckdev/1.0' },
      });
      if (!areaRes.body.cells || areaRes.body.cells.length === 0) {
        res.status(200).json({ cells: [] }); return;
      }

      // Step 2: call getPosition for each unique cell to get precise coordinates
      // Deduplicate by cellid to avoid redundant lookups
      const seen = new Set();
      const uniqueCells = areaRes.body.cells.filter(c => {
        const key = `${c.mcc}-${c.mnc}-${c.lac || c.tac}-${c.cellid}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log(`[OpenCellID] getInArea returned ${areaRes.body.cells.length} cells, ${uniqueCells.length} unique — fetching precise positions`);

      // Fetch precise position for each unique cell (cap at 50 to stay within rate limits)
      const toFetch = uniqueCells.slice(0, 50);
      const positionResults = await Promise.allSettled(
        toFetch.map(async (c) => {
          const lac  = c.lac  || c.tac  || 0;
          const path = `/cell/getPosition?key=${OPENCELLID_KEY}&mcc=${c.mcc}&mnc=${c.mnc}&lac=${lac}&cellid=${c.cellid}&format=json`;
          const r = await httpsGet({
            hostname: 'opencellid.org',
            path,
            method: 'GET',
            headers: { 'Accept': 'application/json', 'User-Agent': 'bl4ckdev/1.0' },
          });
          // getPosition returns { lat, lon, mcc, mnc, lac, cellid, averageSignalStrength, range, samples, changeable, radio }
          if (r.body.error) throw new Error(r.body.error);
          // Merge precise position with original area cell data
          return {
            ...c,
            lat: Number(r.body.lat),
            lon: Number(r.body.lon),
            range:         Number(r.body.range)                 || c.range   || 1000,
            samples:       Number(r.body.samples)               || c.samples || 0,
            averageSignalStrength: Number(r.body.averageSignalStrength) || 0,
            changeable:    r.body.changeable,
          };
        })
      );

      // Collect successful results; fall back to area data for failed ones
      const preciseCells = positionResults.map((result, i) => {
        if (result.status === 'fulfilled') return result.value;
        console.warn(`[OpenCellID] getPosition failed for cell ${toFetch[i].cellid}:`, result.reason?.message);
        return toFetch[i]; // use original 3dp coords as fallback
      });

      console.log(`[OpenCellID] Returning ${preciseCells.length} cells with precise positions`);
      res.status(200).json({ cells: preciseCells, count: preciseCells.length });
    } catch (e) {
      console.error('[OpenCellID] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(400).json({ error: 'Unknown mode. Use mode=size or mode=cells' });
};

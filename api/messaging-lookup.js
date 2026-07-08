// api/messaging-lookup.js
// Social Footprint Intelligence — wp-data.p.rapidapi.com
// Free tier: only /number endpoint is available

const BASE = 'https://wp-data.p.rapidapi.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const API_KEY = process.env.CHECKLEAKED_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'CHECKLEAKED_API_KEY not configured' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
  }

  const { number } = body || {};
  if (!number) return res.status(400).json({ error: 'number is required' });

  const clean = String(number).replace(/[\s\-().]/g, '').replace(/^\+/, '');

  try {
    const response = await fetch(
      `${BASE}/number/${clean}?includeLeakCheckPro=true&fullAiReport=true&reverseImageSearch=true&telegram=true`,
      {
        method: 'GET',
        headers: {
          'x-rapidapi-key': API_KEY,
          'x-rapidapi-host': 'wp-data.p.rapidapi.com',
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `API returned HTTP ${response.status}`, detail: errText });
    }

    const data = await response.json();
    return res.status(200).json({ number: clean, profile: data });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

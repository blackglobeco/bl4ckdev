/**
 * api/verify-passcode.js
 * Server-side passcode validation — passcodes never reach the client bundle.
 *
 * Vercel env var required:
 *   VALID_PASSCODES=BID366026,BID091939,BID327941
 *
 * Set this in: Vercel Dashboard → Project → Settings → Environment Variables
 * Then REMOVE the src/passcodes.ts file and the 3 hardcoded values.
 */

export default function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { passcode } = req.body;

  if (!passcode || typeof passcode !== 'string') {
    return res.status(400).json({ error: 'Missing passcode' });
  }

  // Read from env var — never exposed to the client
  const raw = process.env.VALID_PASSCODES || '';
  const validPasscodes = raw.split(',').map(p => p.trim()).filter(Boolean);

  if (validPasscodes.length === 0) {
    console.error('[verify-passcode] VALID_PASSCODES env var is not set');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  if (!validPasscodes.includes(passcode.trim())) {
    // Short delay to slow brute-force attempts
    return setTimeout(() => {
      res.status(401).json({ error: 'Invalid passcode' });
    }, 500);
  }

  return res.status(200).json({ ok: true });
}

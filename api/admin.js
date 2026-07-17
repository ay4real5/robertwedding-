// Admin endpoint: POST { password } -> every RSVP with stats.
// The password lives in the ADMIN_PASSWORD env var on Vercel.
const crypto = require('crypto');
const {
  listEntries,
  occupancyFrom,
  readEntry,
  publicAvailability,
} = require('./_store');

function passwordOk(supplied) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return false;
  const a = Buffer.from(String(supplied || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = typeof req.body === 'object' && req.body ? req.body : {};
    if (!passwordOk(body.password)) {
      await new Promise((r) => setTimeout(r, 500)); // slow down guessing
      return res.status(401).json({ error: 'Wrong password' });
    }

    const blobs = await listEntries();
    const entries = (
      await Promise.all(
        blobs.map(async (b) => {
          const data = await readEntry(b.pathname);
          return data ? { ...data, _path: b.pathname } : null;
        })
      )
    ).filter(Boolean);

    entries.sort((a, b) => (a.ts < b.ts ? 1 : -1)); // newest first

    const accepted = entries.filter((e) => e.attending && !e.waitlist);
    const waitlist = entries.filter((e) => e.attending && e.waitlist);
    const declined = entries.filter((e) => !e.attending);
    const totalGuests = accepted.reduce((s, e) => s + (e.guests || 1), 0);

    return res.status(200).json({
      entries,
      stats: {
        responses: entries.length,
        accepted: accepted.length,
        declined: declined.length,
        waitlisted: waitlist.length,
        totalGuests,
      },
      availability: publicAvailability(occupancyFrom(blobs)),
    });
  } catch (err) {
    console.error('admin error:', err);
    return res.status(500).json({ error: 'Failed to load RSVPs.' });
  }
};

// RSVP endpoint.
// GET  -> live seat availability (no personal data).
// POST -> record a response (accept or decline) and assign a table.
const {
  SEATS_PER_TABLE,
  listEntries,
  occupancyFrom,
  findTable,
  saveEntry,
  publicAvailability,
  clip,
} = require('./_store');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const tables = occupancyFrom(await listEntries());
      return res.status(200).json(publicAvailability(tables));
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = typeof req.body === 'object' && req.body ? req.body : {};

    // Honeypot: real guests never fill this hidden field.
    if (clip(body.website, 50)) {
      return res.status(200).json({ ok: true });
    }

    const attending = body.attending === true || body.attending === 'yes';
    const name = clip(body.name, 120);
    const email = clip(body.email, 200);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A name and a valid email are required.' });
    }

    const base = {
      attending,
      name,
      email,
      phone: clip(body.phone, 40),
      message: clip(body.message, 2000),
      ts: new Date().toISOString(),
      ua: clip(req.headers['user-agent'], 200),
    };

    if (!attending) {
      await saveEntry(base, 0);
      return res.status(200).json({ ok: true, attending: false });
    }

    let guests = parseInt(body.guests, 10);
    if (!(guests >= 1 && guests <= SEATS_PER_TABLE)) guests = 1;

    const entry = {
      ...base,
      guests,
      guestNames: clip(body.guestNames, 400),
      dietary: clip(body.dietary, 1000),
    };

    const tables = occupancyFrom(await listEntries());
    const tableIdx = findTable(guests, tables);

    if (tableIdx === -1) {
      entry.waitlist = true;
      await saveEntry(entry, 0);
      return res.status(200).json({ ok: true, attending: true, waitlist: true });
    }

    const seats = [];
    for (let i = 0; i < guests; i++) seats.push(tables[tableIdx] + 1 + i);
    entry.table = tableIdx + 1;
    entry.seats = seats;
    await saveEntry(entry, tableIdx + 1);

    tables[tableIdx] += guests;
    return res.status(200).json({
      ok: true,
      attending: true,
      table: tableIdx + 1,
      seats,
      seatsLeftAtTable: SEATS_PER_TABLE - tables[tableIdx],
      availability: publicAvailability(tables),
    });
  } catch (err) {
    console.error('rsvp error:', err);
    return res.status(500).json({ error: 'Something went wrong saving your RSVP.' });
  }
};

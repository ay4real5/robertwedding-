// Shared RSVP storage helpers — one private blob per response.
// Accept pathnames encode table + guest count so seat occupancy can be
// computed from a cheap list() without reading blob contents:
//   rsvps/acc-t03-g2-<timestamp>-<rand>.json   (table 3, 2 guests)
//   rsvps/acc-t00-g2-<timestamp>-<rand>.json   (t00 = waitlist, tables full)
//   rsvps/dec-<timestamp>-<rand>.json          (decline)
const { list, put, get } = require('@vercel/blob');

const TOTAL_TABLES = 10;
const SEATS_PER_TABLE = 5;
const RESERVED_TABLES = 2; // tables 1-2 reserved for family; guests start at table 3
const PREFIX = 'rsvps/';

async function listEntries() {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

// tables[i] = seats occupied at table i (0-indexed), from pathnames alone.
function occupancyFrom(blobs) {
  const tables = new Array(TOTAL_TABLES).fill(0);
  for (const b of blobs) {
    const m = /acc-t(\d\d)-g(\d)/.exec(b.pathname);
    if (!m) continue;
    const t = parseInt(m[1], 10);
    const g = parseInt(m[2], 10);
    if (t >= 1 && t <= TOTAL_TABLES) tables[t - 1] += g;
  }
  return tables;
}

function findTable(numGuests, tables) {
  for (let i = RESERVED_TABLES; i < tables.length; i++) {
    if (tables[i] + numGuests <= SEATS_PER_TABLE) return i;
  }
  return -1;
}

async function saveEntry(entry, tableNum /* 1-based, 0 = waitlist/decline */) {
  const rand = Math.random().toString(36).slice(2, 8);
  const name =
    entry.attending
      ? `${PREFIX}acc-t${String(tableNum).padStart(2, '0')}-g${entry.guests}-${Date.now()}-${rand}.json`
      : `${PREFIX}dec-${Date.now()}-${rand}.json`;
  await put(name, JSON.stringify(entry), {
    access: 'private',
    contentType: 'application/json',
  });
  return name;
}

async function readEntry(pathname) {
  // get() returns { stream, blob: <metadata> } — content is in the stream.
  const res = await get(pathname, { access: 'private', useCache: false });
  if (!res || !res.stream) return null;
  try {
    return JSON.parse(await new Response(res.stream).text());
  } catch {
    return null;
  }
}

function publicAvailability(tables) {
  let seatsLeft = 0;
  for (let i = RESERVED_TABLES; i < tables.length; i++) {
    seatsLeft += SEATS_PER_TABLE - tables[i];
  }
  return {
    tables,
    totalTables: TOTAL_TABLES,
    seatsPerTable: SEATS_PER_TABLE,
    reservedTables: RESERVED_TABLES,
    seatsLeft,
  };
}

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

module.exports = {
  TOTAL_TABLES,
  SEATS_PER_TABLE,
  RESERVED_TABLES,
  listEntries,
  occupancyFrom,
  findTable,
  saveEntry,
  readEntry,
  publicAvailability,
  clip,
};

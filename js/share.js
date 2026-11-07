// A share link carries the whole list inside the part of the URL after the #,
// which browsers never send to any server. PDFs carry the same code, so they can be read back.

export const PDF_DATA_PREFIX = 'guestlist:';

const encodeB64 = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const decodeB64 = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

// Shrinks the list: short keys, nothing a fresh copy can work out for itself.
const pack = (state) => ({
  n: state.names,
  d: state.date,
  c: state.capacity,
  m: state.metaAt,
  g: state.guests.map((g) => [g.id, g.name, g.party, g.table, g.contact, g.group, g.note, g.status[0], g.okDup ? 1 : 0, g.updatedAt]),
  r: state.removed,
});

const STATUS = { w: 'waiting', c: 'coming', d: 'declined' };

const unpack = (p) => ({
  names: p.n,
  date: p.d,
  capacity: p.c,
  metaAt: p.m,
  guests: (Array.isArray(p.g) ? p.g : []).map((a) => ({
    id: a[0],
    name: a[1],
    party: a[2],
    table: a[3],
    contact: a[4],
    group: a[5],
    note: a[6],
    status: STATUS[a[7]],
    okDup: a[8] === 1,
    updatedAt: a[9],
  })),
  removed: p.r,
});

export async function encodeList(state) {
  const raw = new TextEncoder().encode(JSON.stringify(pack(state)));
  if (typeof CompressionStream === 'function') return `z${encodeB64(await pipe(raw, new CompressionStream('deflate-raw')))}`;
  return `j${encodeB64(raw)}`;
}

// Returns the raw list, or null if the link is damaged. Callers still run it through clean().
export async function decodeList(code) {
  try {
    const bytes = decodeB64(code.slice(1));
    const raw = code[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
    return unpack(JSON.parse(new TextDecoder().decode(raw)));
  } catch {
    return null;
  }
}

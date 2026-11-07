import test from 'node:test';
import assert from 'node:assert/strict';
import { handleList, Conflict } from '../api/_lists.js';
import { createStore, fingerprint } from '../js/store.js';
import { createSync } from '../js/sync.js';
import { memoryStorage } from './support/memory-storage.js';

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
const guest = (id, name, extra = {}) => ({ id, name, party: 1, table: '', contact: '', group: '', note: '', status: 'waiting', okDup: false, updatedAt: 100, ...extra });
const list = (...guests) => ({ names: '', date: '', capacity: null, metaAt: 0, guests, removed: {} });

const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

// fetch() as the browser would see it, wired straight to the real handler.
const fetchFor = (server, { down = () => false, unavailable = () => false } = {}) => async (url, opts = {}) => {
  if (down()) throw new TypeError('Failed to fetch');
  if (unavailable()) return { status: 503, ok: false, json: async () => ({ error: 'storage-unavailable' }) };
  const r = await handleList(
    { method: opts.method || 'GET', token: opts.headers?.['x-list-token'], version: opts.headers?.['if-none-match'], body: opts.body ? JSON.parse(opts.body) : null },
    server
  );
  return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => JSON.parse(JSON.stringify(r.json)) };
};

const device = (server, opts = {}) => {
  const storage = memory();
  const statuses = [];
  let sync = null;
  const store = createStore((reason) => {
    if (reason !== 'remote' && reason !== 'switch') sync?.changed(reason);
  }, storage);
  sync = createSync(store, { storage, fetchImpl: fetchFor(server, opts), onStatus: (s) => statuses.push(s) });
  return { store, sync, statuses, storage };
};

const add = (d, ...names) => d.store.change((s) => names.forEach((n) => s.guests.push(d.store.newGuest({ name: n }))), { reason: 'add' });
const names = (d) => d.store.state.guests.map((g) => g.name).sort();
const settle = async (...devices) => {
  for (let round = 0; round < 3; round++) {
    for (const d of devices) {
      await d.sync.push();
      await d.sync.pull();
    }
  }
};

/* ---------- the server ---------- */

test('a list token is required and must look right', async () => {
  const server = memoryStorage();
  for (const token of [undefined, '', 'short', 'has spaces in it but is long enough', '../../etc/passwd/../../etc/passwd']) {
    assert.equal((await handleList({ method: 'GET', token }, server)).status, 400, String(token));
  }
});

test('save, read back, and a cheap "nothing changed" check', async () => {
  const server = memoryStorage();
  assert.deepEqual((await handleList({ method: 'GET', token: TOKEN }, server)).json, { state: null, version: null });
  const saved = await handleList({ method: 'PUT', token: TOKEN, body: { state: list(guest('a', 'Ada Obi')) } }, server);
  assert.equal(saved.status, 200);
  const read = await handleList({ method: 'GET', token: TOKEN }, server);
  assert.deepEqual(read.json.state.guests.map((g) => g.name), ['Ada Obi']);
  assert.equal((await handleList({ method: 'GET', token: TOKEN, version: read.json.version }, server)).status, 304);
});

test('the token is never stored, only a hash of it', async () => {
  const server = memoryStorage();
  await handleList({ method: 'PUT', token: TOKEN, body: { state: list(guest('a', 'Ada')) } }, server);
  const [path] = [...server.blobs.keys()];
  assert.match(path, /^lists\/[0-9a-f]{64}\.json$/);
  assert.ok(!path.includes(TOKEN) && ![...server.blobs.values()][0].text.includes(TOKEN));
});

test('two phones saving different guests keep both', async () => {
  const server = memoryStorage();
  await handleList({ method: 'PUT', token: TOKEN, body: { state: list(guest('a', 'Ada')) } }, server);
  const second = await handleList({ method: 'PUT', token: TOKEN, body: { state: list(guest('b', 'Tunde')) } }, server);
  assert.deepEqual(second.json.state.guests.map((g) => g.name).sort(), ['Ada', 'Tunde']);
});

test('a save that loses a race re-reads and merges instead of overwriting', async () => {
  const server = memoryStorage();
  await handleList({ method: 'PUT', token: TOKEN, body: { state: list(guest('a', 'Ada')) } }, server);
  const racy = { ...server, read: server.read, remove: server.remove };
  let sneak = true;
  racy.write = async (path, text, etag) => {
    if (sneak) {
      sneak = false; // another phone saves in between our read and write
      const other = JSON.parse(server.blobs.get(path).text);
      other.state.guests.push(guest('c', 'Bisi'));
      await server.write(path, JSON.stringify(other), etag);
      return server.write(path, text, etag); // our stale write is refused
    }
    return server.write(path, text, etag);
  };
  const result = await handleList({ method: 'PUT', token: TOKEN, body: { state: list(guest('b', 'Tunde')) } }, racy);
  assert.equal(result.status, 200);
  assert.deepEqual(result.json.state.guests.map((g) => g.name).sort(), ['Ada', 'Bisi', 'Tunde']);
});

test('a race that never ends gives up politely', async () => {
  const server = memoryStorage();
  const always = { read: server.read, remove: server.remove, write: async () => { throw new Conflict(); } };
  assert.equal((await handleList({ method: 'PUT', token: TOKEN, body: { state: list(guest('a', 'Ada')) } }, always)).status, 409);
});

test('a big list keeps saving when storage hands back a weak (compressed) version', async () => {
  // Found live: Vercel marks bigger blobs W/"…" on the way out, and every later save of a
  // 30-guest list was refused until the phone gave up with 409.
  const server = memoryStorage({ weakAbove: 1000 });
  const many = (n) => Array.from({ length: n }, (_, i) => guest(`g${i}`, `Guest number ${i}`, { updatedAt: 100 + i }));
  const first = await handleList({ method: 'PUT', token: TOKEN, body: { state: list(...many(30)) } }, server);
  assert.equal(first.status, 200);
  const read = await handleList({ method: 'GET', token: TOKEN }, server);
  assert.ok(!read.json.version.startsWith('W/'), 'phones are handed the exact version');
  const second = await handleList({ method: 'PUT', token: TOKEN, body: { state: list(...many(45)) } }, server);
  assert.equal(second.status, 200);
  assert.equal(second.json.state.guests.length, 45);
  // A phone that still holds the weak form asks "anything new?" and is told no.
  assert.equal((await handleList({ method: 'GET', token: TOKEN, version: `W/${second.json.version}` }, server)).status, 304);
});

test('two phones with big lists keep in step', async () => {
  const server = memoryStorage({ weakAbove: 1000 });
  const a = device(server);
  const b = device(server);
  add(a, ...Array.from({ length: 30 }, (_, i) => `Phone A guest ${i}`));
  await a.sync.push();
  b.sync.open(a.sync.token);
  await b.sync.pull();
  add(b, 'Added on phone B');
  await b.sync.push();
  add(a, 'Added on phone A');
  await a.sync.push();
  await b.sync.pull();
  assert.equal(a.statuses.at(-1), 'saved');
  assert.equal(b.statuses.at(-1), 'saved');
  assert.equal(b.store.state.guests.length, 32);
  assert.deepEqual(names(a), names(b));
});

test('saving what the server already has costs no write', async () => {
  const server = memoryStorage();
  const state = list(guest('a', 'Ada'));
  await handleList({ method: 'PUT', token: TOKEN, body: { state } }, server);
  const writes = server.stats.writes;
  await handleList({ method: 'PUT', token: TOKEN, body: { state } }, server);
  assert.equal(server.stats.writes, writes);
});

test('the server cleans what it is sent', async () => {
  const server = memoryStorage();
  const r = await handleList({ method: 'PUT', token: TOKEN, body: { state: { guests: [{ id: 'x', name: '<script>alert(1)</script>', party: 1e9, status: 'evil' }, 'junk'], names: 7 } } }, server);
  assert.equal(r.json.state.guests.length, 1);
  assert.equal(r.json.state.guests[0].party, 99);
  assert.equal(r.json.state.guests[0].status, 'waiting');
  assert.equal(r.json.state.names, '');
  for (const body of [null, 'text', {}, { state: 'nope' }]) assert.equal((await handleList({ method: 'PUT', token: TOKEN, body }, server)).status, 400);
});

test('a huge list is refused, not stored', async () => {
  const server = memoryStorage();
  const guests = Array.from({ length: 5000 }, (_, i) => guest(`g${i}`, `Guest ${i} ${'x'.repeat(100)}`, { note: 'n'.repeat(200), contact: '0'.repeat(60) }));
  assert.equal((await handleList({ method: 'PUT', token: TOKEN, body: { state: list(...guests) } }, server)).status, 413);
  assert.equal(server.blobs.size, 0);
});

test('delete removes the list', async () => {
  const server = memoryStorage();
  await handleList({ method: 'PUT', token: TOKEN, body: { state: list(guest('a', 'Ada')) } }, server);
  assert.equal((await handleList({ method: 'DELETE', token: TOKEN }, server)).status, 204);
  assert.equal((await handleList({ method: 'GET', token: TOKEN }, server)).json.state, null);
});

/* ---------- phones talking through the server ---------- */

test('a guest added on one phone appears on the other', async () => {
  const server = memoryStorage();
  const a = device(server);
  const b = device(server);
  add(a, 'Ada Obi', 'Tunde Bakare');
  await a.sync.push();
  b.sync.open(a.sync.token);
  await b.sync.pull();
  assert.deepEqual(names(b), ['Ada Obi', 'Tunde Bakare']);
  assert.equal(b.statuses.at(-1), 'saved');
});

test('both phones editing at once end up identical, keeping both edits', async () => {
  const server = memoryStorage();
  const a = device(server);
  const b = device(server);
  add(a, 'Ada Obi', 'Tunde Bakare');
  await a.sync.push();
  b.sync.open(a.sync.token);
  await b.sync.pull();

  const ada = a.store.state.guests.find((g) => g.name === 'Ada Obi');
  a.store.change(() => Object.assign(ada, { party: 3, updatedAt: Date.now() }), { reason: 'party' });
  const tunde = b.store.state.guests.find((g) => g.name === 'Tunde Bakare');
  b.store.change(() => Object.assign(tunde, { status: 'coming', updatedAt: Date.now() }), { reason: 'status' });
  add(b, 'Bisi Ola');
  a.store.change((s) => { s.names = 'Tabitha & Ohi'; s.metaAt = Date.now(); }, { reason: 'meta' });

  await settle(a, b);
  assert.equal(fingerprint(a.store.state), fingerprint(b.store.state));
  const final = a.store.state;
  assert.equal(final.guests.find((g) => g.name === 'Ada Obi').party, 3);
  assert.equal(final.guests.find((g) => g.name === 'Tunde Bakare').status, 'coming');
  assert.ok(final.guests.some((g) => g.name === 'Bisi Ola'));
  assert.equal(b.store.state.names, 'Tabitha & Ohi');
});

test('a removal on one phone removes it everywhere', async () => {
  const server = memoryStorage();
  const a = device(server);
  const b = device(server);
  add(a, 'Ada Obi', 'Tunde Bakare');
  await a.sync.push();
  b.sync.open(a.sync.token);
  await b.sync.pull();
  b.store.change((s) => {
    const g = s.guests.find((x) => x.name === 'Ada Obi');
    s.guests = s.guests.filter((x) => x !== g);
    s.removed[g.id] = Date.now();
  }, { reason: 'remove' });
  await settle(b, a);
  assert.deepEqual(names(a), ['Tunde Bakare']);
});

test("undo on one phone does not wipe out the other phone's new guests", async () => {
  const server = memoryStorage();
  const a = device(server);
  const b = device(server);
  add(a, 'Ada Obi');
  await a.sync.push();
  b.sync.open(a.sync.token);
  await b.sync.pull();
  add(a, 'Mistake Person');
  await a.sync.push();
  add(b, 'Partner Added');
  await settle(b, a);
  assert.ok(names(a).includes('Partner Added'));
  a.store.undo(); // undoes "Mistake Person" only
  await settle(a, b);
  assert.deepEqual(names(a), ['Ada Obi', 'Partner Added']);
  assert.deepEqual(names(b), ['Ada Obi', 'Partner Added']);
});

test('clearing the list and undoing it brings everyone back on every phone', async () => {
  const server = memoryStorage();
  const a = device(server);
  const b = device(server);
  add(a, 'Ada Obi', 'Tunde Bakare');
  a.store.change((s) => { s.names = 'T & O'; s.metaAt = Date.now(); }, { reason: 'meta' });
  await a.sync.push();
  b.sync.open(a.sync.token);
  await b.sync.pull();
  a.store.change((s) => {
    const now = Date.now();
    for (const g of s.guests) s.removed[g.id] = now;
    Object.assign(s, { guests: [], names: '', date: '', capacity: null, metaAt: now });
  }, { reason: 'replace' });
  await settle(a, b);
  assert.deepEqual(names(b), []);
  await new Promise((r) => setTimeout(r, 5));
  a.store.undo();
  await settle(a, b);
  assert.deepEqual(names(b), ['Ada Obi', 'Tunde Bakare']);
  assert.equal(b.store.state.names, 'T & O');
});

test('offline edits are kept and go online later', async () => {
  const server = memoryStorage();
  let offline = true;
  const a = device(server, { down: () => offline });
  add(a, 'Ada Obi');
  await a.sync.push();
  assert.ok(['offline', 'error'].includes(a.statuses.at(-1)), a.statuses.at(-1));
  assert.equal(server.blobs.size, 0);
  offline = false;
  await a.sync.push();
  assert.equal(a.statuses.at(-1), 'saved');
  assert.equal(server.blobs.size, 1);
});

test('if online saving is switched off, the phone says so and keeps working', async () => {
  const server = memoryStorage();
  const a = device(server, { unavailable: () => true });
  add(a, 'Ada Obi');
  await a.sync.push();
  assert.equal(a.statuses.at(-1), 'local');
  assert.deepEqual(names(a), ['Ada Obi']);
});

test('a list made before online saving existed gets uploaded', async () => {
  const server = memoryStorage();
  const storage = memory();
  storage.setItem('guestlist.v1', JSON.stringify(list(guest('a', 'Old Local Guest'))));
  const store = createStore(null, storage);
  const sync = createSync(store, { storage, fetchImpl: fetchFor(server) });
  assert.equal(sync.token, null);
  sync.changed('migrate');
  await sync.push();
  assert.ok(sync.token);
  assert.equal(server.blobs.size, 1);
});

test('the link survives a reload', () => {
  const server = memoryStorage();
  const a = device(server);
  const token = a.sync.ensureToken();
  const again = createSync(a.store, { storage: a.storage, fetchImpl: fetchFor(server) });
  assert.equal(again.token, token);
});

test('three phones making random edits in random order always agree in the end', async () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let trial = 0; trial < 6; trial++) {
    const server = memoryStorage();
    const phones = [device(server), device(server), device(server)];
    add(phones[0], 'Seed Guest');
    await phones[0].sync.push();
    for (const p of phones.slice(1)) {
      p.sync.open(phones[0].sync.token);
      await p.sync.pull();
    }
    for (let step = 0; step < 40; step++) {
      const p = phones[Math.floor(random() * 3)];
      const s = p.store.state;
      const pick = s.guests[Math.floor(random() * s.guests.length)];
      const roll = random();
      if (roll < 0.3 || !pick) add(p, `Guest ${trial}-${step}`);
      else if (roll < 0.5) p.store.change(() => Object.assign(pick, { party: 1 + Math.floor(random() * 5), updatedAt: Date.now() + step }), { reason: 'party' });
      else if (roll < 0.65) p.store.change((st) => { st.guests = st.guests.filter((g) => g !== pick); st.removed[pick.id] = Date.now() + step; }, { reason: 'remove' });
      else if (roll < 0.75) p.store.undo();
      else if (roll < 0.85) await p.sync.push();
      else await p.sync.pull();
    }
    await settle(...phones);
    const prints = phones.map((p) => fingerprint(p.store.state));
    assert.equal(new Set(prints).size, 1, `trial ${trial} diverged`);
  }
});

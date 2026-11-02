import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, clean, createStore, groupOrder, merge, totals } from '../js/store.js';
import { decodeList, encodeList } from '../js/share.js';
import { leafAt, slotsFor, SIZE } from '../js/wreath.js';
import { pdfFileName } from '../js/pdf.js';

const guest = (id, name, extra = {}) => ({ id, name, party: 1, table: '', contact: '', group: '', note: '', status: 'waiting', okDup: false, updatedAt: 100, ...extra });
const list = (...guests) => ({ ...blank(), guests });

const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

test('the big number counts people, and leaves out anyone who cannot come', () => {
  const t = totals(list(guest('a', 'Ada', { party: 2, status: 'coming' }), guest('b', 'Tunde', { party: 3 }), guest('c', 'Bisi', { party: 4, status: 'declined' })));
  assert.deepEqual(t, { guests: 5, coming: 2, waiting: 3, declined: 4, invitations: 2, declinedInvitations: 1 });
});

test('sections stay put as guests join them, and new sections arrive on top', () => {
  const g = (group) => guest('x', 'x', { group });
  assert.deepEqual(groupOrder([g('Church'), g('Work'), g('Church'), g(''), g('Family')]), ['Family', 'Work', 'Church']);
});

test('clean() defuses a tampered list', () => {
  const out = clean({
    names: 42,
    date: '<script>',
    capacity: -5,
    guests: [
      { id: 'a', name: 'Ada', party: 1e9, status: 'hacked', updatedAt: 'soon' },
      { id: 'a', name: 'Same id twice' },
      { name: '   ' },
      null,
      'nonsense',
      { name: 'x'.repeat(999), party: -3 },
    ],
    removed: { a: 'never', b: 5 },
  });
  assert.equal(out.names, '');
  assert.equal(out.date, '');
  assert.equal(out.capacity, null);
  assert.equal(out.guests.length, 2);
  assert.equal(out.guests[0].party, 99);
  assert.equal(out.guests[0].status, 'waiting');
  assert.equal(typeof out.guests[0].updatedAt, 'number');
  assert.equal(out.guests[1].name.length, 120);
  assert.equal(out.guests[1].party, 1);
  assert.deepEqual(out.removed, { b: 5 });
  assert.deepEqual(clean('nope'), blank());
});

test('merge keeps the newest edit and adds what is missing', () => {
  const mine = list(guest('a', 'Ada', { party: 1, updatedAt: 100 }), guest('b', 'Tunde', { party: 5, updatedAt: 300 }));
  const theirs = list(guest('a', 'Ada', { party: 2, updatedAt: 200 }), guest('b', 'Tunde', { party: 9, updatedAt: 200 }), guest('c', 'Bisi'));
  const { state, report } = merge(mine, theirs);
  assert.deepEqual(state.guests.map((g) => [g.id, g.party]), [['a', 2], ['b', 5], ['c', 1]]);
  assert.deepEqual(report, { added: 1, updated: 1, removed: 0 });
});

test('merge does not double a guest both people typed separately', () => {
  const { state, report } = merge(list(guest('a', 'Tunde Bakare')), list(guest('z', 'bakare tunde')));
  assert.equal(state.guests.length, 1);
  assert.equal(report.added, 0);
});

test('a deletion travels through a merge, unless the guest was edited since', () => {
  const mine = list(guest('a', 'Ada', { updatedAt: 100 }), guest('b', 'Tunde', { updatedAt: 500 }));
  const theirs = { ...list(), removed: { a: 200, b: 200 } };
  const { state, report } = merge(mine, theirs);
  assert.deepEqual(state.guests.map((g) => g.id), ['b']);
  assert.equal(report.removed, 1);
});

test('a guest I deleted does not come back from an older copy', () => {
  const mine = { ...list(), removed: { a: 500 } };
  const { state } = merge(mine, list(guest('a', 'Ada', { updatedAt: 100 })));
  assert.equal(state.guests.length, 0);
});

test('merging twice changes nothing', () => {
  const theirs = list(guest('c', 'Bisi'));
  const first = merge(list(guest('a', 'Ada')), theirs).state;
  const second = merge(first, theirs);
  assert.deepEqual(second.state.guests, first.guests);
  assert.deepEqual(second.report, { added: 0, updated: 0, removed: 0 });
});

test('share link survives the trip, including accents', async () => {
  const state = { ...list(guest('a', 'Adébáyọ̀ Ọlá', { party: 3, table: 'VIP', status: 'coming', okDup: true }), guest('b', 'Tunde', { status: 'declined' })), names: 'Ada & Tunde', date: '2027-03-14', capacity: 150, removed: { x: 9 } };
  const code = await encodeList(state);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(clean(await decodeList(code)), clean(state));
});

test('a big list still makes a sensible link', async () => {
  const guests = Array.from({ length: 400 }, (_, i) => guest(`id${i}`, `Guest Number ${i}`));
  const code = await encodeList(list(...guests));
  assert.ok(code.length < 16000, `link is ${code.length} characters`);
});

test('a damaged link is refused quietly', async () => {
  for (const code of ['z!!!!', 'zAAAA', 'j', 'jAAAA', '']) assert.equal(await decodeList(code), null, code);
});

test('undo and redo step through changes', () => {
  const store = createStore(null, memory());
  store.change((s) => s.guests.push(guest('a', 'Ada')));
  store.change((s) => s.guests.push(guest('b', 'Tunde')));
  assert.equal(store.state.guests.length, 2);
  store.undo();
  assert.equal(store.state.guests.length, 1);
  store.undo();
  assert.equal(store.state.guests.length, 0);
  assert.equal(store.undo(), false);
  store.redo();
  assert.equal(store.state.guests.length, 1);
  store.change((s) => s.guests.push(guest('c', 'Bisi')));
  assert.equal(store.redo(), false, 'a new change ends the redo trail');
  store.flush();
});

test('the list comes back after a reload', () => {
  const storage = memory();
  const first = createStore(null, storage);
  first.change((s) => {
    s.names = 'Ada & Tunde';
    s.guests.push(guest('a', 'Ada', { party: 2 }));
  });
  first.flush();
  const second = createStore(null, storage);
  assert.equal(second.state.names, 'Ada & Tunde');
  assert.equal(second.state.guests[0].party, 2);
});

test('a stale tab closing does not overwrite a newer list', () => {
  const storage = memory();
  const stale = createStore(null, storage);
  storage.setItem('guestlist.v1', JSON.stringify(list(guest('a', 'Added in another tab'))));
  stale.flush();
  assert.equal(JSON.parse(storage.getItem('guestlist.v1')).guests.length, 1);
});

test('corrupt saved data starts clean rather than crashing', () => {
  const storage = memory();
  storage.setItem('guestlist.v1', '{not json');
  assert.deepEqual(createStore(null, storage).state, blank());
});

test('a full disk is noticed, not fatal', () => {
  const store = createStore(null, { getItem: () => null, setItem: () => { throw new Error('quota'); } });
  store.change((s) => s.guests.push(guest('a', 'Ada')));
  store.flush();
  assert.equal(store.saveFailed, true);
  assert.equal(store.state.guests.length, 1);
});

test('wreath aims for a limit, or the next round number', () => {
  assert.equal(slotsFor(0, null), 24);
  assert.equal(slotsFor(25, null), 50);
  assert.equal(slotsFor(101, null), 150);
  assert.equal(slotsFor(10, 80), 80);
  assert.equal(slotsFor(90, 80), 90);
  assert.equal(slotsFor(9000, null), 9000);
});

test('every leaf lands inside the picture and leaves stay put as the list grows', () => {
  for (const slots of [24, 150, 500, 5000]) {
    for (let i = 0; i < slots; i += Math.ceil(slots / 200)) {
      const leaf = leafAt(i, slots);
      for (const [px, py] of [[leaf.x, leaf.y], [leaf.x + leaf.len * Math.cos((leaf.rot * Math.PI) / 180), leaf.y + leaf.len * Math.sin((leaf.rot * Math.PI) / 180)]]) {
        assert.ok(px > 0 && px < SIZE && py > 0 && py < SIZE, `leaf ${i}/${slots} at ${px},${py}`);
      }
    }
  }
  assert.deepEqual(leafAt(7, 150), leafAt(7, 150));
});

test('PDF file names are safe', () => {
  assert.equal(pdfFileName('Ọlá & Tunde'), 'Ola-and-Tunde-guest-list.pdf');
  assert.equal(pdfFileName(''), 'guest-list.pdf');
  assert.equal(pdfFileName('../../etc/passwd'), 'etc-passwd-guest-list.pdf');
});

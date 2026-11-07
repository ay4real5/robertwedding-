// The list itself: what it holds, how it's counted, saved, undone and merged.

import { strictKey } from './parse.js';

const KEY = 'guestlist.v1';
const MAX_GUESTS = 5000;
const HISTORY = 100;

const text = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const STATUSES = new Set(['waiting', 'coming', 'declined']);
const META = ['names', 'date', 'capacity'];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const blank = () => ({ names: '', date: '', capacity: null, metaAt: 0, guests: [], removed: {} });

function cleanGuest(g, now) {
  if (!g || typeof g !== 'object') return null;
  const name = text(g.name, 120);
  if (!name) return null;
  const party = Math.round(Number(g.party));
  return {
    id: text(g.id, 40) || uid(),
    name,
    party: party >= 1 ? Math.min(99, party) : 1,
    table: text(g.table, 20),
    contact: text(g.contact, 60),
    group: text(g.group, 40),
    note: text(g.note, 200),
    status: STATUSES.has(g.status) ? g.status : 'waiting',
    okDup: g.okDup === true,
    updatedAt: Number.isFinite(g.updatedAt) ? g.updatedAt : now,
  };
}

// Everything loaded from storage, a shared link, the server or a PDF passes through here,
// so tampered data can only ever produce a list of plain-text guests.
export function clean(raw, now = Date.now()) {
  const out = blank();
  if (!raw || typeof raw !== 'object') return out;
  out.names = text(raw.names, 80);
  out.date = /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : '';
  const cap = Math.round(Number(raw.capacity));
  out.capacity = cap >= 1 ? Math.min(cap, 100000) : null;
  out.metaAt = Number.isFinite(raw.metaAt) && raw.metaAt > 0 ? raw.metaAt : 0;
  const seen = new Set();
  for (const g of Array.isArray(raw.guests) ? raw.guests.slice(0, MAX_GUESTS) : []) {
    const guest = cleanGuest(g, now);
    if (guest && !seen.has(guest.id)) {
      seen.add(guest.id);
      out.guests.push(guest);
    }
  }
  if (raw.removed && typeof raw.removed === 'object') {
    for (const [id, at] of Object.entries(raw.removed).slice(0, MAX_GUESTS * 4)) {
      if (Number.isFinite(at)) out.removed[id.slice(0, 40)] = at;
    }
  }
  return out;
}

export function totals(state) {
  const t = { guests: 0, coming: 0, waiting: 0, declined: 0, invitations: 0, declinedInvitations: 0 };
  for (const g of state.guests) {
    if (g.status === 'declined') {
      t.declined += g.party;
      t.declinedInvitations += 1;
    } else {
      t.guests += g.party;
      t.invitations += 1;
      t[g.status] += g.party;
    }
  }
  return t;
}

// Section order: newest section first, and a section keeps its place as guests join it.
export function groupOrder(guests) {
  const firstSeen = new Map();
  guests.forEach((g, i) => {
    if (g.group && !firstSeen.has(g.group)) firstSeen.set(g.group, i);
  });
  return [...firstSeen.keys()].sort((a, b) => firstSeen.get(b) - firstSeen.get(a));
}

const guestBody = (g) => JSON.stringify([g.name, g.party, g.table, g.contact, g.group, g.note, g.status, g.okDup]);
const metaBody = (s) => JSON.stringify(META.map((k) => s[k]));

// Two edits stamped in the same millisecond still need the same winner on every phone.
const isNewer = (a, b) => a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && guestBody(a) > guestBody(b));

// The same content in any order: what "these two copies agree" means.
export function fingerprint(state) {
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const guests = [...state.guests].sort(byId).map((g) => [g.id, guestBody(g), g.updatedAt]);
  const removed = Object.keys(state.removed).sort().map((id) => [id, state.removed[id]]);
  return JSON.stringify([metaBody(state), state.metaAt, guests, removed]);
}

// Folds another copy of a list into ours. Newest edit of each guest wins and deletions
// travel too. With dedupe (a different list being joined to ours) the same person typed
// on both sides stays single; between copies of one list, ids alone decide.
export function merge(local, incoming, { dedupe = true } = {}) {
  const out = clean(local);
  const from = clean(incoming);
  const report = { added: 0, updated: 0, removed: 0 };
  const byId = new Map(out.guests.map((g) => [g.id, g]));
  const byKey = dedupe ? new Map(out.guests.map((g) => [strictKey(g.name), g])) : null;

  for (const [id, at] of Object.entries(from.removed)) {
    out.removed[id] = Math.max(out.removed[id] || 0, at);
    const mine = byId.get(id);
    if (mine && mine.updatedAt <= at) {
      out.guests = out.guests.filter((g) => g !== mine);
      byId.delete(id);
      byKey?.delete(strictKey(mine.name));
      report.removed += 1;
    }
  }

  for (const g of from.guests) {
    if ((out.removed[g.id] || 0) >= g.updatedAt) continue;
    const mine = byId.get(g.id);
    if (mine) {
      if (isNewer(g, mine)) {
        Object.assign(mine, g);
        report.updated += 1;
      }
    } else if (!byKey?.has(strictKey(g.name))) {
      out.guests.push(g);
      byId.set(g.id, g);
      byKey?.set(strictKey(g.name), g);
      report.added += 1;
    }
  }

  const theirsWins = from.metaAt > out.metaAt || (from.metaAt === out.metaAt && from.metaAt > 0 && metaBody(from) > metaBody(out));
  if (theirsWins) {
    for (const k of META) out[k] = from[k];
    out.metaAt = from.metaAt;
  } else if (!out.metaAt && !from.metaAt) {
    // Older copies carry no timestamp, so they can only fill gaps.
    out.names = out.names || from.names;
    out.date = out.date || from.date;
    out.capacity = out.capacity ?? from.capacity;
  }
  return { state: out, report };
}

// Undo only what one step changed, so edits that arrived from another phone since are kept.
function applyStep(current, from, to, now) {
  const before = new Map(from.guests.map((g) => [g.id, g]));
  const after = new Map(to.guests.map((g) => [g.id, g]));
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const was = before.get(id);
    const want = after.get(id);
    if (was && want && guestBody(was) === guestBody(want)) continue;
    const at = current.guests.findIndex((g) => g.id === id);
    if (want) {
      const guest = { ...want, updatedAt: now };
      delete current.removed[id];
      if (at >= 0) current.guests[at] = guest;
      else current.guests.splice(Math.min(to.guests.indexOf(want), current.guests.length), 0, guest);
    } else {
      if (at >= 0) current.guests.splice(at, 1);
      current.removed[id] = now;
    }
  }
  if (metaBody(from) !== metaBody(to)) {
    for (const k of META) current[k] = to[k];
    current.metaAt = now;
  }
}

export function createStore(onChange, storage = globalThis.localStorage) {
  let state = blank();
  let past = []; // { before, after } snapshots; after stays null while a field is still being typed in
  let future = [];
  let saveTimer = null;
  let saveFailed = false;

  try {
    const saved = storage?.getItem(KEY);
    if (saved) state = clean(JSON.parse(saved));
  } catch {
    state = blank();
  }

  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      storage?.setItem(KEY, JSON.stringify(state));
      saveFailed = false;
    } catch {
      if (!saveFailed) onChange?.('save-failed');
      saveFailed = true;
    }
  };
  const queueSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 120);
  };

  const snapshot = () => JSON.stringify(state);
  const closeOpenStep = () => {
    const top = past[past.length - 1];
    if (top && top.after === null) top.after = snapshot();
  };
  const record = (before, after) => {
    past.push({ before, after });
    if (past.length > HISTORY) past.shift();
    future = [];
  };

  return {
    get state() {
      return state;
    },
    get saveFailed() {
      return saveFailed;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    snapshot,

    // Start an undo step for typing: it closes when the next step begins.
    remember(before = snapshot()) {
      closeOpenStep();
      record(before, null);
    },

    // Only when something is waiting: a stale tab closing must not overwrite a newer list.
    flush() {
      if (saveTimer !== null) persist();
    },

    // Run a change as one undoable step.
    change(fn, { undoable = true, reason = 'edit' } = {}) {
      if (undoable) {
        closeOpenStep();
        const before = snapshot();
        fn(state);
        record(before, snapshot());
      } else fn(state);
      queueSave();
      onChange?.(reason);
    },

    // The change already happened (a field being typed into); just save and redraw counts.
    touched(reason = 'edit') {
      queueSave();
      onChange?.(reason);
    },

    // Swap in a whole new list as one undoable step.
    replace(next, { reason = 'replace' } = {}) {
      closeOpenStep();
      const before = snapshot();
      state = clean(next);
      record(before, snapshot());
      queueSave();
      onChange?.(reason);
    },

    // Take the merged copy from another phone. Not a step of ours, so not undoable.
    adopt(next) {
      state = clean(next);
      queueSave();
      onChange?.('remote');
    },

    // Open a different list altogether; its history starts fresh.
    switchTo(next) {
      state = clean(next);
      past = [];
      future = [];
      persist();
      onChange?.('switch');
    },

    undo() {
      closeOpenStep();
      const step = past.pop();
      if (!step) return false;
      applyStep(state, JSON.parse(step.after), JSON.parse(step.before), Date.now());
      future.push(step);
      queueSave();
      onChange?.('history');
      return true;
    },

    redo() {
      const step = future.pop();
      if (!step) return false;
      applyStep(state, JSON.parse(step.before), JSON.parse(step.after), Date.now());
      past.push(step);
      queueSave();
      onChange?.('history');
      return true;
    },

    // Another tab saved; adopt its copy.
    reload(raw) {
      try {
        state = clean(JSON.parse(raw));
        onChange?.('remote');
      } catch {
        /* a half-written value is ignored; the next save settles it */
      }
    },

    newGuest(fields) {
      return cleanGuest({ ...fields, id: uid(), updatedAt: Date.now() }, Date.now());
    },
  };
}

export const STORAGE_KEY = KEY;

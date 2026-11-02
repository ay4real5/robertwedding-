// The list itself: what it holds, how it's counted, saved, undone and merged.

import { strictKey } from './parse.js';

const KEY = 'guestlist.v1';
const MAX_GUESTS = 5000;
const HISTORY = 100;

const text = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const STATUSES = new Set(['waiting', 'coming', 'declined']);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const blank = () => ({ names: '', date: '', capacity: null, guests: [], removed: {} });

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

// Everything loaded from storage or a shared link passes through here, so a
// tampered link can only ever produce a list of plain-text guests.
export function clean(raw, now = Date.now()) {
  const out = blank();
  if (!raw || typeof raw !== 'object') return out;
  out.names = text(raw.names, 80);
  out.date = /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : '';
  const cap = Math.round(Number(raw.capacity));
  out.capacity = cap >= 1 ? Math.min(cap, 100000) : null;
  const seen = new Set();
  for (const g of Array.isArray(raw.guests) ? raw.guests.slice(0, MAX_GUESTS) : []) {
    const guest = cleanGuest(g, now);
    if (guest && !seen.has(guest.id)) {
      seen.add(guest.id);
      out.guests.push(guest);
    }
  }
  if (raw.removed && typeof raw.removed === 'object') {
    for (const [id, at] of Object.entries(raw.removed).slice(0, MAX_GUESTS)) {
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

// Folds a list from someone else's phone into ours. Newest edit of each guest
// wins, deletions travel too, and the same person added on both sides stays single.
export function merge(local, incoming) {
  const out = clean(local);
  const from = clean(incoming);
  const report = { added: 0, updated: 0, removed: 0 };
  const byId = new Map(out.guests.map((g) => [g.id, g]));
  const byKey = new Map(out.guests.map((g) => [strictKey(g.name), g]));

  for (const [id, at] of Object.entries(from.removed)) {
    out.removed[id] = Math.max(out.removed[id] || 0, at);
    const mine = byId.get(id);
    if (mine && mine.updatedAt <= at) {
      out.guests = out.guests.filter((g) => g !== mine);
      byId.delete(id);
      byKey.delete(strictKey(mine.name));
      report.removed += 1;
    }
  }

  for (const g of from.guests) {
    if ((out.removed[g.id] || 0) >= g.updatedAt) continue;
    const mine = byId.get(g.id);
    if (mine) {
      if (g.updatedAt > mine.updatedAt) {
        Object.assign(mine, g);
        report.updated += 1;
      }
    } else if (!byKey.has(strictKey(g.name))) {
      out.guests.push(g);
      byId.set(g.id, g);
      byKey.set(strictKey(g.name), g);
      report.added += 1;
    }
  }

  out.names = out.names || from.names;
  out.date = out.date || from.date;
  out.capacity = out.capacity ?? from.capacity;
  return { state: out, report };
}

export function createStore(onChange, storage = globalThis.localStorage) {
  let state = blank();
  let past = [];
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
  const remember = (snap = snapshot()) => {
    past.push(snap);
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
    remember,

    // Only when something is waiting: a stale tab closing must not overwrite a newer list.
    flush() {
      if (saveTimer !== null) persist();
    },

    // Run a change as one undoable step.
    change(fn, { undoable = true, reason = 'edit' } = {}) {
      if (undoable) remember();
      fn(state);
      queueSave();
      onChange?.(reason);
    },

    // The change already happened (a field being typed into); just save and redraw counts.
    touched(reason = 'edit') {
      queueSave();
      onChange?.(reason);
    },

    replace(next, { reason = 'replace' } = {}) {
      remember();
      state = clean(next);
      queueSave();
      onChange?.(reason);
    },

    undo() {
      if (!past.length) return false;
      future.push(snapshot());
      state = JSON.parse(past.pop());
      queueSave();
      onChange?.('history');
      return true;
    },

    redo() {
      if (!future.length) return false;
      past.push(snapshot());
      state = JSON.parse(future.pop());
      queueSave();
      onChange?.('history');
      return true;
    },

    // Another tab saved; adopt its copy.
    reload(raw) {
      try {
        state = clean(JSON.parse(raw));
        onChange?.('history');
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

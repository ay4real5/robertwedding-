import { findSimilar, isSimilarKey, looseKey, matchesQuery, parseInput, strictKey } from './parse.js';
import { STORAGE_KEY, blank, createStore, groupOrder, merge, totals } from './store.js';
import { decodeList } from './share.js';
import { createSync } from './sync.js';
import { createOdometer, createWreath } from './wreath.js';
import { downloadPdf, longDate } from './pdf.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const icon = (markup, viewBox = '0 0 24 24') => {
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" aria-hidden="true">${markup}</svg>`;
  return document.importNode(new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement, true);
};
// Parsed once and stamped out, since every row wants two of them.
const stamp = (markup, viewBox) => {
  let master;
  return () => (master ??= icon(markup, viewBox)).cloneNode(true);
};
const ICONS = {
  plus: stamp('<path d="M12 5v14M5 12h14"/>'),
  mic: stamp('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  stop: stamp('<rect x="7" y="7" width="10" height="10" rx="2"/>'),
  chevron: stamp('<path d="M6 9l6 6 6-6"/>'),
  leaf: stamp('<path d="M.08 .5C.3 .1 .75 .12 .96 .5C.75 .78 .3 .8 .08 .5Z"/>', '0 0 1 1'),
};

const STATUS_NEXT = { waiting: 'coming', coming: 'declined', declined: 'waiting' };
const STATUS_WORD = { waiting: 'waiting', coming: 'coming', declined: "can't come" };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const ui = {
  filter: '',
  query: '',
  open: null, // row showing its details
  fresh: new Set(), // rows to flash as just added
  confirmText: null, // typed text awaiting a second Enter because it looks like a duplicate
  lastCount: null,
  twins: new Map(),
  twinsDirty: true,
  editSnapshot: null,
};

const rows = new Map(); // guest id -> <li>
const heads = new Map(); // group name -> <li>

const wreath = createWreath($('wreath'));
const bigCount = createOdometer($('bigCount'));
const miniCount = createOdometer($('miniCount'));

let sync = null; // set up once the page is drawn

const store = createStore((reason) => {
  if (reason === 'save-failed') {
    toast('Your browser refused to save. Download a PDF so nothing is lost.');
    return;
  }
  if (reason !== 'edit') ui.twinsDirty = true;
  if (reason === 'switch') ui.lastCount = null; // a different list, not a change to count up from
  drawCounts();
  if (reason !== 'edit') drawList();
  if (['history', 'replace', 'meta', 'remote', 'switch'].includes(reason)) drawHeader();
  // Changes that came from the online copy don't need sending back to it.
  if (reason !== 'remote' && reason !== 'switch') sync?.changed(reason);
});

/* ---------- toast ---------- */

let toastTimer;
let toastAction = null;
function toast(text, { undo = false, action = null, ms = 6000 } = {}) {
  clearTimeout(toastTimer);
  const box = $('toast');
  $('toastText').textContent = text;
  toastAction = action || (undo ? { label: 'Undo', run: () => store.undo() } : null);
  $('toastUndo').hidden = !toastAction;
  if (toastAction) $('toastUndo').textContent = toastAction.label;
  box.hidden = false;
  toastTimer = setTimeout(() => (box.hidden = true), ms);
}

/* ---------- saving ---------- */

const SAVE_TEXT = {
  saving: 'Saving…',
  saved: 'Saved',
  offline: 'Offline · saved on this device',
  local: 'Saved on this device',
  error: 'Not saved online yet · retrying',
};

function drawSave(status) {
  const box = $('save');
  box.hidden = !SAVE_TEXT[status];
  box.dataset.state = status;
  $('saveText').textContent = SAVE_TEXT[status] || '';
  $('footNote').textContent = ['saved', 'saving'].includes(status)
    ? 'Saved online. Anyone with this list’s link can see and edit it.'
    : 'Saved on this device. It goes online as soon as it can.';
}

// The address bar always holds this list's link, so a bookmark or home-screen icon reopens it.
function showToken(token) {
  if (token && location.hash !== `#g=${token}`) history.replaceState(null, '', `${location.pathname}${location.search}#g=${token}`);
}

/* ---------- the numbers ---------- */

function drawCounts() {
  const { state } = store;
  const t = totals(state);
  bigCount.set(t.guests);
  miniCount.set(t.guests);
  const word = t.guests === 1 ? 'guest' : 'guests';
  $('countLabel').textContent = word;
  $('miniLabel').textContent = word;
  wreath.update({ count: t.guests, coming: t.coming, capacity: state.capacity });
  document.title = t.guests ? `${t.guests} ${word} · Guest List` : 'Guest List';

  if (ui.lastCount !== null && ui.lastCount !== t.guests) {
    const diff = t.guests - ui.lastCount;
    if (!reduceMotion()) {
      const delta = el('span', `delta${diff < 0 ? ' down' : ''}`, `${diff > 0 ? '+' : '−'}${Math.abs(diff)}`);
      delta.addEventListener('animationend', () => delta.remove());
      $('countNumber').appendChild(delta);
    }
    // A tap gets a buzz; a partner's change arriving from another phone doesn't.
    if (navigator.userActivation?.isActive) navigator.vibrate?.(diff > 0 ? 8 : [6, 40, 6]);
    $('live').textContent = `${plural(t.guests, 'guest')} on the list`;
  }
  ui.lastCount = t.guests;

  const limit = $('limitBtn');
  if (!state.capacity) limit.textContent = 'set a seat limit';
  else if (t.guests > state.capacity) limit.textContent = `${t.guests - state.capacity} over ${state.capacity} seats`;
  else if (t.guests === state.capacity) limit.textContent = `all ${state.capacity} seats taken`;
  else limit.textContent = `of ${state.capacity} seats`;

  const tally = $('tally');
  tally.replaceChildren();
  if (state.guests.length) {
    tally.appendChild(el('span', '', plural(t.invitations, 'invitation')));
    const addFilter = (key, label) => {
      const b = el('button', '', label);
      b.type = 'button';
      b.dataset.filter = key;
      b.setAttribute('aria-pressed', String(ui.filter === key));
      tally.appendChild(b);
    };
    addFilter('coming', `${t.coming} coming`);
    addFilter('waiting', `${t.waiting} waiting`);
    if (t.declined) addFilter('declined', `${t.declined} can't come`);
  }

  $('empty').hidden = state.guests.length > 0;
  $('foot').hidden = state.guests.length === 0;
}

function drawHeader() {
  const { state } = store;
  if (document.activeElement !== $('names')) $('names').value = state.names;
  $('date').value = state.date;
  if (!state.date) {
    $('dateText').textContent = 'Add your date';
    return;
  }
  const [y, m, d] = state.date.split('-').map(Number);
  const days = Math.round((new Date(y, m - 1, d) - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000);
  const left = days > 1 ? ` · ${days} days to go` : days === 1 ? ' · tomorrow' : days === 0 ? ' · today' : '';
  $('dateText').textContent = longDate(state.date) + left;
}

/* ---------- possible duplicates ---------- */

function refreshTwins() {
  if (!ui.twinsDirty) return;
  ui.twinsDirty = false;
  ui.twins = new Map();
  // Only compare names sharing a word: a typo rarely hits both, and this keeps big lists fast.
  const byWord = new Map();
  for (const g of store.state.guests) {
    const key = looseKey(g.name);
    if (!key) continue;
    const words = key.split(' ');
    if (!g.okDup) {
      search: for (const word of words) {
        for (const earlier of byWord.get(word) || []) {
          if (isSimilarKey(key, earlier.key)) {
            ui.twins.set(g.id, earlier.guest);
            break search;
          }
        }
      }
    }
    const entry = { key, guest: g };
    for (const word of words) {
      if (!byWord.has(word)) byWord.set(word, []);
      byWord.get(word).push(entry);
    }
  }
}

const metaText = (g) => [g.table && `Table ${g.table}`, g.note, g.contact].filter(Boolean).join(' · ');

/* ---------- the list ---------- */

function buildRow(g) {
  const li = el('li', 'row');
  li.dataset.id = g.id;

  const status = el('button', 'status');
  status.type = 'button';
  status.dataset.act = 'status';
  status.appendChild(ICONS.leaf());

  const main = el('div', 'row-main');
  const name = el('span', 'row-name');
  name.dataset.field = 'name';
  name.setAttribute('role', 'textbox');
  name.setAttribute('aria-label', 'Guest name');
  name.contentEditable = 'plaintext-only';
  if (name.contentEditable !== 'plaintext-only') name.contentEditable = 'true';
  name.spellcheck = false;
  main.append(name, el('div', 'row-meta'));

  const stepper = el('div', 'stepper');
  const minus = el('button');
  minus.type = 'button';
  minus.dataset.act = 'minus';
  const count = el('output');
  const plus = el('button', '', '+');
  plus.type = 'button';
  plus.dataset.act = 'plus';
  plus.setAttribute('aria-label', 'One more guest');
  stepper.append(minus, count, plus);

  const more = el('button', 'more');
  more.type = 'button';
  more.dataset.act = 'more';
  more.setAttribute('aria-label', 'Table, group, phone and notes');
  more.appendChild(ICONS.chevron());

  li.append(status, main, stepper, more);
  return li;
}

function buildDetails(g) {
  const box = el('div', 'details');
  for (const [field, label, opts] of [
    ['table', 'Table', { inputmode: 'text' }],
    ['group', 'Group', { list: 'groupOptions' }],
    ['contact', 'Phone or email', { inputmode: 'tel' }],
    ['note', 'Notes', {}],
  ]) {
    const wrap = el('label', 'field', label);
    const input = el('input');
    input.type = 'text';
    input.dataset.field = field;
    input.value = g[field];
    input.maxLength = { table: 20, group: 40, contact: 60, note: 200 }[field];
    for (const [k, v] of Object.entries(opts)) input.setAttribute(k, v);
    wrap.appendChild(input);
    box.appendChild(wrap);
  }
  return box;
}

const rowState = new WeakMap(); // skips redrawing rows that haven't changed

function syncRow(li, g) {
  const other = ui.twins.get(g.id);
  const isOpen = ui.open === g.id;
  const signature = [g.name, g.status, g.party, g.table, g.group, g.note, g.contact, other?.name, isOpen].join('\u0001');
  if (rowState.get(li) === signature) return;
  rowState.set(li, signature);

  li.dataset.status = g.status;
  li.classList.toggle('is-declined', g.status === 'declined');

  const name = li.querySelector('.row-name');
  if (document.activeElement !== name && name.textContent !== g.name) name.textContent = g.name;

  const status = li.querySelector('.status');
  status.setAttribute('aria-label', `${g.name}: ${STATUS_WORD[g.status]}. Tap to change to ${STATUS_WORD[STATUS_NEXT[g.status]]}.`);
  status.title = STATUS_WORD[g.status][0].toUpperCase() + STATUS_WORD[g.status].slice(1);

  const minus = li.querySelector('[data-act="minus"]');
  const single = g.party === 1;
  minus.textContent = single ? '×' : '−';
  minus.classList.toggle('is-remove', single);
  minus.setAttribute('aria-label', single ? `Remove ${g.name}` : 'One less guest');
  li.querySelector('output').textContent = g.party;
  li.querySelector('.row-meta').textContent = metaText(g);

  let twin = li.querySelector('.twin');
  if (other) {
    if (!twin) {
      twin = el('div', 'twin');
      li.querySelector('.row-main').appendChild(twin);
    }
    const text = el('span', '', `Same person as ${other.name}?`);
    const remove = el('button', '', 'Remove');
    remove.type = 'button';
    remove.dataset.act = 'twin-remove';
    const keep = el('button', '', 'Keep both');
    keep.type = 'button';
    keep.dataset.act = 'twin-keep';
    twin.replaceChildren(text, remove, keep);
  } else twin?.remove();

  const more = li.querySelector('.more');
  more.setAttribute('aria-expanded', String(isOpen));
  let details = li.querySelector('.details');
  if (isOpen && !details) li.appendChild(buildDetails(g));
  if (!isOpen && details) details.remove();
  details = li.querySelector('.details');
  if (details) {
    for (const input of details.querySelectorAll('input')) {
      if (document.activeElement !== input) input.value = g[input.dataset.field];
    }
  }
}

function visibleGuests() {
  const { guests } = store.state;
  let list = [...guests].reverse();
  if (ui.filter) list = list.filter((g) => g.status === ui.filter);
  if (ui.query) {
    const found = list.filter((g) => matchesQuery(g, ui.query));
    if (found.length) list = found;
  }
  return list;
}

function drawList() {
  refreshTwins();
  const list = $('list');
  const visible = visibleGuests();

  const groups = groupOrder(store.state.guests);
  const byGroup = new Map(groups.map((name) => [name, []]));
  const loose = [];
  for (const g of visible) (g.group ? byGroup.get(g.group) : loose).push(g);

  const order = [];
  for (const name of groups) if (byGroup.get(name).length) order.push({ head: name, guests: byGroup.get(name) });
  if (loose.length) order.push({ head: groups.length ? 'Everyone else' : null, guests: loose });

  const keep = new Set();
  let cursor = list.firstChild;
  const place = (node) => {
    if (node === cursor) cursor = cursor.nextSibling;
    else list.insertBefore(node, cursor);
  };

  for (const section of order) {
    if (section.head) {
      let head = heads.get(section.head);
      if (!head) {
        head = el('li', 'group-head');
        head.append(el('span', '', section.head), el('small'));
        heads.set(section.head, head);
      }
      const people = section.guests.filter((g) => g.status !== 'declined').reduce((n, g) => n + g.party, 0);
      head.lastChild.textContent = plural(people, 'guest');
      keep.add(head);
      place(head);
    }
    for (const g of section.guests) {
      let li = rows.get(g.id);
      if (!li) {
        li = buildRow(g);
        rows.set(g.id, li);
      }
      if (ui.fresh.has(g.id)) {
        li.classList.add('is-new');
        li.addEventListener('animationend', () => li.classList.remove('is-new'), { once: true });
      }
      syncRow(li, g);
      keep.add(li);
      place(li);
    }
  }
  ui.fresh.clear();

  for (const node of [...list.children]) {
    if (!keep.has(node)) {
      node.remove();
      if (node.dataset.id && !store.state.guests.some((g) => g.id === node.dataset.id)) rows.delete(node.dataset.id);
    }
  }

  let options = $('groupOptions');
  if (!options) {
    options = el('datalist');
    options.id = 'groupOptions';
    document.body.appendChild(options);
  }
  options.replaceChildren(...groups.map((name) => {
    const o = el('option');
    o.value = name;
    return o;
  }));
}

/* ---------- adding ---------- */

const magic = $('magicInput');
const action = $('magicAction');
const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
let recognizer = null;
let listening = false;

function sizeMagic() {
  magic.style.height = 'auto';
  magic.style.height = `${magic.scrollHeight}px`;
}

function drawAction() {
  const empty = !magic.value.trim();
  action.replaceChildren();
  action.classList.toggle('is-listening', listening);
  if (listening) {
    action.appendChild(ICONS.stop());
    action.setAttribute('aria-label', 'Stop listening');
    action.disabled = false;
  } else if (empty && Recognition) {
    action.appendChild(ICONS.mic());
    action.setAttribute('aria-label', 'Say the names');
    action.disabled = false;
  } else {
    action.appendChild(ICONS.plus());
    action.setAttribute('aria-label', 'Add guest');
    action.disabled = empty;
  }
}

// Matches the big number: people who can't come don't count.
const peopleIn = (guests) => guests.reduce((n, g) => n + (g.status === 'declined' ? 0 : g.party), 0);

function drawPreview() {
  const box = $('preview');
  box.replaceChildren();
  const text = magic.value;
  if (!text.trim()) return;
  const found = parseInput(text);
  if (!found.length) return;
  const card = el('div');

  if (found.length > 1) {
    card.append(el('b', '', plural(found.length, 'invitation')), ` · ${plural(peopleIn(found), 'guest')}`);
    box.appendChild(card);
    return;
  }

  const g = found[0];
  const twin = findSimilar(g.name, store.state.guests);
  if (twin) {
    card.className = 'warn';
    card.textContent = `${twin.name} is already on your list.${ui.confirmText === text ? ' Add again to keep both.' : ''}`;
    box.appendChild(card);
    return;
  }
  card.appendChild(el('b', '', g.name));
  const facts = [plural(g.party, 'guest')];
  if (g.table) facts.push(`Table ${g.table}`);
  if (g.group) facts.push(g.group);
  if (g.note) facts.push(g.note);
  if (g.contact) facts.push(g.contact);
  if (g.status !== 'waiting') facts.push(STATUS_WORD[g.status]);
  card.append(` · ${facts.join(' · ')}`);
  box.appendChild(card);
}

function onMagicChange() {
  ui.confirmText = null;
  const text = magic.value;
  ui.query = text.includes('\n') ? '' : parseInput(text)[0]?.name || '';
  sizeMagic();
  drawAction();
  drawPreview();
  drawList();
}

function clearMagic() {
  magic.value = '';
  ui.query = '';
  ui.confirmText = null;
  sizeMagic();
  drawAction();
  $('preview').replaceChildren();
}

function nudge() {
  const box = $('magic');
  box.classList.remove('nudge');
  void box.offsetWidth;
  box.classList.add('nudge');
}

// withinBatch: also skip repeats inside what's being added (a PDF's repeats were kept on purpose).
// meta: names, date and seats from a PDF, used only where this list has none yet.
function addFound(found, { okDup = false, withinBatch = true, meta = null, from = '', unreadable = 0 } = {}) {
  const taken = new Set(store.state.guests.map((g) => strictKey(g.name)));
  const fresh = [];
  let skipped = 0;
  for (const f of found) {
    const key = strictKey(f.name);
    if (taken.has(key)) {
      skipped += 1;
      continue;
    }
    if (withinBatch) taken.add(key);
    const guest = store.newGuest({ ...f, okDup: okDup || f.okDup === true });
    fresh.push(guest);
    ui.fresh.add(guest.id);
  }

  const s = store.state;
  const fillMeta = Boolean(meta && ((meta.names && !s.names) || (meta.date && !s.date) || (meta.capacity && !s.capacity)));
  if (!fresh.length && !fillMeta) {
    toast(skipped === 1 ? 'Already on your list.' : `All ${skipped} are already on your list.`);
    return 0;
  }

  // The list shows newest first, so a pasted list goes in backwards to read in its own order.
  store.change((state) => {
    state.guests.push(...[...fresh].reverse());
    if (fillMeta) {
      state.names = state.names || meta.names || '';
      state.date = state.date || meta.date || '';
      state.capacity = state.capacity ?? meta.capacity ?? null;
      state.metaAt = Date.now();
    }
  }, { reason: fillMeta ? 'meta' : 'add' });
  navigator.storage?.persist?.();

  const top = $('list').getBoundingClientRect().top;
  if (top < 0) window.scrollBy({ top: top - 160, behavior: reduceMotion() ? 'auto' : 'smooth' });

  if (from || fresh.length > 1 || skipped) {
    const twins = fresh.filter((g) => ui.twins.has(g.id)).length;
    const extras = [];
    if (skipped) extras.push(`${skipped} already on your list`);
    if (twins) extras.push(`${twins} to double-check`);
    if (unreadable) extras.push(`${unreadable} name${unreadable === 1 ? '' : 's'} to retype`);
    const added = `Added ${plural(peopleIn(fresh), 'guest')}${from ? ` from ${from}` : ''}`;
    toast(`${added}${extras.length ? ` · ${extras.join(' · ')}` : ''}`, { undo: true, ms: 9000 });
  }
  return fresh.length;
}

function submit(text) {
  const found = parseInput(text);
  if (!found.length) {
    if (text.trim()) nudge();
    return;
  }
  if (found.length === 1 && !text.trim().includes('\n')) {
    const twin = findSimilar(found[0].name, store.state.guests);
    if (twin && ui.confirmText !== text) {
      ui.confirmText = text;
      drawPreview();
      nudge();
      return;
    }
    const exact = store.state.guests.some((g) => strictKey(g.name) === strictKey(found[0].name));
    if (exact) {
      // They pressed Enter twice on purpose: two people really do share a name.
      const guest = store.newGuest({ ...found[0], okDup: true });
      ui.fresh.add(guest.id);
      store.change((s) => s.guests.push(guest), { reason: 'add' });
    } else addFound(found, { okDup: !!twin });
    clearMagic();
    drawList();
    return;
  }
  addFound(found);
  clearMagic();
  drawList();
}

magic.addEventListener('input', onMagicChange);
magic.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submit(magic.value);
  } else if (e.key === 'Escape') {
    clearMagic();
    drawList();
  }
});
magic.addEventListener('paste', (e) => {
  const text = e.clipboardData?.getData('text') ?? '';
  // A pasted list goes straight in; the wreath's reaction is the confirmation, and Undo is right there.
  if (text.trim().includes('\n')) {
    e.preventDefault();
    submit(text);
  }
});

action.addEventListener('click', () => {
  if (listening) stopListening();
  else if (!magic.value.trim() && Recognition) startListening();
  else {
    submit(magic.value);
    magic.focus();
  }
});

function startListening() {
  recognizer = new Recognition();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = navigator.language || 'en-GB';
  recognizer.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const said = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        const found = parseInput(said);
        if (found.length) {
          addFound(found);
          magic.value = '';
        }
      } else interim += said;
    }
    magic.value = interim;
    ui.query = '';
    sizeMagic();
    drawPreview();
    drawList();
  };
  recognizer.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      listening = false;
      toast('Microphone access is blocked for this page.');
      drawAction();
    }
  };
  recognizer.onend = () => {
    if (listening) {
      try {
        recognizer.start(); // browsers stop after a silence; keep going until told otherwise
        return;
      } catch {
        listening = false;
      }
    }
    magic.value = '';
    drawAction();
  };
  try {
    recognizer.start();
    listening = true;
    drawAction();
  } catch {
    toast('Your browser would not start the microphone.');
  }
}

function stopListening() {
  listening = false;
  recognizer?.stop();
  drawAction();
}

for (const b of document.querySelectorAll('.try')) {
  b.addEventListener('click', () => {
    magic.value = b.textContent;
    onMagicChange();
    magic.focus();
  });
}

/* ---------- editing rows ---------- */

const guestOf = (node) => {
  const id = node.closest('.row')?.dataset.id;
  return id ? store.state.guests.find((g) => g.id === id) : null;
};

function removeGuest(g) {
  store.change((s) => {
    s.guests = s.guests.filter((x) => x.id !== g.id);
    s.removed[g.id] = Date.now();
  }, { reason: 'remove' });
  toast(`Removed ${g.name}`, { undo: true });
}

$('list').addEventListener('click', (e) => {
  const button = e.target.closest('[data-act]');
  if (!button) return;
  const g = guestOf(button);
  if (!g) return;
  const act = button.dataset.act;

  if (act === 'status') {
    const next = STATUS_NEXT[g.status];
    store.change(() => {
      g.status = next;
      g.updatedAt = Date.now();
    }, { reason: 'status' });
  } else if (act === 'plus') {
    store.change(() => {
      g.party = Math.min(99, g.party + 1);
      g.updatedAt = Date.now();
    }, { reason: 'party' });
  } else if (act === 'minus') {
    if (g.party === 1) removeGuest(g);
    else {
      store.change(() => {
        g.party -= 1;
        g.updatedAt = Date.now();
      }, { reason: 'party' });
    }
  } else if (act === 'more') {
    ui.open = ui.open === g.id ? null : g.id;
    drawList();
    // On a phone this would throw the keyboard up just for looking.
    if (ui.open && matchMedia('(pointer: fine)').matches) rows.get(g.id)?.querySelector('.details input')?.focus();
  } else if (act === 'twin-remove') {
    removeGuest(g);
  } else if (act === 'twin-keep') {
    store.change(() => {
      g.okDup = true;
      g.updatedAt = Date.now();
    }, { reason: 'twin' });
  }
});

// Typing into a row is one undo step per field, however many letters it takes.
$('list').addEventListener('focusin', (e) => {
  if (e.target.dataset.field) ui.editSnapshot = store.snapshot();
});

$('list').addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  const g = field && guestOf(e.target);
  if (!g) return;
  if (ui.editSnapshot) {
    store.remember(ui.editSnapshot);
    ui.editSnapshot = null;
  }
  const value = field === 'name' ? e.target.textContent : e.target.value;
  if (field === 'name') {
    if (!value.trim()) return; // settled on blur
    g.name = value.trim().slice(0, 120);
    ui.twinsDirty = true;
  } else g[field] = value.trim();
  g.updatedAt = Date.now();
  store.touched('edit');
  if (field !== 'name') e.target.closest('.row').querySelector('.row-meta').textContent = metaText(g);
});

$('list').addEventListener('keydown', (e) => {
  if (e.target.dataset.field === 'name' && (e.key === 'Enter' || e.key === 'Escape')) {
    e.preventDefault();
    e.target.blur();
  }
  if (e.target.matches('.details input') && e.key === 'Enter') e.target.blur();
});

$('list').addEventListener('paste', (e) => {
  // Only the name is contenteditable, and it only ever takes one plain line.
  if (e.target.dataset?.field !== 'name') return;
  e.preventDefault();
  const text = (e.clipboardData?.getData('text') ?? '').replace(/\s+/g, ' ').trim();
  document.execCommand('insertText', false, text);
});

$('list').addEventListener('focusout', (e) => {
  const field = e.target.dataset.field;
  const g = field && guestOf(e.target);
  ui.editSnapshot = null;
  if (!g) return;
  if (field === 'name') {
    const typed = e.target.textContent.replace(/\s+/g, ' ').trim();
    if (!typed) {
      e.target.textContent = g.name; // never leave a nameless guest behind
      return;
    }
    // "+2" typed into a name means what it means in the box above.
    if (/(?:^|\s)(?:\+|plus\s)\s*\w/i.test(typed) || /\s[x×]\s*\d/i.test(typed)) {
      const found = parseInput(typed)[0];
      if (found) {
        store.change(() => {
          g.name = found.name;
          g.party = found.party;
          if (found.table) g.table = found.table;
          g.updatedAt = Date.now();
        }, { reason: 'name' });
        e.target.textContent = g.name;
        return;
      }
    }
    e.target.textContent = g.name;
    store.touched('name');
  } else if (field === 'group') store.touched('group');
});

/* ---------- header ---------- */

$('names').addEventListener('focus', () => (ui.editSnapshot = store.snapshot()));
$('names').addEventListener('input', (e) => {
  if (ui.editSnapshot) {
    store.remember(ui.editSnapshot);
    ui.editSnapshot = null;
  }
  store.state.names = e.target.value.trim();
  store.state.metaAt = Date.now();
  store.touched('edit');
});
$('names').addEventListener('keydown', (e) => e.key === 'Enter' && e.target.blur());

// Some pickers only ever fire one of these two, and the wheels on a phone fire them while spinning.
const onDate = (e) => {
  const value = e.target.value;
  if (value === store.state.date || (value && !/^\d{4}-\d{2}-\d{2}$/.test(value))) return;
  store.change((s) => {
    s.date = value;
    s.metaAt = Date.now();
  }, { reason: 'meta' });
};
$('date').addEventListener('input', onDate);
$('date').addEventListener('change', onDate);
$('date').addEventListener('click', (e) => {
  try {
    e.target.showPicker?.();
  } catch {
    /* some browsers only open it from their own control, which is fine */
  }
});

const limitBtn = $('limitBtn');
const limitInput = $('limitInput');
limitBtn.addEventListener('click', () => {
  limitBtn.hidden = true;
  limitInput.hidden = false;
  limitInput.value = store.state.capacity ?? '';
  limitInput.focus();
  limitInput.select();
});
function closeLimit() {
  if (limitInput.hidden) return;
  const n = parseInt(limitInput.value, 10);
  const next = n >= 1 ? Math.min(n, 100000) : null;
  limitInput.hidden = true;
  limitBtn.hidden = false;
  if (next !== store.state.capacity) {
    store.change((s) => {
      s.capacity = next;
      s.metaAt = Date.now();
    }, { reason: 'meta' });
  }
}
limitInput.addEventListener('blur', closeLimit);
limitInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') limitInput.blur();
  if (e.key === 'Escape') {
    limitInput.value = store.state.capacity ?? '';
    limitInput.blur();
  }
});

$('tally').addEventListener('click', (e) => {
  const key = e.target.dataset?.filter;
  if (!key) return;
  ui.filter = ui.filter === key ? '' : key;
  drawCounts();
  drawList();
});

/* ---------- PDF, sharing, starting over ---------- */

async function onDownload(e) {
  if (!store.state.guests.length) {
    toast('Add a guest first.');
    magic.focus();
    return;
  }
  const buttons = document.querySelectorAll('.js-download');
  const label = e.currentTarget.textContent;
  buttons.forEach((b) => {
    b.disabled = true;
    b.textContent = 'Making your PDF…';
  });
  try {
    await downloadPdf(store.state);
  } catch (err) {
    console.error(err);
    toast('The PDF could not be made. Check your connection and try again.');
  } finally {
    buttons.forEach((b) => {
      b.disabled = false;
      b.textContent = label;
    });
  }
}
document.querySelectorAll('.js-download').forEach((b) => b.addEventListener('click', onDownload));

// The link opens this same list on another phone; edits made there show up here, and back.
$('share').addEventListener('click', async () => {
  const token = sync.ensureToken();
  showToken(token);
  sync.push();
  const url = `${location.origin}/#g=${token}`;
  const title = store.state.names ? `${store.state.names}: guest list` : 'Our guest list';
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title, text: 'Our wedding guest list. Open it to see and edit it with me.', url });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied. Anyone with it can see and edit this list, so only send it to people you trust.', { ms: 9000 });
  } catch {
    window.prompt('Copy this link:', url);
  }
});

/* ---------- reading a PDF back in ---------- */

async function importFile(file) {
  if (!file) return;
  if (file.size > 25e6) {
    toast('That file is too big to be a guest list.');
    return;
  }
  toast('Reading your file…', { ms: 30000 });
  try {
    const { readListFile } = await import('./pdfread.js');
    const result = await readListFile(file);
    if (!result.guests.length) {
      toast('No guests found in that file.');
      return;
    }
    const from = result.source === 'text' && !/\.pdf$/i.test(file.name) ? 'the file' : 'the PDF';
    addFound(result.guests, { withinBatch: false, meta: result.meta, from, unreadable: result.unreadable });
  } catch (err) {
    if (err?.message !== 'unsupported') console.error(err);
    toast('That file couldn’t be read. Try a PDF downloaded from this page.');
  }
}

const fileInput = $('fileInput');
for (const id of ['upload', 'uploadEmpty']) $(id).addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  importFile(fileInput.files[0]);
  fileInput.value = '';
});

const carriesFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragover', (e) => {
  if (!carriesFiles(e)) return;
  e.preventDefault();
  document.body.classList.add('is-dropping');
});
document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) document.body.classList.remove('is-dropping');
});
document.addEventListener('drop', (e) => {
  if (!carriesFiles(e)) return;
  e.preventDefault();
  document.body.classList.remove('is-dropping');
  importFile(e.dataTransfer.files[0]);
});

let resetArmed = null;
$('reset').addEventListener('click', (e) => {
  const button = e.currentTarget;
  if (!resetArmed) {
    button.textContent = `Tap again to clear all ${plural(totals(store.state).guests, 'guest')}`;
    button.classList.add('is-armed');
    resetArmed = setTimeout(() => {
      button.textContent = 'Start a new list';
      button.classList.remove('is-armed');
      resetArmed = null;
    }, 4000);
    return;
  }
  clearTimeout(resetArmed);
  resetArmed = null;
  button.textContent = 'Start a new list';
  button.classList.remove('is-armed');
  ui.filter = '';
  ui.open = null;
  // Cleared guests are marked as removed, so other phones on this list clear too.
  store.change((s) => {
    const now = Date.now();
    for (const g of s.guests) s.removed[g.id] = now;
    Object.assign(s, { guests: [], names: '', date: '', capacity: null, metaAt: now });
  }, { reason: 'replace' });
  toast('List cleared.', { undo: true, ms: 10000 });
  scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
});

$('toastUndo').addEventListener('click', () => {
  const action = toastAction;
  toastAction = null;
  $('toast').hidden = true;
  action?.run();
});

// Opening someone's list link. Whatever was on this phone before is kept aside, one tap from joining it.
async function joinList(token) {
  const before = store.state.guests.length ? JSON.parse(store.snapshot()) : null;
  if (before) {
    try {
      localStorage.setItem('guestlist.previous', JSON.stringify(before));
    } catch {
      /* the toast below still offers to bring them across */
    }
    if (sync.token) await sync.push();
  }
  sync.open(token);
  ui.filter = '';
  ui.open = null;
  store.switchTo(blank());
  await sync.pull();
  if (before) {
    const guests = before.guests.map(({ id, updatedAt, ...rest }) => rest);
    toast(`Opened the shared list. This phone had ${plural(peopleIn(before.guests), 'other guest')}.`, {
      action: { label: 'Add them', run: () => addFound(guests, { withinBatch: false, from: 'this phone' }) },
      ms: 20000,
    });
  } else toast('Opened the shared list.');
}

async function openLink() {
  const joined = location.hash.match(/^#g=([A-Za-z0-9_-]{24,64})$/);
  if (joined) {
    if (joined[1] !== sync.token) await joinList(joined[1]);
    return;
  }
  const match = location.hash.match(/^#list=(.+)$/);
  if (!match) {
    showToken(sync.token);
    return;
  }
  // An older kind of link that carried a copy of the list itself.
  history.replaceState(null, '', location.pathname + location.search);
  showToken(sync.token);
  const incoming = await decodeList(match[1]);
  if (!incoming) {
    toast('That link is damaged. Ask for it to be sent again.');
    return;
  }
  const { state, report } = merge(store.state, incoming);
  if (!report.added && !report.updated && !report.removed) {
    toast('You already have everything in that link.');
    return;
  }
  store.replace(state);
  const parts = [];
  if (report.added) parts.push(`${report.added} added`);
  if (report.updated) parts.push(`${report.updated} updated`);
  if (report.removed) parts.push(`${report.removed} removed`);
  toast(`Shared list: ${parts.join(', ')}.`, { undo: true, ms: 9000 });
}

/* ---------- keyboard, scrolling, offline ---------- */

const isTyping = (node) => node.matches?.('input, textarea, [contenteditable]');

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !isTyping(e.target)) {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
  } else if (mod && e.key.toLowerCase() === 'y' && !isTyping(e.target)) {
    e.preventDefault();
    store.redo();
  } else if (e.key === '/' && !isTyping(e.target)) {
    e.preventDefault();
    magic.focus();
  }
});

new IntersectionObserver(([entry]) => {
  const scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;
  document.body.classList.toggle('show-bar', scrolledPast);
  $('bar').setAttribute('aria-hidden', String(!scrolledPast));
  $('bar').querySelector('button').tabIndex = scrolledPast ? 0 : -1;
}, { rootMargin: '-40px 0px 0px 0px' }).observe($('countNumber'));

addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY && e.newValue) store.reload(e.newValue);
});
addEventListener('pagehide', () => store.flush());
document.addEventListener('visibilitychange', () => document.hidden && store.flush());
addEventListener('hashchange', openLink);

if ('serviceWorker' in navigator && isSecureContext) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

sync = createSync(store, { onStatus: drawSave, onToken: showToken });
drawHeader();
ui.twinsDirty = true;
drawCounts();
drawList();
drawAction();
drawSave('');
openLink().finally(() => sync.start());

// Turns whatever people type, paste or say into guests. No DOM in here.

const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const NUM = String.raw`\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve`;
const toNum = (s) => NUM_WORDS[s.toLowerCase()] ?? parseInt(s, 10);

const TITLES = new Set(
  'mr mrs ms miss mx master dr doc prof sir lady lord dame rev revd reverend pastor pst fr father chief chf engr eng barr barrister hon alhaji alhaja alh oba otunba arc arch elder evang bishop apostle deacon deaconess dcn capt col gen maj lt justice judge mallam malam madam mama papa aunty auntie uncle baba iya prince princess hrh sen senator gov bro sis'.split(' ')
);
const LOWER_WORDS = new Set(['and', 'of', 'de', 'la', 'van', 'von', 'del', 'der', 'da', 'di', 'bin', 'family']);
const UPPER_WORDS = new Set(['hrh']);

// Every word of a heading must come from here (or be a possessive like "Tunde's").
const GROUP_WORDS = new Set(
  'family families friend friends colleague colleagues coworker coworkers co-worker co-workers work office church mosque school uni university college neighbour neighbours neighbor neighbors in-law in-laws inlaws relative relatives cousin cousins bride groom bridal side maid maids bridesmaids groomsmen committee vip vips other others guest guests choir club team mum mom mother dad father parent parents my our the from of and his her their old'.split(' ')
);

const CLIP = { name: 120, table: 20, contact: 60, group: 40, note: 200 };
const clip = (s, n) => s.trim().slice(0, n);

const normalise = (s) =>
  String(s)
    .normalize('NFC')
    .replace(/[’‘]/g, "'")
    .replace(/[   ]/g, ' ')
    .trim();

const stripDecor = (s) =>
  s
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, ' ')
    .replace(/[*_~`]+/g, ' ')
    .trim();

const LEADING_NUMBER = /^\s*(?:\(?\d{1,4}[.):\-]+\s*|\d{1,4}\s+|[-–—•·▪◦‣>]+\s*)/;

function smartCase(name) {
  const hasLower = /\p{Ll}/u.test(name);
  const hasUpper = /\p{Lu}/u.test(name);
  if (hasLower && hasUpper) return name; // the person typed it deliberately: McDonald, de Souza
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (UPPER_WORDS.has(word)) return word.toUpperCase();
      if (i > 0 && LOWER_WORDS.has(word)) return word;
      return word.replace(/(^|['\-])(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
    })
    .join(' ');
}

function headcount(name) {
  const people = name.split(/\s*(?:&|\+|,|\band\b)\s*/i).filter((p) => p.trim()).length || 1;
  if (people === 1 && (/\bfamily\b/i.test(name) || /^the\s+\p{L}+s$/iu.test(name))) return 2;
  return people;
}

const statusFrom = (s) => {
  const v = s.trim().toLowerCase();
  if (/^(yes|y|coming|confirmed|attending|accepted|going)$/.test(v)) return 'coming';
  if (/^(no|n|declined|not coming|regrets?|can't come|cannot come)$/.test(v)) return 'declined';
  return 'waiting';
};

function findPhone(s) {
  let contact = '';
  const rest = s.replace(/\+?\d[\d\s().-]{7,}\d/g, (m) => {
    if (m.replace(/\D/g, '').length < 9) return m;
    let phone = m.trim();
    let keep = '';
    // "3 08012345678" and "08012345678 3": the short number is a headcount, not part of the phone.
    const lead = phone.match(/^(\d{1,2})\s+(0\d{6,}.*|\+.*)$/);
    if (lead) {
      keep = `${lead[1]} `;
      phone = lead[2];
    }
    const tail = phone.match(/^(\+?\d{10,})\s+(\d{1,2})$/);
    if (tail) {
      phone = tail[1];
      keep += ` ${tail[2]}`;
    }
    if (contact) return m;
    contact = phone;
    return ` ${keep} `;
  });
  return { contact, rest };
}

function parseRecord(line) {
  let s = normalise(line);
  const g = { name: '', party: 1, table: '', contact: '', group: '', note: '', status: 'waiting' };
  let absolute = null;
  let plus = 0;
  const notes = [];

  if (/[✅✔☑]/u.test(s)) g.status = 'coming';
  if (/[❌✖✗]/u.test(s)) g.status = 'declined';
  s = stripDecor(s).replace(LEADING_NUMBER, '');

  const email = s.match(/[^\s@,;()]+@[^\s@,;()]+\.[^\s@,;()]+/);
  if (email) {
    g.contact = email[0];
    s = s.replace(email[0], ' ');
  }
  const phone = findPhone(s);
  s = phone.rest;
  g.contact = g.contact || phone.contact;

  s = s.replace(/(^|[\s,;(–—-])(?:at\s+)?(?:table|tbl)\s*[:#.-]?\s*([\p{L}\p{N}]+)\)?/iu, (_, pre, t) => {
    g.table = String(NUM_WORDS[t.toLowerCase()] ?? t);
    return pre;
  });

  s = s.replace(/#([\p{L}\p{N}][\p{L}\p{N}'_-]*)/u, (_, tag) => {
    g.group = smartCase(tag.replace(/[_-]+/g, ' '));
    return ' ';
  });

  s = s.replace(
    /[\s,;:(–—-]*\b(?:not coming|can'?t (?:come|make it)|cannot (?:come|make it)|won'?t (?:come|make it)|declined|regrets?)\b\)?\s*[.!]*$/i,
    () => ((g.status = 'declined'), ' ')
  );
  s = s.replace(/[\s,;:(–—-]*\b(?:confirmed|attending|coming|rsvp'?d)\b\)?\s*[.!]*$/i, () => ((g.status = 'coming'), ' '));
  s = s.replace(/\s*[,:(–—-]\s*yes\)?\s*[.!]*$/i, () => ((g.status = 'coming'), ' '));
  s = s.replace(/\s*[,:(–—-]\s*no\)?\s*[.!]*$/i, () => ((g.status = 'declined'), ' '));

  // Explicit extras: +2, plus two, & 2 kids, + guest
  s = s.replace(
    new RegExp(String.raw`\s*(?:\+|\bplus\b|&|\band\b)\s*(${NUM})(?:\s*(?:kids?|child|children|guests?|others?|people|persons?|more|adults?))?(?![\p{L}\p{N}])`, 'giu'),
    (_, n) => ((plus += toNum(n)), ' ')
  );
  s = s.replace(/\s*(?:\+|\bplus\b|&|\band\b)\s*(?:a\s+|one\s+)?(?:guest|date|plus[\s-]?one)(?!\p{L})/giu, () => ((plus += 1), ' '));

  // Explicit totals: family of 5, x3, (3), 3 people, trailing 3
  s = s.replace(new RegExp(String.raw`\b(family\s+)?of\s+(${NUM})(?![\p{L}\p{N}])`, 'iu'), (_, fam, n) => {
    absolute = toNum(n);
    return fam ? 'family ' : ' ';
  });
  s = s.replace(new RegExp(String.raw`\bparty\s+$|[\s,;(–—-]*\b(${NUM})\s*(?:people|persons?|guests?|pax|seats?|adults?|heads?)\b\)?`, 'iu'), (m, n) => {
    if (n) absolute = toNum(n);
    return ' ';
  });
  s = s.replace(/\((\d{1,2})\)/, (_, n) => ((absolute = +n), ' '));

  // Notes come out before the trailing-number rule, so "Ada Obi 3 vegan" still reads as 3.
  s = s.replace(/[([]([^)\]]*)[)\]]/g, (_, inner) => {
    if (inner.trim()) notes.push(inner.trim());
    return ' ';
  });
  s = s.replace(
    /\b(?:vegan|vegetarian|pescatarian|halal|kosher|(?:gluten|dairy|nut)[- ]free|wheelchair(?:\s+(?:user|access))?|(?:nut|peanut|shellfish|seafood|dairy|egg|gluten|lactose|fish)\s+(?:allergy|allergic)|no\s+(?:pork|beef|meat|seafood|alcohol))\b/gi,
    (m) => (notes.push(m), ' ')
  );

  s = s.replace(/(?:^|\s)[x×]\s*(\d{1,2})(?=$|[\s,;)])/iu, (_, n) => ((absolute = +n), ' '));
  s = s.replace(/[\s:,–—-]+(\d{1,2})\s*$/, (_, n) => ((absolute = +n), ' '));

  const name = s
    .replace(/\s+/g, ' ')
    .replace(/\s+[-–—]\s+[-–—]\s+/g, ' ')
    .replace(/\s+and\s*$/i, '')
    .replace(/^[\s,;:.\-–—&+]+|[\s,;:.\-–—&+]+$/g, '');
  if (!/\p{L}/u.test(name)) return null;

  g.name = clip(smartCase(name), CLIP.name);
  g.party = Math.min(99, Math.max(1, absolute != null ? absolute + plus : headcount(name) + plus));
  g.note = clip(notes.join(', '), CLIP.note);
  g.table = clip(g.table, CLIP.table);
  g.contact = clip(g.contact, CLIP.contact);
  g.group = clip(g.group, CLIP.group);
  return g;
}

function isGroupName(text) {
  const words = text.toLowerCase().replace(/[^\p{L}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 5) return false;
  const hasRealWord = words.some((w) => !['my', 'our', 'the', 'from', 'of', 'and', 'his', 'her', 'their', 'old'].includes(w));
  return hasRealWord && words.every((w) => GROUP_WORDS.has(w) || /'s?$/.test(w));
}

// A line that names a section rather than a guest.
function headingOf(raw, multi) {
  if (!multi) return null;
  const line = normalise(raw);
  const clean = stripDecor(line);
  if (!clean || /\d/.test(clean)) return null;
  if (/:\s*$/.test(clean) && clean.length <= 42) return smartCase(clean.replace(/:\s*$/, ''));
  if (/^\*[^*]+\*$/.test(line) || /^(?:={2,}|-{2,})[^=-]+(?:={2,}|-{2,})$/.test(line)) return smartCase(clean.replace(/^[=-]+|[=-]+$/g, '').trim());
  if (!LEADING_NUMBER.test(line) && isGroupName(clean)) return smartCase(clean);
  return null;
}

const FIELD_PATTERNS = [
  /^[\d\s+().-]+$/,
  /^(?:at\s+)?(?:table|tbl)\b/i,
  /@/,
  /^(?:\+|plus\b|x\s*\d|×)/i,
  new RegExp(String.raw`^(?:${NUM})\s*(?:people|persons?|guests?|pax|seats?|adults?)$`, 'i'),
  /^(?:confirmed|attending|coming|declined|yes|no|not coming|regrets?|can'?t come)$/i,
  /^(?:vegan|vegetarian|halal|kosher)$/i,
  /^#/,
];
const looksLikeField = (piece) => FIELD_PATTERNS.some((re) => re.test(piece));
const oneWord = (p) => !/\s/.test(p.trim());
const titlesOnly = (p) => {
  const words = p.toLowerCase().replace(/[.&]/g, ' ').replace(/\band\b/g, ' ').split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => TITLES.has(w));
};

// "Johnson, Mr & Mrs" reads as "Mr & Mrs Johnson".
function reorderTitles(text) {
  const pieces = text.split(/\s*,\s*/);
  return pieces.length === 2 && titlesOnly(pieces[1]) ? `${pieces[1]} ${pieces[0]}` : text;
}

function splitNames(line) {
  const clean = normalise(line);
  const pieces = clean.split(/\s*[,;]\s*/).map((p) => p.trim()).filter(Boolean);
  if (pieces.length < 2) return [clean];
  if (pieces.some(looksLikeField)) return [clean.replace(/\s*[,;]\s*/g, ' ')];
  if (reorderTitles(clean) !== clean) return [reorderTitles(clean)];
  const last = pieces[pieces.length - 1];
  const lastNames = last.split(/\s*(?:&|\band\b)\s*/i);
  if (lastNames.length > 1 && lastNames.every(oneWord) && pieces.slice(0, -1).every(oneWord)) return [clean];
  return pieces;
}

function splitCells(line, delim) {
  if (delim === '\t') return line.split('\t').map((c) => c.trim());
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delim && !quoted) {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const COLUMNS = {
  table: /^(table|table\s*(no\.?|number)|tbl)$/i,
  contact: /^(phone|phone\s*number|contact|mobile|whatsapp|tel|telephone|email|e-mail)$/i,
  group: /^(group|side|category|relationship|type)$/i,
  note: /^(notes?|dietary|diet|meal|comments?|allergies)$/i,
  status: /^(status|rsvp|attending|coming|confirmed)$/i,
  party: /^(party|party\s*size|size|qty|quantity|count|total|guests?|seats?|pax|people|persons|number|no\.?|number\s+of\s+(guests|people)|no\.?\s+of\s+(guests|people))$/i,
};

function headerMap(line, delim) {
  const cells = splitCells(line, delim);
  let name = cells.findIndex((c) => /^(full\s*)?names?$|^guest\s*names?$|^invitees?$/i.test(c));
  if (name < 0 && !cells.some((c) => /^(table|phone|contact|mobile|email|status|rsvp)$/i.test(c))) return null;
  if (name < 0) name = cells.findIndex((c) => /^guests?$/i.test(c));
  if (name < 0) return null;
  const map = { name };
  cells.forEach((c, i) => {
    if (i === name) return;
    for (const [field, re] of Object.entries(COLUMNS)) {
      if (map[field] == null && re.test(c)) {
        map[field] = i;
        break;
      }
    }
  });
  return map;
}

function fromColumns(cells, map) {
  const g = parseRecord(reorderTitles(cells[map.name] || ''));
  if (!g) return null;
  const cell = (field) => (map[field] != null ? cells[map[field]] || '' : '');
  const n = parseInt(cell('party'), 10);
  if (n >= 1) g.party = Math.min(99, n);
  if (cell('table')) g.table = clip(cell('table').replace(/^(?:table|tbl)\s*/i, ''), CLIP.table);
  if (cell('contact')) g.contact = clip(cell('contact'), CLIP.contact);
  if (cell('group')) g.group = clip(cell('group'), CLIP.group);
  if (cell('note')) g.note = clip(cell('note'), CLIP.note);
  if (cell('status')) g.status = statusFrom(cell('status'));
  return g;
}

export function parseInput(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!lines.length) return [];

  const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : null;
  const map = delim && lines.length > 1 ? headerMap(lines[0], delim) : null;
  if (map) return lines.slice(1).map((l) => fromColumns(splitCells(l, delim), map)).filter(Boolean);

  const multi = lines.length > 1;
  const out = [];
  let group = '';
  for (let line of lines) {
    const heading = headingOf(line, multi);
    if (heading !== null) {
      group = clip(heading, CLIP.group);
      continue;
    }
    let lineGroup = group;
    const lead = line.match(/^\s*([^:\d]{2,40}):\s*(.+)$/);
    if (lead && isGroupName(stripDecor(lead[1]))) {
      lineGroup = clip(smartCase(stripDecor(lead[1])), CLIP.group);
      line = lead[2];
    }
    const pieces = line.includes('\t')
      ? [line.split('\t').map((c) => c.trim()).filter(Boolean).join(' ')]
      : splitNames(line);
    for (const piece of pieces) {
      const g = parseRecord(piece);
      if (g) {
        g.group = g.group || lineGroup;
        out.push(g);
      }
    }
  }
  return out;
}

const tokenCache = new Map();

function tokens(name) {
  const text = String(name);
  let words = tokenCache.get(text);
  if (!words) {
    words = text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .filter(Boolean);
    if (tokenCache.size > 20000) tokenCache.clear();
    tokenCache.set(text, words);
  }
  return words;
}

// Same words in any order, accents ignored: "Bakare, Tunde" = "tunde bakaré".
export const strictKey = (name) => [...tokens(name)].sort().join(' ');

// Also ignores titles and filler: "Mr & Mrs Johnson" = "Mr Johnson".
export const looseKey = (name) =>
  tokens(name)
    .filter((t) => !TITLES.has(t) && !['and', 'the', 'family', 'wife', 'husband', 'spouse', 'partner', 'kids', 'children'].includes(t))
    .sort()
    .join(' ');

// Alphabetical position, skipping titles: "Mr & Mrs Johnson" files under J.
export const sortKey = (name) =>
  tokens(name)
    .filter((t) => !TITLES.has(t) && !['and', 'the'].includes(t))
    .join(' ');

function editDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (row[j] < best) best = row[j];
    }
    if (best > limit) return limit + 1;
    prev = row;
  }
  return prev[b.length];
}

export function isSimilarKey(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  if (shorter < 6 || !a.includes(' ') || !b.includes(' ')) return false; // first names alone are too common to call
  return editDistance(a, b, shorter >= 10 ? 2 : 1) <= (shorter >= 10 ? 2 : 1);
}

// The first guest who looks like the same person, or null.
export function findSimilar(name, guests, skipId) {
  const key = looseKey(name);
  return guests.find((g) => g.id !== skipId && isSimilarKey(key, looseKey(g.name))) || null;
}

export function matchesQuery(guest, query) {
  const q = tokens(query).join(' ');
  if (!q) return false;
  return tokens(guest.name).join(' ').includes(q);
}

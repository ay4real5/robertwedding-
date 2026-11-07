// Builds the printable guest list. Loaded on the first download so the page stays light.

import { sortKey } from './parse.js';
import { PDF_DATA_PREFIX, encodeList } from './share.js';
import { groupOrder, totals } from './store.js';
import { LEAF_CURVES, SIZE, leafAt, slotsFor, stemPoints } from './wreath.js';

const INK = '#14291f';
const SOFT = '#5a6b60';
const GOLD = '#a8873f';
const RULE = '#dcd5c4';
const SAGE = '#8aa593';
const ROSE = '#b5536a';
const STATUS_LABEL = { coming: 'Coming', waiting: 'Waiting', declined: "Can't come" };

const FONTS = [
  ['cormorant-medium.ttf', 'Cormorant', 'normal'],
  ['cormorant-semibold.ttf', 'Cormorant', 'bold'],
  ['cormorant-italic.ttf', 'Cormorant', 'italic'],
  ['jost-regular.ttf', 'Jost', 'normal'],
  ['jost-medium.ttf', 'Jost', 'bold'],
];
const CANVAS_FONT = {
  Cormorant: { normal: '500', bold: '600', italic: 'italic 400', family: '"Cormorant Garamond", "Noto Serif", Georgia, serif' },
  Jost: { normal: '400', bold: '500', italic: '400', family: 'Jost, system-ui, sans-serif' },
};

let libraryReady = null;

function loadLibrary() {
  libraryReady ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/jspdf.umd.min.js';
    script.onload = resolve;
    script.onerror = () => {
      libraryReady = null;
      reject(new Error('Could not load the PDF maker.'));
    };
    document.head.appendChild(script);
  });
  return libraryReady;
}

const fontFiles = new Map();

async function loadFont([file]) {
  if (fontFiles.has(file)) return fontFiles.get(file);
  const res = await fetch(`/fonts/pdf/${file}`);
  if (!res.ok) throw new Error(`Could not load ${file}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const b64 = btoa(bin);
  fontFiles.set(file, b64);
  return b64;
}

export const pdfFileName = (names) => {
  const slug = (names || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, ' and ')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug ? `${slug}-` : ''}guest-list.pdf`;
};

export const longDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Sections for the page: each named group alphabetically, then everyone else, then regrets.
function sections(state) {
  const byName = (a, b) => sortKey(a.name).localeCompare(sortKey(b.name));
  const attending = state.guests.filter((g) => g.status !== 'declined');
  const groups = groupOrder(attending);
  const out = groups.map((title) => ({ title, guests: attending.filter((g) => g.group === title).sort(byName) }));
  const rest = attending.filter((g) => !g.group).sort(byName);
  if (rest.length) out.push({ title: groups.length ? 'Everyone else' : '', guests: rest });
  const declined = state.guests.filter((g) => g.status === 'declined').sort(byName);
  if (declined.length) out.push({ title: "Can't come", guests: declined, declined: true });
  return out;
}

function drawWreath(doc, t, capacity, cx, cy, diameter) {
  const scale = diameter / SIZE;
  const ox = cx - diameter / 2;
  const oy = cy - diameter / 2;
  const at = ([x, y]) => [ox + x * scale, oy + y * scale];
  const slots = slotsFor(t.guests, capacity);
  const count = Math.min(t.guests, 5000);

  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.18);
  if (count) {
    for (const side of [1, -1]) {
      const [first, ...rest] = stemPoints(side, Math.min(1, count / slots)).map(at);
      doc.path([{ op: 'm', c: first }, ...rest.map((c) => ({ op: 'l', c }))]).stroke();
    }
  }

  for (let i = 0; i < count; i++) {
    const spot = leafAt(i, slots);
    const rad = (spot.rot * Math.PI) / 180;
    const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
    const map = (x, y) => at([spot.x + spot.len * (x * cos - y * sin), spot.y + spot.len * (x * sin + y * cos)]);
    const curve = (c) => ({ op: 'c', c: [...map(c[0], c[1]), ...map(c[2], c[3]), ...map(c[4], c[5])] });
    doc.setFillColor(capacity && i >= capacity ? ROSE : i < t.coming ? GOLD : SAGE);
    doc.path([{ op: 'm', c: map(0, 0) }, curve(LEAF_CURVES[0]), curve(LEAF_CURVES[1]), { op: 'h', c: [] }]).fill();
  }

  // The knot at the bottom of the wreath.
  const [kx, ky] = at([SIZE / 2, SIZE / 2 + 122]);
  const k = 6 * scale * 3;
  doc.setFillColor(GOLD);
  for (const s of [1, -1]) {
    doc.path([
      { op: 'm', c: [kx, ky] },
      { op: 'c', c: [kx + s * k * 0.5, ky - k * 0.4, kx + s * k, ky - k * 0.35, kx + s * k, ky] },
      { op: 'c', c: [kx + s * k, ky + k * 0.35, kx + s * k * 0.5, ky + k * 0.4, kx, ky] },
      { op: 'h', c: [] },
    ]).fill();
    doc.line(kx + s * 0.2, ky, kx + s * k * 0.45, ky + k * 0.85);
  }
}

export async function buildPdf(state) {
  await loadLibrary();
  const fonts = await Promise.all(FONTS.map(loadFont));
  const { jsPDF } = globalThis.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  FONTS.forEach(([file, family, style], i) => {
    doc.addFileToVFS(file, fonts[i]);
    doc.addFont(file, family, style);
  });

  const t = totals(state);
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18;
  const BOTTOM = H - 18;
  const title = state.names || 'Our wedding';
  // An exact copy of the list rides along in the file's keywords, so uploading it brings everything back.
  const data = PDF_DATA_PREFIX + (await encodeList({ ...state, removed: {} }));
  doc.setProperties({ title: `${title}: guest list`, subject: 'Wedding guest list', creator: 'Guest List', keywords: data });

  const col = { box: M, no: M + 8, name: M + 17, guests: W - M - 50, table: W - M - 33, status: W - M };
  const nameWidth = col.guests - col.name - 8;

  const font = (family, style, size, color = INK) => {
    doc.setFont(family, style);
    doc.setFontSize(size);
    doc.setTextColor(color);
  };

  const hasGlyphs = (text) => {
    const map = doc.getFont().metadata?.cmap?.unicode?.codeMap;
    if (!map) return true;
    for (const ch of text) if (!map[ch.codePointAt(0)]) return false;
    return true;
  };

  // The PDF library can't stack a tone mark on a letter ("ọ̀") and our fonts don't cover every
  // alphabet. Those strings are drawn by the browser, which handles both, so no name ever
  // prints wrong or blank. Invisible text underneath keeps them searchable where it can.
  const simple = (raw) => {
    const text = raw.normalize('NFC');
    return hasGlyphs(text) && !/\p{M}/u.test(text);
  };

  function paint(raw, x, y, { family, style, size, color, align, maxWidth }) {
    const text = raw.normalize('NFC');
    const px = size * 5;
    const spec = CANVAS_FONT[family];
    const css = `${spec[style]} ${px}px ${spec.family}`;
    const canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');
    ctx.font = css;
    canvas.width = Math.ceil(ctx.measureText(text).width) + Math.ceil(px * 0.4);
    canvas.height = Math.ceil(px * 1.6);
    ctx = canvas.getContext('2d');
    ctx.font = css;
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    const pad = Math.ceil(px * 0.2);
    const baseline = Math.ceil(px * 1.15);
    ctx.fillText(text, pad, baseline);
    const mm = (size * 0.3528) / px;
    const shrink = maxWidth ? Math.min(1, maxWidth / ((canvas.width - 2 * pad) * mm)) : 1;
    const width = canvas.width * mm * shrink;
    const textWidth = (canvas.width - 2 * pad) * mm * shrink;
    const left = align === 'center' ? x - textWidth / 2 : align === 'right' ? x - textWidth : x;
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', left - pad * mm * shrink, y - baseline * mm * shrink, width, canvas.height * mm * shrink);
    if (hasGlyphs(text)) doc.text(text, left, y, { renderingMode: 'invisible' });
  }

  // Every piece of text a person typed goes through here.
  function put(raw, x, y, opts) {
    const o = { family: 'Cormorant', style: 'normal', color: INK, ...opts };
    font(o.family, o.style, o.size, o.color);
    if (simple(raw)) doc.text(raw.normalize('NFC'), x, y, o.align ? { align: o.align } : undefined);
    else paint(raw, x, y, o);
  }

  const wrap = (raw, width, opts) => {
    font(opts.family, opts.style, opts.size);
    return simple(raw) ? doc.splitTextToSize(raw.normalize('NFC'), width) : [raw];
  };

  const columnLabels = (y) => {
    font('Jost', 'normal', 7.5, SOFT);
    doc.text('NO.', col.no, y);
    doc.text('NAME', col.name, y);
    doc.text('GUESTS', col.guests, y, { align: 'center' });
    doc.text('TABLE', col.table, y, { align: 'center' });
    doc.text('RSVP', col.status, y, { align: 'right' });
    doc.setDrawColor(INK);
    doc.setLineWidth(0.25);
    doc.line(M, y + 1.8, W - M, y + 1.8);
    return y + 7;
  };

  const newPage = () => {
    doc.addPage();
    put(title, M, 14, { style: 'italic', size: 11, color: SOFT, maxWidth: W - 2 * M - 30 });
    font('Jost', 'normal', 7.5, SOFT);
    doc.text('GUEST LIST', W - M, 14, { align: 'right' });
    return columnLabels(22);
  };

  // Cover block.
  let y = 24;
  const heading = { family: 'Cormorant', style: 'bold', size: 26 };
  for (const line of wrap(title, W - 2 * M, heading)) {
    put(line, W / 2, y, { ...heading, align: 'center', maxWidth: W - 2 * M });
    y += 10;
  }
  y -= 3;
  font('Cormorant', 'italic', 13, SOFT);
  doc.text(state.date ? longDate(state.date) : 'Guest list', W / 2, y, { align: 'center' });

  const diameter = 60;
  const cy = y + 35;
  drawWreath(doc, t, state.capacity, W / 2, cy, diameter);
  font('Cormorant', 'bold', 40);
  doc.text(String(t.guests), W / 2, cy + 3, { align: 'center' });
  font('Jost', 'normal', 7.5, SOFT);
  doc.text(t.guests === 1 ? 'GUEST' : 'GUESTS', W / 2, cy + 8.5, { align: 'center' });
  if (state.capacity) {
    font('Cormorant', 'italic', 10.5, t.guests > state.capacity ? ROSE : SOFT);
    doc.text(`of ${state.capacity} seats`, W / 2, cy + 13, { align: 'center' });
  }

  y = cy + diameter / 2 + 11;
  const summary = [plural(t.invitations, 'invitation'), `${t.coming} coming`, `${t.waiting} waiting`];
  if (t.declined) summary.push(`${t.declined} can't come`);
  font('Jost', 'normal', 9.5, SOFT);
  doc.text(summary.join('   ·   '), W / 2, y, { align: 'center' });
  y += 10;
  y = columnLabels(y);

  // Rows.
  const NAME = { family: 'Cormorant', style: 'normal', size: 12.5 };
  const EXTRA = { family: 'Jost', style: 'normal', size: 8 };
  let number = 0;

  const measure = (g) => {
    const lines = wrap(g.name, nameWidth, NAME);
    const extra = [g.contact, g.note].filter(Boolean).join('   ·   ');
    const extraLines = extra ? wrap(extra, nameWidth, EXTRA) : [];
    return { lines, extraLines, height: 3.2 + lines.length * 5.1 + extraLines.length * 3.6 + 1.6 };
  };

  for (const part of sections(state)) {
    const rows = part.guests.map((g) => ({ g, m: measure(g) }));
    if (part.title) {
      // Keep a heading with at least its first guest.
      if (y + 11 + rows[0].m.height > BOTTOM) y = newPage();
      y += 3;
      put(part.title, M, y, { style: 'bold', size: 14, color: part.declined ? SOFT : GOLD, maxWidth: W - 2 * M - 30 });
      const people = part.guests.reduce((sum, g) => sum + g.party, 0);
      font('Jost', 'normal', 8.5, SOFT);
      doc.text(plural(people, 'guest'), W - M, y, { align: 'right' });
      doc.setDrawColor(part.declined ? RULE : GOLD);
      doc.setLineWidth(0.2);
      doc.line(M, y + 1.6, W - M, y + 1.6);
      y += 6;
    }

    for (const { g, m } of rows) {
      if (y + m.height > BOTTOM) y = newPage();
      number += 1;
      const base = y + 3.8;

      doc.setDrawColor(part.declined ? RULE : SOFT);
      doc.setLineWidth(0.25);
      doc.roundedRect(col.box, base - 3, 3.6, 3.6, 0.5, 0.5, 'S');

      font('Jost', 'normal', 8.5, SOFT);
      doc.text(String(number), col.no, base);

      const color = part.declined ? SOFT : INK;
      m.lines.forEach((line, i) => put(line, col.name, base + i * 5.1, { ...NAME, color, maxWidth: nameWidth }));
      if (part.declined) {
        font(NAME.family, NAME.style, NAME.size);
        const width = Math.min(doc.getTextWidth(m.lines[0]), nameWidth);
        doc.setDrawColor(SOFT);
        doc.setLineWidth(0.15);
        doc.line(col.name, base - 1.2, col.name + width, base - 1.2);
      }

      if (m.extraLines.length) {
        const top = base + (m.lines.length - 1) * 5.1 + 3.8;
        m.extraLines.forEach((line, i) => put(line, col.name, top + i * 3.6, { ...EXTRA, color: SOFT, maxWidth: nameWidth }));
      }

      font('Jost', 'bold', 10, color);
      doc.text(String(g.party), col.guests, base, { align: 'center' });
      if (g.table) put(g.table, col.table, base, { family: 'Jost', style: 'normal', size: 9.5, color, align: 'center', maxWidth: 16 });
      font('Jost', g.status === 'coming' ? 'bold' : 'normal', 8.5, g.status === 'coming' ? GOLD : SOFT);
      doc.text(STATUS_LABEL[g.status], col.status, base, { align: 'right' });

      y += m.height;
      doc.setDrawColor(RULE);
      doc.setLineWidth(0.12);
      doc.line(M, y - 0.8, W - M, y - 0.8);
    }
    y += 3;
  }

  // Footers, now the page count is known.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    font('Jost', 'normal', 7.5, SOFT);
    doc.text(plural(t.guests, 'guest'), M, H - 9);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 9, { align: 'right' });
  }

  return doc;
}

export async function downloadPdf(state) {
  const doc = await buildPdf(state);
  doc.save(pdfFileName(state.names));
}

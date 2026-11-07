// Reads a guest list back out of a file. PDFs made here from now on carry an exact copy of the
// list; older ones are read from their printed layout; anything else is read as a typed list.

import { parseInput } from './parse.js';
import { PDF_DATA_PREFIX as DATA_PREFIX, decodeList } from './share.js';
import { clean } from './store.js';

const PT_PER_MM = 72 / 25.4;
// Where the printed list puts each column, in mm from the left edge (see pdf.js).
const COL = { heading: 18, no: 26, name: 35, guests: 142, table: 159, status: 192 };
const STATUS = { Coming: 'coming', Waiting: 'waiting', "Can't come": 'declined' };
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const CONTACT = /@|^\+?[\d\s().-]{7,}$/;

let library = null;

async function loadLibrary() {
  if (!library) {
    library = await import('/vendor/pdfjs/pdf.min.mjs');
    library.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  }
  return library;
}

// Every piece of text on every page, with its place in mm from the top-left corner.
export async function readPdf(bytes, lib) {
  const task = lib.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
  try {
    const doc = await task.promise;
    const meta = await doc.getMetadata().catch(() => null);
    const pages = [];
    for (let n = 1; n <= Math.min(doc.numPages, 400); n++) {
      const page = await doc.getPage(n);
      const { height } = page.getViewport({ scale: 1 });
      const { items } = await page.getTextContent();
      pages.push(
        items
          .filter((it) => typeof it.str === 'string' && it.str.trim())
          .map((it) => ({
            str: it.str.normalize('NFC').trim(),
            x: it.transform[4] / PT_PER_MM,
            y: (height - it.transform[5]) / PT_PER_MM,
            w: it.width / PT_PER_MM,
            size: Math.hypot(it.transform[0], it.transform[1]),
          }))
      );
    }
    return { keywords: meta?.info?.Keywords, pages };
  } finally {
    await task.destroy();
  }
}

const near = (a, b, within) => Math.abs(a - b) <= within;

function parseDate(text) {
  const m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  if (month < 0) return '';
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// Rebuilds the list from the printed layout of a PDF made here. Returns null for other PDFs.
export function listFromLayout(pages) {
  const isOurs = pages.some((items) => items.some((i) => i.str === 'NAME') && items.some((i) => i.str === 'RSVP'));
  if (!isOurs) return null;

  const out = { names: '', date: '', capacity: null, guests: [], unreadable: 0 };
  let group = '';
  let declinedSection = false;
  let row = null;

  const finish = () => {
    if (!row) return;
    let name = row.name.join(' ').replace(/\s+/g, ' ').trim();
    if (!name) {
      name = `Name unreadable (no. ${row.no})`;
      out.unreadable += 1;
    }
    const parts = row.extra.join(' ').split('·').map((p) => p.trim()).filter(Boolean);
    const contact = parts.find((p) => CONTACT.test(p)) || '';
    out.guests.push({
      name,
      party: row.party,
      table: row.table,
      contact,
      group,
      note: parts.filter((p) => p !== contact).join(', '),
      status: declinedSection ? 'declined' : row.status,
    });
    row = null;
  };

  pages.forEach((items, index) => {
    const labels = items.find((i) => i.str === 'NAME');
    if (!labels) return;
    const top = labels.y + 1;
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);

    if (index === 0) {
      const above = sorted.filter((i) => i.y < labels.y - 1);
      const title = above.filter((i) => i.size >= 20 && i.size <= 30 && !/^\d+$/.test(i.str)).map((i) => i.str).join(' ');
      out.names = title === 'Our wedding' ? '' : title;
      out.date = above.map((i) => parseDate(i.str)).find(Boolean) || '';
      const seats = above.map((i) => i.str.match(/^of (\d+) seats$/)).find(Boolean);
      out.capacity = seats ? Number(seats[1]) : null;
    }

    for (const it of sorted) {
      if (it.y <= top || it.y > 297 - 12) continue; // headers, column labels, footers
      const right = it.x + it.w;
      const centre = it.x + it.w / 2;
      if (near(it.x, COL.heading, 2) && it.size >= 13) {
        finish();
        declinedSection = it.str === "Can't come";
        group = declinedSection || it.str === 'Everyone else' ? '' : it.str;
      } else if (near(it.x, COL.no, 2.5) && /^\d+$/.test(it.str)) {
        finish();
        row = { no: it.str, y: it.y, name: [], extra: [], party: 1, table: '', status: 'waiting' };
      } else if (!row) {
        continue;
      } else if (near(right, COL.status, 3) && STATUS[it.str]) {
        row.status = STATUS[it.str];
      } else if (near(centre, COL.guests, 8) && /^\d+$/.test(it.str) && near(it.y, row.y, 0.6)) {
        row.party = Math.min(99, Math.max(1, Number(it.str)));
      } else if (near(centre, COL.table, 9) && near(it.y, row.y, 0.6)) {
        row.table = it.str;
      } else if (it.x > COL.name - 3 && it.x < COL.guests - 8) {
        (it.size >= 10 ? row.name : row.extra).push(it.str);
      }
    }
  });
  finish();
  return out;
}

// Any other PDF: rebuild its lines, keeping wide gaps as tabs so tables read as columns.
function linesFrom(pages) {
  const lines = [];
  for (const items of pages) {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    let current = null;
    for (const it of sorted) {
      if (!current || !near(it.y, current.y, 1.2)) {
        if (current) lines.push(current.text);
        current = { y: it.y, text: it.str, end: it.x + it.w };
      } else {
        current.text += (it.x - current.end > 6 ? '\t' : ' ') + it.str;
        current.end = it.x + it.w;
      }
    }
    if (current) lines.push(current.text);
  }
  return lines;
}

const looksLikeText = (bytes) => {
  const sample = bytes.subarray(0, 4096);
  let odd = 0;
  for (const b of sample) if (b === 0 || (b < 9 && b !== 0)) odd += 1;
  return odd === 0;
};

// { guests, meta: { names, date, capacity } | null, unreadable, source: 'exact' | 'layout' | 'text' }
export async function readListFile(file, lib) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  if (!isPdf) {
    if (!looksLikeText(bytes)) throw new Error('unsupported');
    return { guests: parseInput(new TextDecoder().decode(bytes)), meta: null, unreadable: 0, source: 'text' };
  }

  const { keywords, pages } = await readPdf(bytes, lib || (await loadLibrary()));
  if (typeof keywords === 'string' && keywords.startsWith(DATA_PREFIX)) {
    const raw = await decodeList(keywords.slice(DATA_PREFIX.length));
    if (raw) {
      const list = clean(raw);
      return { guests: list.guests, meta: { names: list.names, date: list.date, capacity: list.capacity }, unreadable: 0, source: 'exact' };
    }
  }
  const printed = listFromLayout(pages);
  if (printed) {
    return { guests: printed.guests, meta: { names: printed.names, date: printed.date, capacity: printed.capacity }, unreadable: printed.unreadable, source: 'layout' };
  }
  return { guests: parseInput(linesFrom(pages).join('\n')), meta: null, unreadable: 0, source: 'text' };
}

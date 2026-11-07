import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readListFile } from '../js/pdfread.js';

const root = new URL('..', import.meta.url);
const lib = await import(new URL('vendor/pdfjs/pdf.min.mjs', root).href);
lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', root).href;
// The browser build of jsPDF, loaded the way a page would: it puts itself on globalThis.
createRequire(import.meta.url)('../vendor/jspdf.umd.min.js');
const { jsPDF } = globalThis.jspdf;

const asFile = (bytes, name = 'list.pdf') => ({ name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
const pdfOf = (draw) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  draw(doc);
  return new Uint8Array(doc.output('arraybuffer'));
};

test('a PDF downloaded before this update is read back from its printed layout', async () => {
  // Made by the version that went live first, from a pasted WhatsApp list (see tests/fixtures).
  const result = await readListFile(asFile(new Uint8Array(readFileSync(new URL('tests/fixtures/old-format.pdf', root)))), lib);
  assert.equal(result.source, 'layout');
  assert.deepEqual(result.meta, { names: 'Ada & Tunde', date: '', capacity: null });
  assert.equal(result.guests.length, 15);
  const by = (name) => result.guests.find((g) => g.name === name);
  assert.deepEqual(by('The Okafor family'), { name: 'The Okafor family', party: 5, table: '2', contact: '', group: "Bride's family", note: '', status: 'coming' });
  assert.equal(by('Mrs Adébáyọ̀ Ọláṣeun').status, 'waiting');
  assert.equal(by('Ṣadé Adéyẹmí').note, 'vegan');
  assert.equal(by('Kola Bakare').contact, '08012345678');
  assert.equal(by('Ngozi Eze').table, '3');
  assert.equal(by('Chief & Mrs Danjuma').party, 4);
  assert.equal(by('Pastor & Mrs Afolabi').group, 'Church');
  assert.equal(by('Deacon Michael Oyelaran-Whitfield-Montgomery the Third').group, 'Church', 'a name that wrapped onto two lines');
  assert.equal(by("Mark O'Brien").status, 'declined');
  assert.equal(by("Mark O'Brien").group, '');
  // The one name that was printed as a picture can't be read back; it's kept, flagged for retyping.
  assert.equal(result.unreadable, 1);
  assert.ok(by('Name unreadable (no. 7)'));
  const people = result.guests.filter((g) => g.status !== 'declined').reduce((n, g) => n + g.party, 0);
  assert.equal(people, 24, 'same headcount as the PDF says on its cover');
});

test('any other PDF is read as a typed list, and tables keep their columns', async () => {
  const bytes = pdfOf((doc) => {
    doc.setFontSize(16);
    doc.text('Our guests', 20, 20);
    doc.setFontSize(11);
    doc.text('1. Ada Obi +1', 20, 35);
    doc.text('2. Mr & Mrs Johnson', 20, 42);
    doc.text('Tunde Bakare', 20, 49);
    doc.text('3', 90, 49);
    doc.text('Table 4', 120, 49);
  });
  const result = await readListFile(asFile(bytes), lib);
  assert.equal(result.source, 'text');
  const got = result.guests.map((g) => [g.name, g.party, g.table]);
  assert.deepEqual(got.filter(([n]) => n !== 'Our Guests' && n !== 'Our guests'), [['Ada Obi', 2, ''], ['Mr & Mrs Johnson', 2, ''], ['Tunde Bakare', 3, '4']]);
});

test('an exact copy in the keywords wins over the printed page', async () => {
  const { encodeList, PDF_DATA_PREFIX } = await import('../js/share.js');
  const state = { names: 'Tabitha & Ohi', date: '2027-03-14', capacity: 150, guests: [{ id: 'a', name: 'Ada Obi', party: 2, table: 'VIP', contact: '0801', group: 'Family', note: 'vegan', status: 'coming', okDup: false, updatedAt: 1 }], removed: {} };
  const bytes = pdfOf((doc) => {
    doc.setProperties({ keywords: PDF_DATA_PREFIX + 'z' });
    doc.text('ignored text', 20, 20);
  });
  // Rebuild with the real code (async encode can't run inside pdfOf's callback).
  const code = await encodeList(state);
  const real = pdfOf((doc) => {
    doc.setProperties({ keywords: PDF_DATA_PREFIX + code });
    doc.text('Something else entirely', 20, 20);
  });
  const result = await readListFile(asFile(real), lib);
  assert.equal(result.source, 'exact');
  assert.deepEqual(result.meta, { names: 'Tabitha & Ohi', date: '2027-03-14', capacity: 150 });
  assert.equal(result.guests[0].table, 'VIP');
  // A broken copy falls back to reading the page instead of failing.
  const broken = await readListFile(asFile(bytes), lib);
  assert.notEqual(broken.source, 'exact');
});

test('a hostile PDF copy is cleaned like anything else', async () => {
  const { encodeList, PDF_DATA_PREFIX } = await import('../js/share.js');
  const code = await encodeList({ names: '<img src=x onerror=alert(1)>', date: 'never', capacity: -1, guests: [{ id: 'x', name: '<script>alert(1)</script>', party: 1e9, status: 'evil', updatedAt: 1 }], removed: {} });
  const bytes = pdfOf((doc) => doc.setProperties({ keywords: PDF_DATA_PREFIX + code }));
  const result = await readListFile(asFile(bytes), lib);
  assert.equal(result.guests[0].party, 99);
  assert.equal(result.guests[0].status, 'waiting');
  assert.equal(result.meta.date, '');
  assert.equal(result.meta.capacity, null);
});

test('text and CSV files work too, and other files are refused', async () => {
  const text = new TextEncoder().encode('Name,Party,Table\nAda Obi,2,5\nTunde Bakare,1,6');
  const result = await readListFile(asFile(text, 'guests.csv'));
  assert.deepEqual(result.guests.map((g) => [g.name, g.party, g.table]), [['Ada Obi', 2, '5'], ['Tunde Bakare', 1, '6']]);
  const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  await assert.rejects(readListFile(asFile(image, 'photo.png')));
});

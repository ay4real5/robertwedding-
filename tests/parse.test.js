import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInput, strictKey, looseKey, findSimilar, sortKey, matchesQuery } from '../js/parse.js';

const one = (text) => {
  const out = parseInput(text);
  assert.equal(out.length, 1, `expected one guest from ${JSON.stringify(text)}, got ${JSON.stringify(out)}`);
  return out[0];
};

const cases = [
  ['Ada Obi', { name: 'Ada Obi', party: 1 }],
  ['ada obi', { name: 'Ada Obi', party: 1 }],
  ['ADA OBI +1', { name: 'Ada Obi', party: 2 }],
  ['Ada Obi+2', { name: 'Ada Obi', party: 3 }],
  ['Ada Obi plus two', { name: 'Ada Obi', party: 3 }],
  ['ada obi plus one table four', { name: 'Ada Obi', party: 2, table: '4' }],
  ['Ada Obi + guest', { name: 'Ada Obi', party: 2 }],
  ['Ada Obi and guest', { name: 'Ada Obi', party: 2 }],
  ['Ada Obi x3', { name: 'Ada Obi', party: 3 }],
  ['Ada Obi × 3', { name: 'Ada Obi', party: 3 }],
  ['Ada Obi (3)', { name: 'Ada Obi', party: 3 }],
  ['Ada Obi - 3', { name: 'Ada Obi', party: 3 }],
  ['Ada Obi 3', { name: 'Ada Obi', party: 3 }],
  ['Ada Obi 4 people', { name: 'Ada Obi', party: 4 }],
  ['Mr & Mrs Johnson', { name: 'Mr & Mrs Johnson', party: 2 }],
  ['mr and mrs johnson', { name: 'Mr and Mrs Johnson', party: 2 }],
  ['Mr. & Mrs. Johnson +2', { name: 'Mr. & Mrs. Johnson', party: 4 }],
  ['Dr & Mrs Ade & 2 kids', { name: 'Dr & Mrs Ade', party: 4 }],
  ['Tunde and Bisi', { name: 'Tunde and Bisi', party: 2 }],
  ['John Doe & wife', { name: 'John Doe & wife', party: 2 }],
  ['Tunde, Bisi and Kola', { name: 'Tunde, Bisi and Kola', party: 3 }],
  ['Johnson, Mr & Mrs', { name: 'Mr & Mrs Johnson', party: 2 }],
  ['The Bello family of 5 table 3', { name: 'The Bello family', party: 5, table: '3' }],
  ['Bello family x6', { name: 'Bello family', party: 6 }],
  ['The Adeyemi family', { name: 'The Adeyemi family', party: 2 }],
  ['1. Ada Obi', { name: 'Ada Obi', party: 1 }],
  ['12) Ada Obi', { name: 'Ada Obi', party: 1 }],
  ['3 Ada Obi', { name: 'Ada Obi', party: 1 }],
  ['- Ada Obi', { name: 'Ada Obi', party: 1 }],
  ['• Ada Obi', { name: 'Ada Obi', party: 1 }],
  ['1️⃣ Ada Obi', { name: 'Ada Obi', party: 1 }],
  ['*Ada Obi*', { name: 'Ada Obi', party: 1 }],
  ['Ada Obi 08012345678', { name: 'Ada Obi', contact: '08012345678' }],
  ['+234 801 234 5678 Ada Obi', { name: 'Ada Obi', contact: '+234 801 234 5678', party: 1 }],
  ['Ada Obi 3 08012345678', { name: 'Ada Obi', party: 3, contact: '08012345678' }],
  ['Ada Obi 08012345678 3', { name: 'Ada Obi', party: 3, contact: '08012345678' }],
  ['Ada Obi ada@example.com', { name: 'Ada Obi', contact: 'ada@example.com' }],
  ['Ada Obi table 12', { name: 'Ada Obi', table: '12' }],
  ['Ada Obi, table 12', { name: 'Ada Obi', table: '12' }],
  ['Ada Obi table: VIP', { name: 'Ada Obi', table: 'VIP' }],
  ['Constable Ade', { name: 'Constable Ade', table: '' }],
  ['Ada Obi (vegan)', { name: 'Ada Obi', note: 'vegan' }],
  ['Ada Obi nut allergy', { name: 'Ada Obi', note: 'nut allergy' }],
  ['Ada Obi #work-friends', { name: 'Ada Obi', group: 'Work Friends' }],
  ['✅ Ada Obi', { name: 'Ada Obi', status: 'coming' }],
  ['Ada Obi ❌', { name: 'Ada Obi', status: 'declined' }],
  ['Ada Obi - confirmed', { name: 'Ada Obi', status: 'coming' }],
  ['Ada Obi - yes', { name: 'Ada Obi', status: 'coming' }],
  ['Ada Obi - no', { name: 'Ada Obi', status: 'declined' }],
  ["Ada Obi can't come", { name: 'Ada Obi', status: 'declined' }],
  ['Ada Obi can’t make it', { name: 'Ada Obi', status: 'declined' }],
  ['Ada Obi, 3, table 2, 08012345678, vegan', { name: 'Ada Obi', party: 3, table: '2', contact: '08012345678', note: 'vegan' }],
  ['Adébáyọ̀ Ọláṣeun', { name: 'Adébáyọ̀ Ọláṣeun', party: 1 }],
  ['ọlá adéyẹmí', { name: 'Ọlá Adéyẹmí', party: 1 }],
  ["o'brien-smith", { name: "O'Brien-Smith", party: 1 }],
  ['McDonald', { name: 'McDonald', party: 1 }],
  ['Maria de la Cruz', { name: 'Maria de la Cruz', party: 1 }],
  ['HRH Oba Adewale', { name: 'HRH Oba Adewale', party: 1 }],
];

for (const [input, expected] of cases) {
  test(`reads: ${input}`, () => {
    const g = one(input);
    for (const [k, v] of Object.entries(expected)) assert.equal(g[k], v, `${k} of ${JSON.stringify(g)}`);
  });
}

test('comma list becomes separate invitations', () => {
  const out = parseInput('Ada Obi, Tunde Bakare +1, Mr & Mrs Johnson');
  assert.deepEqual(out.map((g) => [g.name, g.party]), [['Ada Obi', 1], ['Tunde Bakare', 2], ['Mr & Mrs Johnson', 2]]);
});

test('short comma list becomes separate invitations too', () => {
  assert.deepEqual(parseInput('Ada, Tunde, Bisi').map((g) => g.name), ['Ada', 'Tunde', 'Bisi']);
});

test('a WhatsApp list with sections', () => {
  const out = parseInput(`*Bride's family*
1. Ada Obi
2. Mr & Mrs Johnson ✅

Groom's friends:
3. Tunde Bakare +1
4. The Bello family of 4 ❌
Church
- Sister Ruth
---
12`);
  assert.deepEqual(
    out.map((g) => [g.name, g.party, g.group, g.status]),
    [
      ['Ada Obi', 1, "Bride's family", 'waiting'],
      ['Mr & Mrs Johnson', 2, "Bride's family", 'coming'],
      ['Tunde Bakare', 2, "Groom's friends", 'waiting'],
      ['The Bello family', 4, "Groom's friends", 'declined'],
      ['Sister Ruth', 1, 'Church', 'waiting'],
    ]
  );
});

test('a guest called Bello family is not a section heading', () => {
  const out = parseInput('Bello family\nAda Obi');
  assert.deepEqual(out.map((g) => [g.name, g.group]), [['Bello family', ''], ['Ada Obi', '']]);
});

test('one-line section prefix', () => {
  const out = parseInput('Work friends: Ada Obi, Tunde Bakare');
  assert.deepEqual(out.map((g) => [g.name, g.group]), [['Ada Obi', 'Work friends'], ['Tunde Bakare', 'Work friends']]);
});

test('spreadsheet paste with a header row', () => {
  const out = parseInput('Name\tGuests\tTable\tPhone\tRSVP\tSide\nAda Obi\t2\t4\t08012345678\tYes\tBride\nTunde Bakare\t\tTable 7\t\tNo\tGroom');
  assert.deepEqual(out[0], { name: 'Ada Obi', party: 2, table: '4', contact: '08012345678', group: 'Bride', note: '', status: 'coming' });
  assert.equal(out[1].table, '7');
  assert.equal(out[1].status, 'declined');
  assert.equal(out[1].party, 1);
});

test('spreadsheet paste with no header row', () => {
  const out = parseInput('Ada Obi\t3\t08012345678\nTunde Bakare\t1\tTable 4');
  assert.deepEqual(out.map((g) => [g.name, g.party, g.contact, g.table]), [['Ada Obi', 3, '08012345678', ''], ['Tunde Bakare', 1, '', '4']]);
});

test('CSV with a header row and quoted names', () => {
  const out = parseInput('Name,Party,Table\n"Johnson, Mr & Mrs",2,5\nAda Obi,1,6');
  assert.deepEqual(out.map((g) => [g.name, g.party, g.table]), [['Mr & Mrs Johnson', 2, '5'], ['Ada Obi', 1, '6']]);
});

test('rubbish produces nothing', () => {
  for (const text of ['', '   ', '12345', '---', '✅', '+2', '\n\n']) assert.deepEqual(parseInput(text), [], JSON.stringify(text));
});

test('markup in a name is kept as plain text', () => {
  assert.ok(one('<img src=x onerror=alert(1)>').name.includes('<img'));
});

test('very long values are clipped', () => {
  assert.ok(one('A'.repeat(500)).name.length <= 120);
});

test('headcount never leaves 1..99', () => {
  assert.equal(one('Ada Obi x0').party, 1);
  assert.equal(one('Ada Obi x99 +50').party, 99);
});

test('duplicate keys ignore order, accents and titles', () => {
  assert.equal(strictKey('Bakare, Tunde'), strictKey('tunde bakaré'));
  assert.equal(strictKey('Adébáyọ̀ Ọlá'), strictKey('adebayo ola'));
  assert.notEqual(strictKey('Mr Johnson'), strictKey('Mrs Johnson'));
  assert.equal(looseKey('Mr & Mrs Johnson'), looseKey('Mr Johnson'));
});

test('spots probable duplicates without crying wolf', () => {
  const list = [{ id: 'a', name: 'Tunde Bakare' }, { id: 'b', name: 'Mr & Mrs Johnson' }, { id: 'c', name: 'Ada' }];
  assert.equal(findSimilar('Tunde Bakere', list)?.id, 'a');
  assert.equal(findSimilar('bakare tunde', list)?.id, 'a');
  assert.equal(findSimilar('Mrs Johnson', list)?.id, 'b');
  assert.equal(findSimilar('Kola Bakare', list), null);
  assert.equal(findSimilar('Ade', list), null);
  assert.equal(findSimilar('Tunde Bakare', list, 'a'), null);
});

test('files under the name, not the title', () => {
  assert.ok(sortKey('Mr & Mrs Johnson') > sortKey('Ada Obi'));
  assert.ok(sortKey('Mr & Mrs Johnson') < sortKey('Tunde Bakare'));
});

test('search finds guests without needing accents', () => {
  assert.ok(matchesQuery({ name: 'Adébáyọ̀ Ọlá' }, 'adebayo'));
  assert.ok(!matchesQuery({ name: 'Ada Obi' }, 'tunde'));
});

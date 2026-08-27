// Runnable check for getHistoryStatuses: extracts the real source out of
// dashboard.tsx (no copy-paste drift) and asserts chronological correctness.
// Run: node scripts/check-history-blocks.js
const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync(require('path').join(__dirname, '../app/(app)/studyos/dashboard.tsx'), 'utf8');
const start = src.indexOf('const MONTHS');
const end = src.indexOf('function getCurrentDay');
assert(start > -1 && end > start, 'could not locate functions in dashboard.tsx');
const code = src.slice(start, end)
  .replace(/const MONTHS:[^=]*=/, 'const MONTHS =')  // drop Record<string, number>
  .replace(/\?:\s*[A-Za-z\[\]]+/g, '')               // optional params: `records?: any[]`
  .replace(/:\s*any\[\]/g, '')                       // `let ordered: any[]`
  .replace(/:\s*any\b/g, '')                         // `(r: any)`
  .replace(/:\s*string\b/g, '');                     // `(d: string)`
const getHistoryStatuses = new Function(code + '\nreturn getHistoryStatuses;')();

const P = { status: 'Present' }, A = { status: 'Absent' };
const d = (s, r) => ({ date: s, ...r });
const types = (recs) => getHistoryStatuses(recs).map((h) => h.type);

// 1. No records -> no fake blocks (the whole point of the original fix)
assert.deepStrictEqual(getHistoryStatuses(undefined), []);
assert.deepStrictEqual(getHistoryStatuses([]), []);

// 2. THE BUG: portal sends newest-first. Must show the 5 NEWEST (03..07),
//    oldest->newest — NOT the first 5 rows and NOT the 5 oldest (01,02).
assert.deepStrictEqual(
  types([
    d('07/08/2026', P), d('06/08/2026', A), d('05/08/2026', P),
    d('04/08/2026', P), d('03/08/2026', A), d('02/08/2026', P),
    d('01/08/2026', P),
  ]),
  ['A', 'P', 'P', 'A', 'P']
);

// 3. Same data ascending -> identical output (order-independent)
assert.deepStrictEqual(
  types([
    d('01/08/2026', P), d('02/08/2026', P), d('03/08/2026', A),
    d('04/08/2026', P), d('05/08/2026', P), d('06/08/2026', A),
    d('07/08/2026', P),
  ]),
  ['A', 'P', 'P', 'A', 'P']
);

// 4. Newest record is always the LAST block
assert.strictEqual(types([d('01/08/2026', P), d('09/08/2026', A)]).pop(), 'A');
assert.strictEqual(types([d('09/08/2026', A), d('01/08/2026', P)]).pop(), 'A');

// 5. Date formats the portal may emit
assert.deepStrictEqual(types([d('09-08-2026', A), d('01-08-2026', P)]), ['P', 'A']);
assert.deepStrictEqual(types([d('2026-08-09', A), d('2026-08-01', P)]), ['P', 'A']);
assert.deepStrictEqual(types([d('09 Aug 2026', A), d('01 Aug 2026', P)]), ['P', 'A']);
assert.deepStrictEqual(types([d('Aug 09 2026', A), d('Aug 01 2026', P)]), ['P', 'A']);
assert.deepStrictEqual(types([d('09/08/26', A), d('01/08/26', P)]), ['P', 'A']);

// 6. dd/mm not mm/dd: 03/01 is 3 Jan, so it precedes 01/02 (1 Feb)
assert.deepStrictEqual(types([d('01/02/2026', A), d('03/01/2026', P)]), ['P', 'A']);

// 7. Same day, two classes -> time breaks the tie
assert.deepStrictEqual(
  types([
    { date: '05/08/2026', time: '14:00-15:00', status: 'Absent' },
    { date: '05/08/2026', time: '09:00-10:00', status: 'Present' },
  ]),
  ['P', 'A']
);

// 8. Unparseable dates: portal is newest-first, so head 5 flipped oldest->newest
assert.deepStrictEqual(
  types([{ status: 'Absent' }, { status: 'Present' }, { status: 'Present' }]),
  ['P', 'P', 'A']
);

// 9. Status variants
assert.strictEqual(types([d('01/08/2026', { status: 'Duty Leave' })])[0], 'DL');
assert.strictEqual(types([d('01/08/2026', { status: 'Medical Leave' })])[0], 'ML');
assert.strictEqual(types([d('01/08/2026', { status: 'A' })])[0], 'A');

// 10. Garbage dates mixed with real ones: real dates still drive the order
assert.deepStrictEqual(
  types([d('N/A', A), d('07/08/2026', A), d('01/08/2026', P)]),
  ['P', 'A']
);

console.log('OK: newest 5 classes, oldest->newest, real data only');

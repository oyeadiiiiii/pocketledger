// Applies the update. Safe to run more than once. Fails loudly if expected text is missing.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const block = (n) => fs.readFileSync(path.join(__dirname, 'v2', n), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;

function edit(rel, fn) {
  const file = path.join(root, rel);
  const before = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const after = fn(before);
  if (after !== before) { fs.writeFileSync(file, after); console.log('patched   ' + rel); }
  else console.log('unchanged ' + rel);
}

// pairs: [from, to, optional]
function rep(rel, pairs) {
  edit(rel, (text) => {
    for (const [from, to, optional] of pairs) {
      if (to && text.includes(to)) continue;
      if (!text.includes(from)) {
        if (!to || optional) continue;
        console.error('NOT FOUND in ' + rel + ':\n  ' + from.split('\n')[0] + '\n');
        failures++;
        continue;
      }
      text = text.split(from).join(to);
    }
    return text;
  });
}

function insertBefore(rel, anchor, marker, content) {
  edit(rel, (text) => {
    if (text.includes(marker)) return text;
    if (!text.includes(anchor)) { console.error('NOT FOUND in ' + rel + ': ' + anchor); failures++; return text; }
    return text.replace(anchor, () => content + anchor);
  });
}

function removeBetween(rel, start, end) {
  edit(rel, (text) => {
    const a = text.indexOf(start);
    if (a < 0) return text;
    const b = text.indexOf(end, a);
    if (b < 0) { console.error('NOT FOUND in ' + rel + ': ' + end); failures++; return text; }
    return text.slice(0, a) + text.slice(b);
  });
}

// ---- spreadsheet import: income/loan rows + Salary Credit cells beside the table ----
insertBefore('src/lib/csv.ts', 'function parseLegacy(', 'export function classifyLegacyRow', block('csv-classify.txt'));
insertBefore('src/lib/csv.ts', 'function parseLegacy(', 'function parseSummaryCells', block('csv-summary.txt'));
rep('src/lib/csv.ts', [
  [block('csv-mode-from.txt'), block('csv-mode-to.txt')],
  ["    if (r.every((c) => !c.trim())) return;\n    const get = (k: LegacyKey)",
   "    if (LEGACY_KEYS.every((k) => idx[k] < 0 || !(r[idx[k]] ?? '').trim())) return;\n    const get = (k: LegacyKey)"],
  ["  return { format: 'legacy', rows: parseLegacy(table, idx, ctx.knownCategories) };",
   "  const legacyRows = parseLegacy(table, idx, ctx.knownCategories);\n  return { format: 'legacy', rows: [...legacyRows, ...parseSummaryCells(table, idx, legacyRows)] };"],
]);

// ---- investments count as expenses ----
rep('src/db/repo.ts', [
  ['  const expenses = t.expense - t.refund;', '  const expenses = t.expense + t.investment - t.refund; // investments count as spending'],
  ['    grossExpenses: t.expense,', '    grossExpenses: t.expense + t.investment,'],
  ["SUM(CASE WHEN t.type = 'expense' THEN t.amount_paise ELSE -t.amount_paise END)", "SUM(CASE WHEN t.type IN ('expense', 'investment') THEN t.amount_paise ELSE -t.amount_paise END)"],
  ["t.type IN ('expense', 'refund')", "t.type IN ('expense', 'investment', 'refund')"],
]);

// ---- "Salary Credit" SMS wording ----
rep('src/lib/smsParser.ts', [[
  String.raw`const CREDIT_RE = /\b(credited|received|deposited|added\s+to|refund(?:ed)?|revers(?:al|ed)|cashback)\b/i;`,
  String.raw`const CREDIT_RE = /\b(credited|received|deposited|added\s+to|refund(?:ed)?|revers(?:al|ed)|cashback|credit(?!\s*(?:card|limit|score|line)))\b/i;`,
]]);

// ---- screens ----
rep('app/review/[id].tsx', [
  ['      dateText: ymdToDMY(p.occurred_at.slice(0, 10)),\n      timeText: p.occurred_at.slice(11, 16),', '      occurredAt: p.occurred_at,'],
  ["import { ymdToDMY } from '../../src/lib/dates';\n", ''],
]);
removeBetween('app/(tabs)/settings.tsx', 'function AccountEditor(', 'const s = StyleSheet.create({');
rep('app/(tabs)/settings.tsx', [
  ["import { Card, Field, PrimaryButton, Screen, SectionLabel, Segmented, errorMessage } from '../../src/components/ui';",
   "import { Card, Field, PrimaryButton, Screen, SectionLabel, Segmented, errorMessage } from '../../src/components/ui';\nimport { AccountEditor } from '../../src/components/AccountEditor';"],
  ['Leave the date blank to count everything.', 'Turn on Count all history to include everything.', true],
]);
rep('app/(tabs)/index.tsx', [[
  'hint={d.s.refunds ? `after ${formatCompactINR(d.s.refunds)} refunds` : undefined}',
  'hint={d.s.investments ? `incl. ${formatCompactINR(d.s.investments)} invested` : d.s.refunds ? `after ${formatCompactINR(d.s.refunds)} refunds` : undefined}',
]]);
rep('app/(tabs)/analytics.tsx', [[
  'Savings = salary/income − expenses. Borrowed money is not income, and investments are shown separately.',
  'Savings = salary/income − expenses. Expenses include investments; borrowed money is not income.',
]]);
rep('app/import.tsx', [
  ['  const toggleRow = (line: number) =>\n    setPreview((p) => p && { ...p, rows: p.rows.map((r) => (r.line === line && !r.errors.length ? { ...r, include: !r.include } : r)) });',
   '  const toggleRow = (index: number) =>\n    setPreview((p) => p && { ...p, rows: p.rows.map((r, i) => (i === index && !r.errors.length ? { ...r, include: !r.include } : r)) });'],
  ['keyExtractor={(r) => String(r.line)}', "keyExtractor={(r, i) => String(r.line) + '-' + i}"],
  ['renderItem={({ item }) => <PreviewRow row={item} onToggle={() => toggleRow(item.line)} />}',
   'renderItem={({ item, index }) => <PreviewRow row={item} onToggle={() => toggleRow(index)} />}'],
]);

// ---- tests ----
rep('__tests__/db.test.ts', [
  ["expect(repo.monthSummary(db, '2026-07')).toMatchObject({ expenses: 65000, investments: 200000 });", "expect(repo.monthSummary(db, '2026-07')).toMatchObject({ expenses: 265000, investments: 200000 });"],
  ["expect(repo.modeSplit(db, '2026-07')).toEqual({ cash: 65000, online: 0 });", "expect(repo.modeSplit(db, '2026-07')).toEqual({ cash: 65000, online: 200000 });"],
]);
rep('__tests__/smsParser.test.ts', [[
  "  test('VPA merchant and UPI reference', () => {",
  [
    "  test('\"Salary Credit\" wording is a credit', () => {",
    "    const r = tx('SALARY CREDIT of INR 21,000.00 to your A/c XX5678 on 01-10-2026');",
    "    expect(r).toMatchObject({ direction: 'credit', suggestedType: 'income', suggestedCategory: 'Salary', amountPaise: 2100000 });",
    '  });',
    '',
    "  test('VPA merchant and UPI reference', () => {",
  ].join('\n'),
]]);
edit('__tests__/csv.test.ts', (text) => {
  if (text.includes('income and loan rows in the spreadsheet')) return text;
  return text + [
    '',
    "describe('income and loan rows in the spreadsheet', () => {",
    '  const csv = [',
    "    'Title,Date,Use,Amount,Mode,Remark',",
    "    'Salary Credit,01/05/2026,,\"₹21,000.00\",,',",
    "    'Loan Taken,02/04/2026,,\"₹10,000.00\",Online,',",
    "    'Loan Repaid,03/05/2026,,\"₹10,000.00\",Online,',",
    "    'Coffee,04/05/2026,Food,₹60.00,Online,',",
    "  ].join('\\n');",
    '  const rows = parseImportTable(parseCsv(csv), { knownCategories: known })?.rows ?? [];',
    "  test('salary is income, loans are loans', () => {",
    "    expect(rows.map((r) => r.type)).toEqual(['income', 'loan_taken', 'loan_repaid', 'expense']);",
    "    expect(rows[0]).toMatchObject({ categoryName: 'Salary', accountKind: 'online', errors: [] });",
    '    expect(rows[1].categoryName).toBeNull();',
    '    expect(rows.every((r) => r.include)).toBe(true);',
    '  });',
    '});',
    '',
  ].join('\n');
});

if (failures) {
  console.error(failures + ' edit(s) failed. Paste this output for help.');
  process.exit(1);
}
console.log('All edits applied.');
import { describe, expect, test } from '@jest/globals';
import { buildBackupCsv, parseCsv, parseImportTable, type ExportTx } from '../src/lib/csv';
import { DEFAULT_CATEGORIES } from '../src/db/schema';
import { LEGACY_CSV } from './testDb';

const known = DEFAULT_CATEGORIES.map((c) => c.name);

describe('parseCsv', () => {
  test('quoted fields, commas and escaped quotes', () => {
    expect(parseCsv('a,"b,c","d ""q"""\r\n')).toEqual([['a', 'b,c', 'd "q"']]);
  });
  test('unterminated quote throws', () => {
    expect(() => parseCsv('a,"broken\n')).toThrow();
  });
  test('tab-separated paste from a spreadsheet', () => {
    const parsed = parseImportTable(parseCsv('Title\tDate\tUse\tAmount\tMode\tRemark\nTea\t01/10/2026\tFood\t₹20.00\tCash\t'), { knownCategories: known });
    expect(parsed?.rows[0]).toMatchObject({ title: 'Tea', amountPaise: 2000, accountKind: 'cash', errors: [] });
  });
});

describe('your spreadsheet format', () => {
  const parsed = parseImportTable(parseCsv(LEGACY_CSV), { knownCategories: known });

  test('all 20 example rows are valid', () => {
    expect(parsed?.format).toBe('legacy');
    expect(parsed?.rows).toHaveLength(20);
    expect(parsed?.rows.filter((r) => r.errors.length)).toEqual([]);
    expect(parsed?.rows.every((r) => r.warnings.length === 0)).toBe(true);
  });

  test('exact totals in paise', () => {
    const rows = parsed?.rows ?? [];
    expect(rows.reduce((s, r) => s + r.amountPaise, 0)).toBe(2021787);
    const invest = rows.filter((r) => r.categoryName === 'Invest');
    expect(invest).toHaveLength(4);
    expect(invest.every((r) => r.type === 'expense')).toBe(true);
    expect(invest.reduce((s, r) => s + r.amountPaise, 0)).toBe(600000);
  });

  test('grouped by actual date, not by tab name', () => {
    const byMonth: Record<string, number> = {};
    for (const r of parsed?.rows ?? []) byMonth[r.occurredAt.slice(0, 7)] = (byMonth[r.occurredAt.slice(0, 7)] ?? 0) + 1;
    expect(byMonth).toEqual({ '2026-04': 4, '2026-05': 3, '2026-06': 2, '2026-07': 4, '2026-08': 3, '2026-09': 4 });
  });

  test('field details preserved', () => {
    const rows = parsed?.rows ?? [];
    expect(rows.find((r) => r.title === 'Clothes')).toMatchObject({ remark: '200,150', accountKind: 'cash', amountPaise: 35000 });
    expect(rows.find((r) => r.title === 'Slice')?.amountPaise).toBe(14928);
    expect(rows.find((r) => r.title === 'Samosa')?.amountPaise).toBe(9003);
    expect(rows.filter((r) => r.accountKind === 'cash').map((r) => r.title)).toEqual(['Auto', 'Clothes', 'Doctor']);
  });
});

describe('validation', () => {
  const csv = [
    'Title,Date,Use,Amount,Mode,Remark',
    'A,31/02/2026,Food,₹10,Online,',
    'B,01/03/2026,Food,-₹50,Online,',
    'C,01/03/2026,Food,₹10,Card,',
    'D,01/03/2026,Food,₹10,Barter,',
    'Total,01/03/2026,Food,₹10,Online,',
    ',,,,,',
    'E,01/03/2026,Pets,₹10,Online,',
  ].join('\n');
  const rows = parseImportTable(parseCsv(csv), { knownCategories: known })?.rows ?? [];

  test('bad rows are reported, not imported', () => {
    expect(rows).toHaveLength(6);
    expect(rows[0].errors[0]).toMatch(/Invalid date/);
    expect(rows[1].errors[0]).toMatch(/greater than/);
    expect(rows[2].errors).toEqual([]);
    expect(rows[2].warnings[0]).toMatch(/treated as Online/);
    expect(rows[3].errors[0]).toMatch(/Unknown mode/);
    expect(rows[4].errors[0]).toMatch(/summary row/);
    expect(rows[5].warnings[0]).toMatch(/New category "Pets"/);
    expect(rows.filter((r) => r.include).map((r) => r.title)).toEqual(['C', 'E']);
  });
});

describe('backup round trip', () => {
  const rows: ExportTx[] = [
    {
      id: 'tx-1', type: 'expense', title: '=HYPERLINK("x")', occurred_at: '2026-07-03T18:05', category_name: 'Shopping',
      account_kind: 'cash', to_account_kind: null, amount_paise: 35000, remark: '200,150', source: 'manual', created_at: '2026-07-03T12:35:00.000Z',
    },
    {
      id: 'tx-2', type: 'transfer', title: 'ATM withdrawal', occurred_at: '2026-07-04T10:00', category_name: null,
      account_kind: 'online', to_account_kind: 'cash', amount_paise: 200000, remark: null, source: 'sms', created_at: '2026-07-04T04:30:00.000Z',
    },
  ];
  const csv = buildBackupCsv(rows);

  test('formula injection is neutralised in the file', () => {
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  test('restores identical values', () => {
    const parsed = parseImportTable(parseCsv(csv), { knownCategories: known });
    expect(parsed?.format).toBe('backup');
    expect(parsed?.rows[0]).toMatchObject({
      id: 'tx-1', title: '=HYPERLINK("x")', remark: '200,150', amountPaise: 35000, occurredAt: '2026-07-03T18:05', accountKind: 'cash', errors: [],
    });
    expect(parsed?.rows[1]).toMatchObject({ type: 'transfer', accountKind: 'online', toAccountKind: 'cash', categoryName: null, errors: [] });
  });
});
describe('income and loan rows in the spreadsheet', () => {
  const csv = [
    'Title,Date,Use,Amount,Mode,Remark',
    'Salary Credit,01/05/2026,,"₹21,000.00",,',
    'Loan Taken,02/04/2026,,"₹10,000.00",Online,',
    'Loan Repaid,03/05/2026,,"₹10,000.00",Online,',
    'Coffee,04/05/2026,Food,₹60.00,Online,',
  ].join('\n');
  const rows = parseImportTable(parseCsv(csv), { knownCategories: known })?.rows ?? [];
  test('salary is income, loans are loans', () => {
    expect(rows.map((r) => r.type)).toEqual(['income', 'loan_taken', 'loan_repaid', 'expense']);
    expect(rows[0]).toMatchObject({ categoryName: 'Salary', accountKind: 'online', errors: [] });
    expect(rows[1].categoryName).toBeNull();
    expect(rows.every((r) => r.include)).toBe(true);
  });
});

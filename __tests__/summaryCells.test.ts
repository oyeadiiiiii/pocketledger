import { describe, expect, test } from '@jest/globals';
import { parseCsv, parseImportTable } from '../src/lib/csv';
import { DEFAULT_CATEGORIES } from '../src/db/schema';

const known = DEFAULT_CATEGORIES.map((c) => c.name);

// Same shape as your "March" tab: table in A-F, summary block in H-L.
const TAB = [
  'Title,Date,Use,Amount,Mode,Remark,,,,,,',
  'Haircut,19/04/2026,Misc.,₹70.00,Online,,,,,,,',
  'Paint,19/04/2026,Home,₹175.00,Online,,,,Had,Used,Left,',
  'Auto,20/04/2026,Transport,₹80.00,Cash,,,Cash,"₹4,510.00","₹3,610.00",₹900.00,',
  'Order Payment,20/04/2026,Misc.,₹14.00,Online,,,Online,"₹18,748.43","₹18,444.80",₹303.63,',
  'Auto,21/04/2026,Transport,₹80.00,Cash,,,Total,"₹23,258.43","₹22,054.80","₹1,203.63",',
  'Ice-cream,21/04/2026,Food,₹78.00,Online,,,,,,,',
  'Auto,22/04/2026,Transport,₹80.00,Cash,,,IN,"₹19,677.00",,Salary Credit,"₹9,677.00"',
  'Coffee,22/04/2026,Food,₹60.00,Online,,,Save,"-₹2,377.80",,Loan Taken,"₹10,000.00"',
  'Auto,23/04/2026,Transport,₹90.00,Cash,,,,,,,',
  'smart bazar,23/04/2026,Food,₹17.80,Online,,,Total Expense,"₹22,054.80",,,',
  ',,,,,,,Petrol,₹190.00,,,',
].join('\n');

describe('summary cells beside the table', () => {
  const rows = parseImportTable(parseCsv(TAB), { knownCategories: known })?.rows ?? [];

  test('all 10 transactions import normally', () => {
    const tx = rows.filter((r) => r.type === 'expense');
    expect(tx).toHaveLength(10);
    expect(tx.every((r) => r.errors.length === 0)).toBe(true);
  });

  test('Salary Credit and Loan Taken are picked up; calculated cells are not', () => {
    expect(rows).toHaveLength(12);
    const extra = rows.filter((r) => r.type !== 'expense');
    expect(extra.map((r) => [r.type, r.title, r.amountPaise, r.occurredAt, r.categoryName])).toEqual([
      ['income', 'Salary Credit', 967700, '2026-04-19T09:00', 'Salary'],
      ['loan_taken', 'Loan Taken', 1000000, '2026-04-19T09:00', null],
    ]);
    expect(extra.every((r) => r.include)).toBe(true);
  });

  test('rows with only side cells are not reported as broken', () => {
    expect(rows.filter((r) => r.errors.length)).toEqual([]);
  });
});
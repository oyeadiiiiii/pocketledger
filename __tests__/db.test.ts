import { describe, expect, test } from '@jest/globals';
import { createTestDb, LEGACY_CSV } from './testDb';
import * as repo from '../src/db/repo';
import { migrate } from '../src/db/schema';
import { buildBackupCsv } from '../src/lib/csv';
import type { SqlDriver } from '../src/db/driver';
import type { TxInput } from '../src/lib/validation';

const DEBIT_SMS = 'Rs.450.00 debited from A/c XX1234 on 11-10-2026 at 14:35. Info: UPI/SWIGGY.';
const CREDIT_SMS = 'Your account XX5678 has been credited with INR 21000.00 via NEFT.';
const NOW = new Date(2026, 9, 11, 14, 40);

const count = (db: SqlDriver, table: string): number => db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? -1;

function inputFromPending(db: SqlDriver, id: string): TxInput {
  const p = repo.getPending(db, id);
  if (!p) throw new Error('pending not found');
  return {
    type: p.suggested_type, amountPaise: p.amount_paise ?? 0, title: p.merchant, occurredAt: p.occurred_at,
    categoryId: p.category_id, accountId: p.account_id, toAccountId: null, remark: null,
  };
}

const base = { categoryId: null as string | null, accountId: 'acc_online', toAccountId: null as string | null, remark: null as string | null };

describe('schema', () => {
  test('creates tables and seeds your categories and accounts', async () => {
    const db = await createTestDb();
    expect(db.first<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(1);
    const names = repo.listCategories(db).map((c) => c.name);
    for (const n of ['Transport', 'Food', 'Home', 'Shopping', 'Bills', 'Gifts', 'Essentials', 'Stationary', 'Misc.', 'Education', 'Groceries', 'Medicine', 'Petrol', 'Invest', 'rustNroses']) {
      expect(names).toContain(n);
    }
    expect(repo.listAccounts(db).map((a) => a.kind)).toEqual(['cash', 'online']);
  });

  test('migrations are idempotent', async () => {
    const db = await createTestDb();
    migrate(db);
    expect(count(db, 'categories')).toBe(17);
  });

  test('foreign keys are enforced', async () => {
    const db = await createTestDb();
    expect(() => repo.insertTransaction(db, { ...base, type: 'expense', amountPaise: 100, title: 'X', occurredAt: '2026-10-01T10:00', categoryId: 'missing' })).toThrow();
  });

  test('validation rejects zero amounts and bad dates', async () => {
    const db = await createTestDb();
    expect(() => repo.insertTransaction(db, { ...base, type: 'expense', amountPaise: 0, title: 'X', occurredAt: '2026-10-01T10:00', categoryId: 'cat_food' })).toThrow(/greater than/);
    expect(() => repo.insertTransaction(db, { ...base, type: 'expense', amountPaise: 100, title: 'X', occurredAt: '2026-02-30T10:00', categoryId: 'cat_food' })).toThrow(/valid date/);
  });
});

describe('SMS → Pending Review → ledger', () => {
  test('confirming adds the transaction exactly once', async () => {
    const db = await createTestDb();
    const res = repo.ingestSms(db, DEBIT_SMS, NOW);
    expect(res.status).toBe('created');
    if (res.status !== 'created') return;
    const p = repo.getPending(db, res.pendingId);
    expect(p).toMatchObject({ amount_paise: 45000, category_id: 'cat_food', status: 'pending', merchant: 'SWIGGY' });
    expect(count(db, 'transactions')).toBe(0);

    const input = inputFromPending(db, res.pendingId);
    repo.confirmPending(db, res.pendingId, input);
    expect(() => repo.confirmPending(db, res.pendingId, input)).toThrow(/already confirmed/);
    expect(count(db, 'transactions')).toBe(1);
    expect(repo.countPending(db)).toBe(0);
    expect(repo.accountBalances(db).find((a) => a.kind === 'online')?.balance_paise).toBe(-45000);
  });

  test('a failed confirm rolls back completely', async () => {
    const db = await createTestDb();
    const res = repo.ingestSms(db, DEBIT_SMS, NOW);
    if (res.status !== 'created') throw new Error('not created');
    expect(() => repo.confirmPending(db, res.pendingId, { ...inputFromPending(db, res.pendingId), amountPaise: 0 })).toThrow();
    expect(repo.getPending(db, res.pendingId)?.status).toBe('pending');
    expect(count(db, 'transactions')).toBe(0);
  });

  test('the same SMS twice is a duplicate', async () => {
    const db = await createTestDb();
    repo.ingestSms(db, DEBIT_SMS, NOW);
    expect(repo.ingestSms(db, DEBIT_SMS, NOW)).toMatchObject({ status: 'duplicate', reason: 'same_message' });
    expect(count(db, 'pending_transactions')).toBe(1);
  });

  test('a second alert for the same payment is flagged as a possible duplicate', async () => {
    const db = await createTestDb();
    repo.ingestSms(db, DEBIT_SMS, NOW);
    const second = repo.ingestSms(db, 'Sent Rs.450.00 from A/c XX1234 to swiggy@icici on 11-10-26 14:37', NOW);
    expect(second.status).toBe('created');
    if (second.status === 'created') expect(second.possibleDuplicateOf).not.toBeNull();
  });

  test('OTP messages are never stored', async () => {
    const db = await createTestDb();
    expect(repo.ingestSms(db, 'Your OTP is 492817 for Rs 1000.', NOW)).toEqual({ status: 'ignored', reason: 'otp' });
    expect(count(db, 'pending_transactions')).toBe(0);
  });

  test('ignored alerts never affect balances and their text is discarded', async () => {
    const db = await createTestDb();
    const res = repo.ingestSms(db, CREDIT_SMS, NOW);
    if (res.status !== 'created') throw new Error('not created');
    repo.ignorePending(db, res.pendingId);
    expect(repo.accountBalances(db).every((a) => a.balance_paise === 0)).toBe(true);
    expect(repo.getPending(db, res.pendingId)).toMatchObject({ status: 'ignored', sms_preview: null });
    expect(repo.ingestSms(db, CREDIT_SMS, NOW).status).toBe('duplicate');
  });
});

describe('accounting rules', () => {
  test('salary is income; borrowed money is not', async () => {
    const db = await createTestDb();
    repo.insertTransaction(db, { ...base, type: 'income', amountPaise: 967700, title: 'Salary Credit', occurredAt: '2026-04-01T10:00', categoryId: 'cat_salary' });
    repo.insertTransaction(db, { ...base, type: 'loan_taken', amountPaise: 1000000, title: 'Loan Taken', occurredAt: '2026-04-02T10:00' });
    repo.insertTransaction(db, { ...base, type: 'expense', amountPaise: 500000, title: 'Rent', occurredAt: '2026-04-03T10:00', categoryId: 'cat_home' });

    const s = repo.monthSummary(db, '2026-04');
    expect(s).toMatchObject({ income: 967700, loanTaken: 1000000, expenses: 500000, savings: 467700 });
    expect(repo.loanStatus(db).outstanding).toBe(1000000);

    repo.insertTransaction(db, { ...base, type: 'loan_repaid', amountPaise: 1000000, title: 'Loan Repaid', occurredAt: '2026-05-01T10:00' });
    expect(repo.loanStatus(db).outstanding).toBe(0);
    expect(repo.monthSummary(db, '2026-05').expenses).toBe(0);
    expect(repo.accountBalances(db).find((a) => a.kind === 'online')?.balance_paise).toBe(967700 + 1000000 - 500000 - 1000000);
  });

  test('transfers move money between accounts without being spending', async () => {
    const db = await createTestDb();
    repo.insertTransaction(db, { ...base, type: 'transfer', amountPaise: 200000, title: 'ATM', occurredAt: '2026-10-01T10:00', toAccountId: 'acc_cash' });
    const b = repo.accountBalances(db);
    expect(b.find((a) => a.kind === 'online')?.balance_paise).toBe(-200000);
    expect(b.find((a) => a.kind === 'cash')?.balance_paise).toBe(200000);
    expect(repo.monthSummary(db, '2026-10').expenses).toBe(0);
  });
});

describe('CSV import', () => {
  test('imports your spreadsheet rows by real month and blocks re-imports', async () => {
    const db = await createTestDb();
    const preview = repo.previewImport(db, LEGACY_CSV);
    expect(preview.rows.filter((r) => r.include)).toHaveLength(20);
    expect(repo.commitImport(db, preview, 'sheet.csv').imported).toBe(20);

    expect(repo.monthSummary(db, '2026-04').expenses).toBe(38500);
    expect(repo.monthSummary(db, '2026-05').expenses).toBe(965900);
    expect(repo.monthSummary(db, '2026-07')).toMatchObject({ expenses: 65000, investments: 200000 });
    expect(repo.modeSplit(db, '2026-07')).toEqual({ cash: 65000, online: 0 });
    expect(repo.investmentTotals(db, '2026-09')).toEqual({ month: 200000, allTime: 600000 });

    const again = repo.previewImport(db, LEGACY_CSV);
    expect(again.previouslyImportedAt).not.toBeNull();
    expect(again.rows.every((r) => r.duplicate && !r.include)).toBe(true);
  });

  test('opening balance "as of" date keeps old history out of the balance', async () => {
    const db = await createTestDb();
    repo.commitImport(db, repo.previewImport(db, LEGACY_CSV), null);
    repo.updateAccountOpening(db, 'acc_cash', 451000, '2026-04-01T00:00');
    expect(repo.accountBalances(db).find((a) => a.kind === 'cash')?.balance_paise).toBe(451000 - 73000);
    repo.updateAccountOpening(db, 'acc_cash', 451000, '2026-10-01T00:00');
    expect(repo.accountBalances(db).find((a) => a.kind === 'cash')?.balance_paise).toBe(451000);
  });

  test('backup restore reproduces data and never overwrites', async () => {
    const source = await createTestDb();
    repo.commitImport(source, repo.previewImport(source, LEGACY_CSV), null);
    const csv = buildBackupCsv(repo.exportRows(source));

    const target = await createTestDb();
    expect(repo.commitImport(target, repo.previewImport(target, csv), 'backup.csv').imported).toBe(20);
    expect(repo.monthSummary(target, '2026-07')).toEqual(repo.monthSummary(source, '2026-07'));

    const again = repo.previewImport(target, csv);
    expect(repo.commitImport(target, again, 'backup.csv').imported).toBe(0);
    expect(count(target, 'transactions')).toBe(20);
  });
});

describe('categories', () => {
  test('merge keeps every transaction', async () => {
    const db = await createTestDb();
    repo.insertTransaction(db, { ...base, type: 'expense', amountPaise: 2500, title: 'Pens', occurredAt: '2026-10-01T10:00', categoryId: 'cat_stationary' });
    repo.mergeCategories(db, 'cat_stationary', 'cat_essentials');
    expect(repo.listTransactions(db)[0].category_id).toBe('cat_essentials');
    expect(repo.listCategories(db).map((c) => c.name)).not.toContain('Stationary');
    expect(count(db, 'transactions')).toBe(1);
  });

  test('a used category cannot be deleted without reassignment', async () => {
    const db = await createTestDb();
    repo.insertTransaction(db, { ...base, type: 'expense', amountPaise: 6000, title: 'Coffee', occurredAt: '2026-10-01T10:00', categoryId: 'cat_food' });
    expect(() => repo.deleteCategory(db, 'cat_food', null)).toThrow(/Choose a category/);
    expect(() => db.run("DELETE FROM categories WHERE id = 'cat_food'")).toThrow();
    repo.deleteCategory(db, 'cat_food', 'cat_misc');
    expect(repo.listTransactions(db)[0].category_name).toBe('Misc.');
  });

  test('rename and duplicate-name protection', async () => {
    const db = await createTestDb();
    repo.renameCategory(db, 'cat_misc', 'Miscellaneous');
    expect(repo.categoryIdByName(db, 'miscellaneous')).toBe('cat_misc');
    expect(() => repo.renameCategory(db, 'cat_misc', 'food')).toThrow(/already exists/);
    expect(() => repo.addCategory(db, 'FOOD')).toThrow(/already exists/);
  });
});
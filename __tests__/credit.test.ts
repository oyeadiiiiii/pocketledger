import { describe, expect, test } from '@jest/globals';
import { createTestDb } from './testDb';
import * as repo from '../src/db/repo';

describe('credit-card accounting', () => {
  test('credit purchases accrue without touching cash/online; repayments reduce both the account and the owed balance', async () => {
    const db = await createTestDb();
    const cash = repo.accountIdByKind(db, 'cash');
    const online = repo.accountIdByKind(db, 'online');
    const food = db.first<{ id: string }>(`SELECT id FROM categories WHERE name = 'Food'`)!.id;

    repo.insertTransaction(db, {
      type: 'credit', amountPaise: 120000, title: 'Flipkart', occurredAt: '2026-09-03T12:00',
      categoryId: food, accountId: online, toAccountId: null, remark: null,
    });
    expect(repo.creditOwed(db)).toBe(120000);
    const before = new Map(repo.accountBalances(db).map((a) => [a.kind, a.balance_paise] as const));
    expect(before.get('cash')).toBe(0);
    expect(before.get('online')).toBe(0);

    repo.insertTransaction(db, {
      type: 'credit_repaid', amountPaise: 50000, title: 'Card bill', occurredAt: '2026-09-04T12:00',
      categoryId: null, accountId: online, toAccountId: null, remark: null,
    });
    expect(repo.creditOwed(db)).toBe(70000);
    expect(new Map(repo.accountBalances(db).map((a) => [a.kind, a.balance_paise] as const)).get('online')).toBe(-50000);
    expect(cash).toBeTruthy();
  });

  test('home month summary exposes credit purchases, credit repayments, and savings including credit', async () => {
    const db = await createTestDb();
    const online = repo.accountIdByKind(db, 'online');
    const food = db.first<{ id: string }>(`SELECT id FROM categories WHERE name = 'Food'`)!.id;
    repo.insertTransaction(db, {
      type: 'credit', amountPaise: 90000, title: 'Shoes', occurredAt: '2026-09-05T12:00',
      categoryId: food, accountId: online, toAccountId: null, remark: null,
    });
    repo.insertTransaction(db, {
      type: 'credit_repaid', amountPaise: 40000, title: 'Card bill', occurredAt: '2026-09-06T12:00',
      categoryId: null, accountId: online, toAccountId: null, remark: null,
    });
    expect(repo.monthSummary(db, '2026-09')).toMatchObject({ credit: 90000, creditRepaid: 40000, expenses: 90000, grossExpenses: 90000, savings: -90000, netCashFlow: -40000 });
    expect(repo.monthlySeries(db, '2026-09', 1)[0].summary).toMatchObject({ credit: 90000, creditRepaid: 40000 });
    expect(repo.categorySpend(db, '2026-09').find((c) => c.name === 'Food')?.total).toBe(90000);
  });
});

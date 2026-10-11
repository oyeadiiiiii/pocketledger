import { TxType, isTxType } from './types';
import { isValidLocalIso, localIsoToDate } from './dates';
import { MAX_PAISE } from './money';

export interface TxInput {
  type: TxType;
  amountPaise: number;
  title: string;
  occurredAt: string; // local YYYY-MM-DDTHH:MM
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  remark: string | null;
}

export type TxField = 'type' | 'amount' | 'title' | 'occurredAt' | 'category' | 'account' | 'toAccount' | 'remark';
export type TxErrors = Partial<Record<TxField, string>>;

/** Loans and transfers carry no spending category. */
export const needsCategory = (t: TxType): boolean =>
  t === 'expense' || t === 'refund' || t === 'income';

export function validateTxInput(i: TxInput, now: Date = new Date()): TxErrors {
  const e: TxErrors = {};
  if (!isTxType(i.type)) e.type = 'Choose a transaction type';
  if (!Number.isSafeInteger(i.amountPaise) || i.amountPaise <= 0) e.amount = 'Enter an amount greater than ₹0';
  else if (i.amountPaise > MAX_PAISE) e.amount = 'Amount is too large';
  const title = (i.title ?? '').trim();
  if (!title) e.title = 'Enter a title or merchant';
  else if (title.length > 120) e.title = 'Keep the title under 120 characters';
  if (!isValidLocalIso(i.occurredAt)) e.occurredAt = 'Enter a valid date and time';
  else if (localIsoToDate(i.occurredAt).getTime() > now.getTime() + 36 * 3600 * 1000) e.occurredAt = 'Date is too far in the future';
  if (!i.accountId) e.account = 'Choose Cash or Online';
  if (isTxType(i.type) && needsCategory(i.type) && !i.categoryId) e.category = 'Choose a category';
  if (i.type === 'transfer') {
    if (!i.toAccountId) e.toAccount = 'Choose the destination account';
    else if (i.toAccountId === i.accountId) e.toAccount = 'Source and destination must differ';
  }
  if (i.remark && i.remark.length > 500) e.remark = 'Remarks must be under 500 characters';
  return e;
}

export function firstError(e: TxErrors): string | null {
  const v = Object.values(e).find(Boolean);
  return v ?? null;
}

/** Same day + title + amount + account + type = probable duplicate. */
export function dedupeKeyOf(i: Pick<TxInput, 'type' | 'occurredAt' | 'title' | 'amountPaise' | 'accountId'>): string {
  return [i.type, i.occurredAt.slice(0, 10), i.title.trim().toLowerCase().replace(/\s+/g, ' '), i.amountPaise, i.accountId].join('|');
}
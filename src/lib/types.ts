export type TxType = 'expense' | 'income' | 'investment' | 'loan_taken' | 'loan_repaid' | 'transfer' | 'refund';
export type AccountKind = 'cash' | 'online';
export type TxSource = 'manual' | 'sms' | 'csv' | 'restore';
export type CategoryKind = 'expense' | 'income' | 'any';

export const TX_TYPES: TxType[] = ['expense', 'income', 'investment', 'loan_taken', 'loan_repaid', 'transfer', 'refund'];

export const TX_TYPE_LABEL: Record<TxType, string> = {
  expense: 'Expense', income: 'Income', investment: 'Investment', loan_taken: 'Loan Taken',
  loan_repaid: 'Loan Repaid', transfer: 'Transfer', refund: 'Refund',
};

/** +1 money enters the account, -1 leaves it, 0 moves between your own accounts. */
export function flowSign(type: TxType): 1 | -1 | 0 {
  switch (type) {
    case 'income': case 'loan_taken': case 'refund': return 1;
    case 'expense': case 'investment': case 'loan_repaid': return -1;
    default: return 0;
  }
}

export function isTxType(v: unknown): v is TxType {
  return typeof v === 'string' && (TX_TYPES as string[]).includes(v);
}
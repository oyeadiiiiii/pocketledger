import React, { useMemo } from 'react';
import { Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { getDb } from '../src/db';
import { insertTransaction, listAccounts, listCategories } from '../src/db/repo';
import { bumpLedger } from '../src/state/ledgerStore';
import { errorMessage } from '../src/components/ui';
import type { TxInput } from '../src/lib/validation';
import { TransactionForm, blankFormValues } from '../src/components/TransactionForm';

/** Keeps "move money between my own accounts" separate from the expense/income flow. */
export default function TransferScreen() {
  const db = getDb();
  const accounts = useMemo(() => listAccounts(db), [db]);
  const categories = useMemo(() => listCategories(db), [db]);
  const initial = useMemo(
    () => blankFormValues(accounts, categories, 'transfer'),
    [accounts, categories],
  );

  const onSubmit = (input: TxInput) => {
    try {
      insertTransaction(db, input, { source: 'manual' });
      bumpLedger();
      router.back();
    } catch (e) {
      Alert.alert('Could not save transfer', errorMessage(e));
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Transfer money' }} />
      <TransactionForm
        initial={initial}
        accounts={accounts}
        categories={categories}
        submitLabel="Send money"
        types={['transfer']}
        onSubmit={onSubmit}
      />
    </>
  );
}

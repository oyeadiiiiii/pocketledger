import React, { useMemo } from 'react';
import { Alert } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { getDb } from '../src/db';
import { getTransaction, insertTransaction, listAccounts, listCategories, updateTransaction } from '../src/db/repo';
import { bumpLedger } from '../src/state/ledgerStore';
import { isTxType } from '../src/lib/types';
import type { TxInput } from '../src/lib/validation';
import { EmptyState, Screen, errorMessage } from '../src/components/ui';
import { TransactionForm, blankFormValues, valuesFromTx } from '../src/components/TransactionForm';

export default function AddScreen() {
  const params = useLocalSearchParams<{ id?: string; type?: string }>();
  const editId = typeof params.id === 'string' && params.id ? params.id : null;
  const presetType = isTxType(params.type) ? params.type : 'expense';
  const db = getDb();

  const accounts = useMemo(() => listAccounts(db), [db]);
  const categories = useMemo(() => listCategories(db), [db]);
  const existing = useMemo(() => (editId ? getTransaction(db, editId) : null), [db, editId]);
  const initial = useMemo(
    () => (existing ? valuesFromTx(existing) : blankFormValues(accounts, categories, presetType)),
    [existing, accounts, categories, presetType],
  );

  const onSubmit = (input: TxInput) => {
    try {
      if (existing) updateTransaction(db, existing.id, input);
      else insertTransaction(db, input, { source: 'manual' });
      bumpLedger();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      router.back();
    } catch (e) {
      Alert.alert('Could not save', errorMessage(e));
    }
  };

  if (editId && !existing) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState icon="alert-circle-outline" title="Transaction not found" message="It may have been deleted." />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: existing ? 'Edit transaction' : 'Add transaction' }} />
      <TransactionForm
        initial={initial}
        accounts={accounts}
        categories={categories}
        submitLabel={existing ? 'Save changes' : 'Save transaction'}
        onSubmit={onSubmit}
      />
    </Screen>
  );
}
import React, { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getDb } from '../../src/db';
import { deleteTransaction, getTransaction } from '../../src/db/repo';
import { bumpLedger, useLedgerVersion } from '../../src/state/ledgerStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { TX_TYPE_LABEL, flowSign, type TxSource } from '../../src/lib/types';
import { formatDateTime } from '../../src/lib/dates';
import { formatINR } from '../../src/lib/money';
import { Card, EmptyState, IconCircle, PrimaryButton, Screen, asIcon, errorMessage } from '../../src/components/ui';

const SOURCE_LABEL: Record<TxSource, string> = {
  manual: 'Added manually',
  sms: 'Bank SMS (confirmed by you)',
  csv: 'Imported from spreadsheet CSV',
  restore: 'Restored from backup',
};

export default function TransactionDetail() {
  const t = useTheme();
  const v = useLedgerVersion();
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id ?? '');
  const tx = useMemo(() => getTransaction(getDb(), id), [id, v]);

  if (!tx) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState icon="alert-circle-outline" title="Transaction not found" message="It may have been deleted." />
      </Screen>
    );
  }

  const sign = flowSign(tx.type);
  const color = sign > 0 ? t.income : sign < 0 ? t.expense : t.text;
  const rows: [string, string][] = [
    ['Type', TX_TYPE_LABEL[tx.type]],
    ['Category', tx.category_name ?? '—'],
    [tx.type === 'transfer' ? 'From → To' : 'Account', tx.type === 'transfer' ? `${tx.account_name} → ${tx.to_account_name ?? '?'}` : tx.account_name],
    ['Date', formatDateTime(tx.occurred_at)],
    ['Remarks', tx.remark ?? '—'],
    ['Source', SOURCE_LABEL[tx.source]],
  ];
  if (tx.external_ref) rows.push(['Bank reference', tx.external_ref]);
  rows.push(['Last updated', new Date(tx.updated_at).toLocaleString('en-IN')]);

  const remove = () =>
    Alert.alert('Delete transaction?', 'This cannot be undone. Balances update immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          try {
            deleteTransaction(getDb(), tx.id);
            bumpLedger();
            router.back();
          } catch (e) {
            Alert.alert('Could not delete', errorMessage(e));
          }
        },
      },
    ]);

  return (
    <Screen edges={['bottom']}>
      <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
        <IconCircle name={asIcon(tx.category_icon, 'receipt')} color={tx.category_color ?? color} size={56} />
        <Text style={[s.title, { color: t.text }]}>{tx.title}</Text>
        <Text style={[s.amount, { color }]}>{`${sign > 0 ? '+' : sign < 0 ? '−' : ''}${formatINR(tx.amount_paise)}`}</Text>
      </Card>
      <Card style={{ gap: 2 }}>
        {rows.map(([k, val]) => (
          <View key={k} style={[s.row, { borderBottomColor: t.border }]}>
            <Text style={{ color: t.textMuted, fontSize: 15 }}>{k}</Text>
            <Text style={{ color: t.text, fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' }} selectable>{val}</Text>
          </View>
        ))}
      </Card>
      <PrimaryButton label="Edit" icon="create" onPress={() => router.push(`/add?id=${encodeURIComponent(tx.id)}`)} />
      <PrimaryButton label="Delete" icon="trash" tone="danger" onPress={remove} />
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  amount: { fontSize: 34, fontWeight: '900' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
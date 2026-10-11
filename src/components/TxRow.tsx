import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { TxView } from '../db/repo';
import { TX_TYPE_LABEL, flowSign, type TxType } from '../lib/types';
import { formatINR } from '../lib/money';
import { formatDateTime } from '../lib/dates';
import { asIcon, IconCircle, type IconName } from './ui';

const TYPE_ICON: Record<TxType, IconName> = {
  expense: 'arrow-up-circle',
  income: 'arrow-down-circle',
  investment: 'trending-up',
  loan_taken: 'hand-left',
  loan_repaid: 'checkmark-done-circle',
  transfer: 'swap-horizontal',
  refund: 'return-down-back',
};

export function TxRow({ tx, onPress, onLongPress }: { tx: TxView; onPress?: () => void; onLongPress?: () => void }) {
  const t = useTheme();
  const sign = flowSign(tx.type);
  const amountColor = sign > 0 ? t.income : sign < 0 ? t.expense : t.textMuted;
  const iconColor = tx.category_color ?? (sign > 0 ? t.income : sign < 0 ? t.expense : t.accent);
  const accountText = tx.type === 'transfer' ? `${tx.account_name} → ${tx.to_account_name ?? '?'}` : tx.account_name;
  const subtitle = [tx.category_name ?? TX_TYPE_LABEL[tx.type], accountText, formatDateTime(tx.occurred_at)].join(' · ');
  const amount = `${sign > 0 ? '+' : sign < 0 ? '−' : ''}${formatINR(tx.amount_paise)}`;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${tx.title}, ${TX_TYPE_LABEL[tx.type]}, ${amount}, ${subtitle}`}
      accessibilityHint="Opens details. Long press for edit or delete."
      style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <IconCircle name={asIcon(tx.category_icon, TYPE_ICON[tx.type])} color={iconColor} />
      <View style={s.mid}>
        <Text style={[s.title, { color: t.text }]} numberOfLines={1}>{tx.title}</Text>
        <Text style={[s.sub, { color: t.textMuted }]} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Text style={[s.amount, { color: amountColor }]}>{amount}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 64 },
  mid: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 13 },
  amount: { fontSize: 16, fontWeight: '800' },
});
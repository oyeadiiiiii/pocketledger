import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { getDb } from '../db';
import { insertTransaction, type AccountWithBalance } from '../db/repo';
import { bumpLedger } from '../state/ledgerStore';
import { nowLocalIso } from '../lib/dates';
import { formatINR, parseRupeesToPaise } from '../lib/money';
import { useTheme } from '../theme/ThemeProvider';
import { Card, ErrorText, Field, PrimaryButton, Segmented, errorMessage } from './ui';

type Direction = 'onlineToCash' | 'cashToOnline';

const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
  { value: 'onlineToCash', label: 'Online → Cash' },
  { value: 'cashToOnline', label: 'Cash → Online' },
];

/** Move money between the user's own accounts from Settings and record it as a transfer. */
export function AccountTransfer({ accounts }: { accounts: AccountWithBalance[] }) {
  const t = useTheme();
  const [direction, setDirection] = useState<Direction>('onlineToCash');
  const [amountText, setAmountText] = useState('');
  const [attempted, setAttempted] = useState(false);

  const cash = useMemo(() => accounts.find((account) => account.kind === 'cash'), [accounts]);
  const online = useMemo(() => accounts.find((account) => account.kind === 'online'), [accounts]);
  const missingAccounts = !cash || !online;

  const from = direction === 'onlineToCash' ? online : cash;
  const to = direction === 'onlineToCash' ? cash : online;
  const amountPaise = parseRupeesToPaise(amountText);
  const title = direction === 'onlineToCash' ? 'Online to Cash' : 'Cash to Online';
  const error = missingAccounts
    ? 'Cash and Online accounts are both required for a transfer.'
    : !amountPaise
      ? 'Enter an amount greater than ₹0.'
      : from && amountPaise > from.balance_paise
        ? `${from.name} only has ${formatINR(from.balance_paise)} available.`
        : null;

  const submit = () => {
    setAttempted(true);
    if (!from || !to || !amountPaise || error) return;
    const base = `${title} ${nowLocalIso().slice(11, 16)}`;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const label = attempt === 1 ? base : `${base} #${attempt}`;
      try {
        insertTransaction(getDb(), {
          type: 'transfer',
          amountPaise,
          title: label,
          occurredAt: nowLocalIso(),
          categoryId: null,
          accountId: from.id,
          toAccountId: to.id,
          remark: `${from.name} → ${to.name}`,
        }, { source: 'manual' });
        setAmountText('');
        setAttempted(false);
        bumpLedger();
        Alert.alert('Transfer saved', `${formatINR(amountPaise)} moved from ${from.name} to ${to.name}.`);
        return;
      } catch (e) {
        if (attempt === 5 || !String(e instanceof Error ? e.message : e).includes('Duplicate')) {
          Alert.alert('Could not save transfer', errorMessage(e));
          return;
        }
      }
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <Text style={[s.title, { color: t.text }]}>Move money</Text>
      <Text style={[s.helper, { color: t.textMuted }]}>
        Cash {formatINR(cash?.balance_paise ?? 0)} · Online {formatINR(online?.balance_paise ?? 0)}
      </Text>
      <Segmented<Direction> value={direction} onChange={setDirection} options={DIRECTION_OPTIONS} />
      <View>
        <Field
          label="Amount (₹)"
          value={amountText}
          onChangeText={(next) => setAmountText(next.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="0.00"
          returnKeyType="done"
        />
        <ErrorText>{attempted ? error ?? undefined : undefined}</ErrorText>
      </View>
      <PrimaryButton label={from && to ? `Transfer to ${to.name}` : 'Transfer'} icon="swap-horizontal" onPress={submit} disabled={missingAccounts} />
      <Text style={[s.helper, { color: t.textMuted }]}>
        Saved as a transfer transaction, separate from expenses and income.
      </Text>
    </Card>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '800' },
  helper: { fontSize: 13 },
});

import React, { useState, useEffect } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { getDb } from '../db';
import { updateAccountOpening, type AccountWithBalance } from '../db/repo';
import { bumpLedger } from '../state/ledgerStore';
import { useTheme } from '../theme/ThemeProvider';
import { nowLocalIso } from '../lib/dates';
import { formatINR, paiseToPlain, parseSignedAmount } from '../lib/money';
import { Card, Field, PrimaryButton, errorMessage } from './ui';
import { DateField } from './DateField';

export function AccountEditor({
  account,
  cashAccount,
  onlineAccount,
}: {
  account?: AccountWithBalance;
  cashAccount?: AccountWithBalance;
  onlineAccount?: AccountWithBalance;
}) {
  const t = useTheme();
  const now = nowLocalIso();

  // Determine which accounts to display
  const cash = cashAccount ?? account;
  const online = onlineAccount ?? (account?.kind === 'online' ? account : undefined);

  const [cashOpening, setCashOpening] = useState('');
  const [cashAllHistory, setCashAllHistory] = useState(false);
  const [cashAsOf, setCashAsOf] = useState('1970-01-01T00:00');

  const [onlineOpening, setOnlineOpening] = useState('');
  const [onlineAllHistory, setOnlineAllHistory] = useState(false);
  const [onlineAsOf, setOnlineAsOf] = useState('1970-01-01T00:00');

  // Compute old values for change tracking
  const oldCashBalance = cash?.opening_balance_paise ?? 0;
  const oldOnlineBalance = online?.opening_balance_paise ?? 0;
  const oldCashAsOf = cash?.opening_as_of ?? '1970-01-01T00:00';
  const oldOnlineAsOf = online?.opening_as_of ?? '1970-01-01T00:00';

  useEffect(() => {
    if (cash) {
      setCashOpening(paiseToPlain(cash.opening_balance_paise));
      setCashAllHistory(cash.opening_as_of.startsWith('1970'));
      setCashAsOf(cash.opening_as_of);
    }
    if (online) {
      setOnlineOpening(paiseToPlain(online.opening_balance_paise));
      setOnlineAllHistory(online.opening_as_of.startsWith('1970'));
      setOnlineAsOf(online.opening_as_of);
    }
  }, [cash, online]);

  const save = () => {
    const paise = parseSignedAmount(cashOpening);
    if (paise === null) {
      Alert.alert('Check the amount', 'Enter the opening balance in rupees, e.g. 4510 or 303.63.');
      return;
    }
    try {
      const asOfDate = cashAllHistory ? '1970-01-01T00:00' : `${cashAsOf.slice(0, 10)}T00:00`;
      updateAccountOpening(getDb(), cash?.id ?? 'acc_cash', paise, asOfDate);
      updateAccountOpening(getDb(), online?.id ?? 'acc_online', paise, asOfDate);
      bumpLedger();
      const cashChange = oldCashBalance !== paise || oldCashAsOf !== cashAsOf ? `Cash: old ₹${Math.abs(oldCashBalance)} → new ₹${Math.abs(paise)}, date: "${oldCashAsOf.slice(0, 10)}" → "${cashAsOf.slice(0, 10)}"` : '';
      const onlineChange = oldOnlineBalance !== paise || oldOnlineAsOf !== onlineAsOf ? `Online: old ₹${Math.abs(oldOnlineBalance)} → new ₹${Math.abs(paise)}, date: "${oldOnlineAsOf.slice(0, 10)}" → "${onlineAsOf.slice(0, 10)}"` : '';
      const changes = [cashChange, onlineChange].filter(Boolean).join(' | ');
      Alert.alert('Saved', `${cash?.name ?? 'Cash'} and ${online?.name ?? 'Online'} opening balances updated.${changes ? ' Changes: ' + changes : ''}`);
    } catch (e) {
      Alert.alert('Could not save', errorMessage(e));
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <View style={s.row}>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>Cash</Text>
        <Text style={{ color: (cash?.balance_paise ?? 0) < 0 ? t.expense : t.text, fontSize: 18, fontWeight: '800' }}>{formatINR(cash?.balance_paise ?? 0)}</Text>
      </View>
      <Field label="Opening balance (₹)" value={cashOpening} onChangeText={setCashOpening} keyboardType="decimal-pad" />
      <View style={s.row}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>Count all history</Text>
        <Switch value={cashAllHistory} onValueChange={setCashAllHistory} accessibilityLabel={`Count all history for Cash`} />
      </View>
      {!cashAllHistory ? <DateField label="Counts from" value={cashAsOf} onChange={setCashAsOf} mode="date" /> : null}

      <View style={s.row}>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>Online</Text>
        <Text style={{ color: (online?.balance_paise ?? 0) < 0 ? t.expense : t.text, fontSize: 18, fontWeight: '800' }}>{formatINR(online?.balance_paise ?? 0)}</Text>
      </View>
      <Field label="Opening balance (₹)" value={onlineOpening} onChangeText={setOnlineOpening} keyboardType="decimal-pad" />
      <View style={s.row}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>Count all history</Text>
        <Switch value={onlineAllHistory} onValueChange={setOnlineAllHistory} accessibilityLabel={`Count all history for Online`} />
      </View>
      {!onlineAllHistory ? <DateField label="Counts from" value={onlineAsOf} onChange={setOnlineAsOf} mode="date" /> : null}

      <PrimaryButton label='Save Both' icon="save" tone="primary" onPress={save} />
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
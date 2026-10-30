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

export function AccountEditor({ account }: { account: AccountWithBalance }) {
  const t = useTheme();
  const now = nowLocalIso();

  const [opening, setOpening] = useState(paiseToPlain(account.opening_balance_paise));
  const [allHistory, setAllHistory] = useState(account.opening_as_of.startsWith('1970'));
  const [asOf, setAsOf] = useState(account.opening_as_of);

  const oldOpening = account.opening_balance_paise;
  const oldAsOf = account.opening_as_of;

  const save = () => {
    const paise = parseSignedAmount(opening);
    if (paise === null) {
      Alert.alert('Check the amount', 'Enter the opening balance in rupees, e.g. 4510 or 303.63.');
      return;
    }
    try {
      updateAccountOpening(getDb(), account.id, paise, allHistory ? '1970-01-01T00:00' : `${asOf.slice(0, 10)}T00:00`);
      bumpLedger();
      Alert.alert('Saved', `${account.name} opening balance updated.`);
    } catch (e) {
      Alert.alert('Could not save', errorMessage(e));
    }
  };

  useEffect(() => {
    setOpening(paiseToPlain(account.opening_balance_paise));
    setAllHistory(account.opening_as_of.startsWith('1970'));
    setAsOf(account.opening_as_of);
  }, [account]);

  return (
    <Card style={{ gap: 12 }}>
      <View style={s.row}>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>{account.name}</Text>
        <Text style={{ color: account.balance_paise < 0 ? t.expense : t.text, fontSize: 18, fontWeight: '800' }}>{formatINR(account.balance_paise)}</Text>
      </View>
      <Field label="Opening balance (₹)" value={opening} onChangeText={setOpening} keyboardType="decimal-pad" />
      <View style={s.row}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>Count all history</Text>
        <Switch value={allHistory} onValueChange={setAllHistory} accessibilityLabel={`Count all history for ${account.name}`} />
      </View>
      {!allHistory ? <DateField label="Counts from" value={asOf} onChange={setAsOf} mode="date" /> : null}
      <PrimaryButton label={`Save ${account.name}`} icon="save" tone="ghost" onPress={save} />
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { getDb } from '../../src/db';
import { confirmPending, getPending, ignorePending, listAccounts, listCategories } from '../../src/db/repo';
import { bumpLedger, useLedgerVersion } from '../../src/state/ledgerStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { paiseToPlain, formatINR } from '../../src/lib/money';
import { ymdToDMY } from '../../src/lib/dates';
import { FLAG_LABEL } from '../../src/lib/smsParser';
import type { TxInput } from '../../src/lib/validation';
import { Badge, Card, Chip, EmptyState, PrimaryButton, Screen, SectionLabel, errorMessage } from '../../src/components/ui';
import { TransactionForm, type TxFormValues } from '../../src/components/TransactionForm';

function jsonArray<T>(s: string): T[] {
  try {
    const v: unknown = JSON.parse(s);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/pending'));

export default function ReviewScreen() {
  const t = useTheme();
  const v = useLedgerVersion();
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id ?? '');
  const db = getDb();

  const p = useMemo(() => getPending(db, id), [db, id, v]);
  const accounts = useMemo(() => listAccounts(db), [db]);
  const categories = useMemo(() => listCategories(db), [db]);
  const [amountOverride, setAmountOverride] = useState<number | null>(null);

  const initial = useMemo<TxFormValues | null>(() => {
    if (!p) return null;
    const amount = amountOverride ?? p.amount_paise;
    return {
      type: p.suggested_type,
      amountText: amount ? paiseToPlain(amount) : '',
      title: p.merchant,
      dateText: ymdToDMY(p.occurred_at.slice(0, 10)),
      timeText: p.occurred_at.slice(11, 16),
      categoryId: p.category_id,
      accountId: p.account_id,
      toAccountId: p.suggested_type === 'transfer' ? accounts.find((a) => a.kind === 'cash')?.id ?? null : null,
      remark: p.notes ?? '',
    };
  }, [p, amountOverride, accounts]);

  if (!p || !initial) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState icon="alert-circle-outline" title="Alert not found" />
      </Screen>
    );
  }

  if (p.status !== 'pending') {
    return (
      <Screen edges={['bottom']}>
        <Card style={{ gap: 10 }}>
          <Badge label={p.status === 'confirmed' ? 'Confirmed' : 'Ignored'} tone={p.status === 'confirmed' ? 'income' : 'neutral'} />
          <Text style={{ color: t.text, fontSize: 17 }}>
            {p.status === 'confirmed' ? 'This alert is already in your ledger. It can only be added once.' : 'This alert was ignored and does not affect balances.'}
          </Text>
          {p.confirmed_tx_id ? (
            <PrimaryButton label="View transaction" icon="open" onPress={() => router.replace(`/transaction/${encodeURIComponent(p.confirmed_tx_id ?? '')}`)} />
          ) : null}
        </Card>
      </Screen>
    );
  }

  const flags = jsonArray<string>(p.flags);
  const alternatives = jsonArray<number>(p.alt_amounts);
  const amountChoices = [p.amount_paise, ...alternatives].filter((x): x is number => typeof x === 'number' && x > 0);

  const confirm = (input: TxInput) => {
    try {
      confirmPending(db, p.id, input);
      bumpLedger();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      goBack();
    } catch (e) {
      Alert.alert('Could not confirm', errorMessage(e));
    }
  };

  const ignore = () =>
    Alert.alert('Ignore this alert?', 'It will not affect any balance. The SMS text is discarded.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Ignore', style: 'destructive', onPress: () => {
          try {
            ignorePending(db, p.id);
            bumpLedger();
            goBack();
          } catch (e) {
            Alert.alert('Could not ignore', errorMessage(e));
          }
        },
      },
    ]);

  return (
    <Screen edges={['bottom']}>
      <Card style={{ gap: 8 }}>
        <View style={s.row}>
          <Badge label={p.direction === 'debit' ? 'Debit' : 'Credit'} tone={p.direction === 'debit' ? 'expense' : 'income'} />
          <Text style={{ color: t.textMuted, fontSize: 13 }}>{Math.round(p.confidence * 100)}% confidence</Text>
        </View>
        <Text style={{ color: t.textMuted, fontSize: 13, fontWeight: '700' }}>ORIGINAL SMS</Text>
        <Text selectable style={[s.sms, { backgroundColor: t.cardAlt, color: t.text }]}>{p.sms_preview ?? '(text discarded)'}</Text>
        {p.reference ? <Text style={{ color: t.textMuted, fontSize: 13 }}>Bank reference: {p.reference}</Text> : null}
        {p.account_hint ? <Text style={{ color: t.textMuted, fontSize: 13 }}>Bank account ending {p.account_hint}</Text> : null}
      </Card>

      {p.possible_duplicate_of ? (
        <Card style={{ backgroundColor: t.warningSoft, borderColor: t.warning }}>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>
            Possible duplicate: an entry with the same amount exists within 10 minutes. Ignore this one if it is the same payment.
          </Text>
        </Card>
      ) : null}

      {flags.length ? (
        <View style={s.wrap}>{flags.map((f) => <Badge key={f} label={FLAG_LABEL[f] ?? f} tone="warning" />)}</View>
      ) : null}

      {amountChoices.length > 1 ? (
        <Card style={{ gap: 10 }}>
          <SectionLabel>Several amounts found. Tap the right one.</SectionLabel>
          <View style={s.wrap}>
            {amountChoices.map((a) => (
              <Chip key={a} label={formatINR(a)} selected={(amountOverride ?? p.amount_paise) === a} onPress={() => setAmountOverride(a)} />
            ))}
          </View>
        </Card>
      ) : null}

      <TransactionForm
        key={`${p.id}-${amountOverride ?? 'parsed'}`}
        initial={initial}
        accounts={accounts}
        categories={categories}
        submitLabel="Confirm & add to ledger"
        remarkLabel="Notes"
        onSubmit={confirm}
        footer={<PrimaryButton label="Ignore this alert" icon="close-circle" tone="ghost" onPress={ignore} />}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sms: { fontSize: 15, padding: 12, borderRadius: 12, lineHeight: 21 },
});
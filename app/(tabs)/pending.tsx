import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getDb } from '../../src/db';
import { ignorePending, ingestSms, listPending, listRecentlyResolved, type PendingRow } from '../../src/db/repo';
import { bumpLedger, useLedgerVersion } from '../../src/state/ledgerStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { TX_TYPE_LABEL } from '../../src/lib/types';
import { formatDateTime } from '../../src/lib/dates';
import { formatINR } from '../../src/lib/money';
import { FLAG_LABEL } from '../../src/lib/smsParser';
import { describeOutcome } from '../../src/lib/outcome';
import { Badge, Card, EmptyState, Field, PrimaryButton, Screen, SectionLabel, errorMessage } from '../../src/components/ui';

function jsonArray<T>(s: string): T[] {
  try {
    const v: unknown = JSON.parse(s);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export default function PendingScreen() {
  const t = useTheme();
  const v = useLedgerVersion();
  const items = useMemo(() => listPending(getDb()), [v]);
  const resolved = useMemo(() => listRecentlyResolved(getDb(), 8), [v]);
  const [paste, setPaste] = useState('');

  const submitPaste = () => {
    const res = ingestSms(getDb(), paste);
    bumpLedger();
    if (res.status === 'created') {
      setPaste('');
      router.push(`/review/${encodeURIComponent(res.pendingId)}`);
      return;
    }
    const o = describeOutcome(res);
    Alert.alert(o.title, o.message);
    if (res.status === 'ignored') setPaste(''); // never keep OTP/ignored text on screen
  };

  const ignore = (p: PendingRow) =>
    Alert.alert('Ignore this alert?', 'It will not affect any balance. The SMS text is discarded.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Ignore', style: 'destructive', onPress: () => {
          try { ignorePending(getDb(), p.id); bumpLedger(); } catch (e) { Alert.alert('Could not ignore', errorMessage(e)); }
        },
      },
    ]);

  return (
    <Screen title="Pending Review" subtitle="Nothing reaches your ledger until you confirm">
      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon="checkmark-done-circle-outline"
            title="All caught up"
            message="Bank SMS alerts sent by your Apple Shortcut will appear here for you to confirm, edit or ignore."
          />
        </Card>
      ) : (
        items.map((p) => <PendingCard key={p.id} p={p} onIgnore={() => ignore(p)} />)
      )}

      <SectionLabel>Paste a bank SMS</SectionLabel>
      <Card style={{ gap: 12 }}>
        <Text style={{ color: t.textMuted, fontSize: 14 }}>
          If the Shortcut didn&apos;t run (for example, the phone was locked), copy the SMS from Messages and paste it here.
        </Text>
        <Field label="SMS text" value={paste} onChangeText={setPaste} multiline placeholder="Rs.450.00 debited from A/c XX1234…" maxLength={1000} />
        <PrimaryButton label="Read SMS" icon="scan" onPress={submitPaste} disabled={!paste.trim()} />
      </Card>

      {resolved.length ? (
        <>
          <SectionLabel>Recently resolved</SectionLabel>
          <Card style={{ gap: 10 }}>
            {resolved.map((p) => (
              <View key={p.id} style={s.resolvedRow}>
                <Badge label={p.status === 'confirmed' ? 'Confirmed' : 'Ignored'} tone={p.status === 'confirmed' ? 'income' : 'neutral'} />
                <Text style={{ flex: 1, color: t.text }} numberOfLines={1}>{p.merchant}</Text>
                <Text style={{ color: t.textMuted }}>{p.amount_paise ? formatINR(p.amount_paise) : '—'}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function PendingCard({ p, onIgnore }: { p: PendingRow; onIgnore: () => void }) {
  const t = useTheme();
  const flags = jsonArray<string>(p.flags);
  const debit = p.direction === 'debit';
  return (
    <Card style={{ gap: 10 }}>
      <View style={s.row}>
        <Badge label={debit ? 'Debit' : 'Credit'} tone={debit ? 'expense' : 'income'} />
        <Badge label={TX_TYPE_LABEL[p.suggested_type]} tone="accent" />
        <Text style={{ marginLeft: 'auto', color: t.textMuted, fontSize: 13 }}>{Math.round(p.confidence * 100)}% sure</Text>
      </View>
      <Text style={[s.amount, { color: p.amount_paise ? (debit ? t.expense : t.income) : t.warning }]}>
        {p.amount_paise ? `${debit ? '−' : '+'}${formatINR(p.amount_paise)}` : 'Amount needed'}
      </Text>
      <Text style={[s.merchant, { color: t.text }]} numberOfLines={1}>{p.merchant}</Text>
      <Text style={{ color: t.textMuted, fontSize: 14 }}>
        {formatDateTime(p.occurred_at)}{p.account_hint ? ` · A/c …${p.account_hint}` : ''}
      </Text>
      {flags.length ? (
        <View style={s.wrap}>{flags.map((f) => <Badge key={f} label={FLAG_LABEL[f] ?? f} tone="warning" />)}</View>
      ) : null}
      <View style={s.row}>
        <PrimaryButton label="Review" icon="create" onPress={() => router.push(`/review/${encodeURIComponent(p.id)}`)} style={{ flex: 1 }} />
        <PrimaryButton label="Ignore" icon="close" tone="ghost" onPress={onIgnore} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  amount: { fontSize: 30, fontWeight: '900' },
  merchant: { fontSize: 18, fontWeight: '700' },
  resolvedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
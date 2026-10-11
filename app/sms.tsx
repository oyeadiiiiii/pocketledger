import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { getDb } from '../src/db';
import { getSmsToken, ingestSms } from '../src/db/repo';
import { bumpLedger } from '../src/state/ledgerStore';
import { useTheme } from '../src/theme/ThemeProvider';
import { describeOutcome, type IntakeOutcome } from '../src/lib/outcome';
import { Card, PrimaryButton, Screen } from '../src/components/ui';

const firstValue = (x: unknown): unknown => (Array.isArray(x) ? x[0] : x);

/**
 * Handles pocketledger://sms?key=<secret>&text=<URL-encoded SMS>
 * Sent by an Apple Shortcuts message automation. Never writes to the ledger directly:
 * it only creates a Pending Review item (or reports why the SMS was ignored).
 */
export default function SmsIntakeScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ text?: string; key?: string }>();
  const handled = useRef<string | null>(null);
  const [outcome, setOutcome] = useState<IntakeOutcome | null>(null);

  useEffect(() => {
    const text = firstValue(params.text);
    const key = firstValue(params.key);
    const signature = `${String(key)}|${String(text)}`;
    if (handled.current === signature) return;
    handled.current = signature;

    try {
      const db = getDb();
      if (typeof key !== 'string' || key !== getSmsToken(db)) {
        setOutcome({ status: 'rejected', reason: 'invalid_key' }); // text is not parsed or stored
        return;
      }
      const res = ingestSms(db, text);
      bumpLedger();
      if (res.status === 'created') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        router.replace(`/review/${encodeURIComponent(res.pendingId)}`);
        return;
      }
      setOutcome(res);
    } catch {
      setOutcome({ status: 'rejected', reason: 'empty' });
    }
  }, [params.text, params.key]);

  if (!outcome) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: t.bg }}>
        <ActivityIndicator size="large" color={t.accent} />
        <Text style={{ color: t.textMuted, fontSize: 16 }}>Reading bank alert…</Text>
      </View>
    );
  }

  const o = describeOutcome(outcome);
  return (
    <Screen edges={['bottom']}>
      <Card style={{ gap: 10 }}>
        <Text style={{ color: t.text, fontSize: 22, fontWeight: '800' }}>{o.title}</Text>
        <Text style={{ color: t.textMuted, fontSize: 16 }}>{o.message}</Text>
      </Card>
      <PrimaryButton label="Open Pending Review" icon="notifications" onPress={() => router.replace('/pending')} />
      <PrimaryButton label="Done" tone="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}
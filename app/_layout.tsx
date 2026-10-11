import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, ScrollView, Text } from 'react-native';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { getDb } from '../src/db';
import { runAutoBackupIfDue } from '../src/lib/autoBackup';
import { drainClipboardQueue } from '../src/lib/clipboardIntake';
import { bumpLedger } from '../src/state/ledgerStore';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

export default function RootLayout() {
  const [dbError] = useState<string | null>(() => {
    try {
      getDb();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  });

  // Silent automatic backup: a full CSV at most once every 6 days, keeping only the newest 2.
  useEffect(() => {
    if (!dbError) runAutoBackupIfDue(getDb());
  }, [dbError]);

  // Clipboard queue: the Shortcut silently drops bank SMS here while the app is closed.
  // Whenever the user opens the app, drain everything into Pending Review and offer to confirm.
  const draining = useRef(false);
  useEffect(() => {
    if (dbError) return;
    const drain = async () => {
      if (draining.current) return;
      draining.current = true;
      try {
        const r = await drainClipboardQueue(getDb());
        if (r.created > 0) {
          bumpLedger();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
          Alert.alert(
            `${r.created} bank alert${r.created === 1 ? '' : 's'} detected`,
            'They are saved as pending. Nothing has been added to your ledger yet.',
            [
              { text: 'Later', style: 'cancel' },
              { text: 'Review now', onPress: () => router.push('/pending') },
            ],
          );
        } else if (r.hadEntries) {
          bumpLedger(); // duplicates/ignored still changed pending state worth re-reading
        }
      } catch {
        // never block the app on clipboard problems
      } finally {
        draining.current = false;
      }
    };
    drain();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') drain(); });
    return () => sub.remove();
  }, [dbError]);

  if (dbError) {
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '800' }}>PocketLedger could not open its database</Text>
        <Text style={{ fontSize: 16 }}>{dbError}</Text>
        <Text style={{ fontSize: 14, color: '#5B6785' }}>Your data has not been changed. Reinstall the latest build and try again.</Text>
      </ScrollView>
    );
  }

  return (
    <ThemeProvider>
      <RootStack />
    </ThemeProvider>
  );
}

function RootStack() {
  const t = useTheme();
  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          headerBackTitle: 'Back',
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="add" options={{ presentation: 'modal', title: 'Add transaction' }} />
        <Stack.Screen name="transaction/[id]" options={{ title: 'Transaction' }} />
        <Stack.Screen name="review/[id]" options={{ title: 'Review bank alert' }} />
        <Stack.Screen name="sms" options={{ title: 'Bank alert' }} />
        <Stack.Screen name="import" options={{ title: 'Import / Restore' }} />
        <Stack.Screen name="categories" options={{ title: 'Categories' }} />
      </Stack>
    </>
  );
}
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getDb } from '../src/db';
import { runAutoBackupIfDue } from '../src/lib/autoBackup';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

/** Shown instead of a silent crash if any screen throws while rendering. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 72, gap: 12, backgroundColor: '#FFFFFF' }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: '#0B1530' }}>Something went wrong</Text>
      <Text selectable style={{ fontSize: 15, color: '#0B1530' }}>{error?.message ?? String(error)}</Text>
      <Text style={{ fontSize: 14, color: '#5B6785' }}>Your data has not been changed. Take a screenshot of this message, then tap Try again.</Text>
      <Pressable
        onPress={() => { retry(); }}
        accessibilityRole="button"
        style={{ marginTop: 8, minHeight: 52, borderRadius: 14, backgroundColor: '#0B1530', alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>Try again</Text>
      </Pressable>
    </ScrollView>
  );
}

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

  if (dbError) {
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '800' }}>PocketLedger could not open its database</Text>
        <Text selectable style={{ fontSize: 16 }}>{dbError}</Text>
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
        <Stack.Screen name="import" options={{ title: 'Import / Restore' }} />
        <Stack.Screen name="categories" options={{ title: 'Categories' }} />
      </Stack>
    </>
  );
}
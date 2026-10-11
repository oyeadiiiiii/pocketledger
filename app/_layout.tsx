import React, { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getDb } from '../src/db';
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
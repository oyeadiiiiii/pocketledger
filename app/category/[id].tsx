import React, { useMemo } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { getDb } from '../../src/db';
import { listCategories, listTransactions, type TxView } from '../../src/db/repo';
import { useLedgerVersion } from '../../src/state/ledgerStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { formatDate } from '../../src/lib/dates';
import { Card, EmptyState, IconCircle, Screen, asIcon } from '../../src/components/ui';
import { TxRow } from '../../src/components/TxRow';

type Item = { kind: 'header'; key: string; label: string } | { kind: 'tx'; key: string; tx: TxView };

export default function CategoryScreen() {
  const t = useTheme();
  const v = useLedgerVersion();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' && params.id ? params.id : '';
  const db = getDb();

  const cats = useMemo(() => listCategories(db), [db, v]);
  const cat = useMemo(() => cats.find((c) => c.id === id) ?? null, [cats, id]);
  const txs = useMemo(() => (id ? listTransactions(db, { categoryIds: [id], limit: 2000 }) : []), [db, id, v]);

  const items = useMemo(() => {
    const out: Item[] = [];
    let lastDay = '';
    for (const tx of txs) {
      const day = tx.occurred_at.slice(0, 10);
      if (day !== lastDay) {
        out.push({ kind: 'header', key: `h-${day}`, label: formatDate(tx.occurred_at) });
        lastDay = day;
      }
      out.push({ kind: 'tx', key: tx.id, tx });
    }
    return out;
  }, [txs]);

  if (!cat) {
    return (
      <>
        <Stack.Screen options={{ title: 'Category', headerShown: false }} />
        <Screen title="Category">
          <EmptyState icon="pricetag-outline" title="Category not found" />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: cat.name }} />
      <Screen>
        <View style={{ gap: 8, marginTop: -16 }}>
          <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 18 }}>
            <IconCircle name={asIcon(cat.icon)} color={cat.color} size={48} />
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{cat.name}</Text>
            <Text style={{ color: t.textMuted, fontSize: 14 }}>{txs.length} transaction{txs.length === 1 ? '' : 's'}</Text>
          </Card>
          {txs.length === 0 ? (
            <EmptyState icon="cash-outline" title="No transactions" message="Transactions with this category will appear here." />
          ) : (
            <View>
              {items.map((item) =>
                item.kind === 'header' ? (
                  <Text key={item.key} style={[s.day, { color: t.textMuted }]} accessibilityRole="header">{item.label}</Text>
                ) : (
                  <TxRow
                    key={item.tx.id}
                    tx={item.tx}
                    onPress={() => router.push(`/transaction/${encodeURIComponent(item.tx.id)}`)}
                    onLongPress={() => {}}
                  />
                ),
              )}
            </View>
          )}
        </View>
      </Screen>
    </>
  );
}

const s = StyleSheet.create({
  day: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
});

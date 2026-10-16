import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getDb } from '../../src/db';
import { listCategories, listTransactions } from '../../src/db/repo';
import { useLedgerVersion } from '../../src/state/ledgerStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { formatDate } from '../../src/lib/dates';
import { formatINR } from '../../src/lib/money';
import { Card, EmptyState, IconCircle, Screen, asIcon } from '../../src/components/ui';
import { TxRow } from '../../src/components/TxRow';

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
    const out: { kind: 'header'; key: string; label: string }[] = [];
    let lastDay = '';
    for (const tx of txs) {
      const day = tx.occurred_at.slice(0, 10);
      if (day !== lastDay) {
        out.push({ kind: 'header', key: `h-${day}`, label: formatDate(tx.occurred_at) });
        lastDay = day;
      }
    }
    return out;
  }, [txs]);

  if (!cat) {
    return (
      <Screen title="Category">
        <EmptyState icon="pricetag-outline" title="Category not found" />
      </Screen>
    );
  }

  return (
    <Screen title={cat.name}>
      <View style={{ gap: 8 }}>
        <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 18 }}>
          <IconCircle name={asIcon(cat.icon)} color={cat.color} size={48} />
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{cat.name}</Text>
          <Text style={{ color: t.textMuted, fontSize: 14 }}>{txs.length} transaction{txs.length === 1 ? '' : 's'}</Text>
        </Card>
        {txs.length === 0 ? (
          <EmptyState icon="cash-outline" title="No transactions" message="Transactions with this category will appear here." />
        ) : (
          <View>
            {items.map((i) => (
              <Text key={i.key} style={[s.day, { color: t.textMuted }]} accessibilityRole="header">{i.label}</Text>
            ))}
            {txs.map((tx) => (
              <TxRow
                key={tx.id}
                tx={tx}
                onPress={() => router.push(`/transaction/${encodeURIComponent(tx.id)}`)}
                onLongPress={() => {}}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  day: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
});

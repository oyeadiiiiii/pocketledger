import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '../../src/db';
import { deleteTransaction, listCategories, listTransactions, type TxView } from '../../src/db/repo';
import { bumpLedger, useLedgerVersion } from '../../src/state/ledgerStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { FILTER_TYPES, TX_TYPE_LABEL, flowSign, type AccountKind, type TxType } from '../../src/lib/types';
import { formatDate, formatDateTime } from '../../src/lib/dates';
import { formatINR } from '../../src/lib/money';
import { Card, Chip, EmptyState, Screen, SectionLabel, Segmented, asIcon, errorMessage } from '../../src/components/ui';
import { MonthPicker } from '../../src/components/MonthPicker';
import { TxRow } from '../../src/components/TxRow';

type Item = { kind: 'header'; key: string; label: string } | { kind: 'tx'; key: string; tx: TxView };

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export default function HistoryScreen() {
  const t = useTheme();
  const v = useLedgerVersion();
  const params = useLocalSearchParams<{ cat?: string }>();
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState<string | null>(null);
  const [account, setAccount] = useState<'all' | AccountKind>('all');
  const [types, setTypes] = useState<TxType[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);

  // Arriving from Home's "Top categories": pre-select that category and show the filter.
  useFocusEffect(
    useCallback(() => {
      const cat = typeof params.cat === 'string' && params.cat ? params.cat : null;
      if (cat) {
        setCats([cat]);
        setShowFilters(true);
        router.setParams({ cat: undefined });
      }
    }, [params.cat]),
  );

  const categories = useMemo(() => listCategories(getDb()), [v]);
  const txs = useMemo(
    () => listTransactions(getDb(), { search, monthKey: month, accountKind: account === 'all' ? null : account, types, categoryIds: cats, limit: 2000 }),
    [search, month, account, types, cats, v],
  );

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

  const totals = useMemo(
    () => txs.reduce((acc, tx) => {
      const sign = flowSign(tx.type);
      if (sign > 0) acc.in += tx.amount_paise;
      else if (sign < 0) acc.out += tx.amount_paise;
      return acc;
    }, { in: 0, out: 0 }),
    [txs],
  );

  const filterCount = (month ? 1 : 0) + (account !== 'all' ? 1 : 0) + types.length + cats.length;
  const clearAll = () => { setMonth(null); setAccount('all'); setTypes([]); setCats([]); setSearch(''); };

  const confirmDelete = (tx: TxView) =>
    Alert.alert('Delete transaction?', 'This cannot be undone. Balances update immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          try { deleteTransaction(getDb(), tx.id); bumpLedger(); } catch (e) { Alert.alert('Could not delete', errorMessage(e)); }
        },
      },
    ]);

  const actions = (tx: TxView) =>
    Alert.alert(tx.title, `${formatINR(tx.amount_paise)} · ${formatDateTime(tx.occurred_at)}`, [
      { text: 'Edit', onPress: () => router.push(`/add?id=${encodeURIComponent(tx.id)}`) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(tx) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <View style={[s.search, { backgroundColor: t.card, borderColor: t.border }]}>
        <Ionicons name="search" size={20} color={t.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search title, remark, category"
          placeholderTextColor={t.textMuted}
          style={[s.searchInput, { color: t.text }]}
          accessibilityLabel="Search transactions"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <View style={s.wrap}>
        <Chip label={filterCount ? `Filters (${filterCount})` : 'Filters'} icon="options" selected={showFilters} onPress={() => setShowFilters((x) => !x)} />
        {filterCount || search ? <Chip label="Clear all" icon="close" onPress={clearAll} /> : null}
      </View>

      {showFilters ? (
        <Card style={{ gap: 14 }}>
          {/* Month is collapsed by default while any other filter is active. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Pressable onPress={() => setMonthOpen((v) => !v)} style={{ padding: 4 }}>
              <Ionicons name={monthOpen ? 'chevron-up' : 'chevron-down'} size={18} color={t.textMuted} />
            </Pressable>
            <Pressable onPress={() => setMonthOpen((v) => !v)}>
              <SectionLabel>Month</SectionLabel>
            </Pressable>
          </View>
          {monthOpen ? <MonthPicker value={month} onChange={setMonth} allowAll /> : null}
          <SectionLabel>Account</SectionLabel>
          <Segmented
            value={account}
            options={[{ value: 'all', label: 'All' }, { value: 'cash', label: 'Cash' }, { value: 'online', label: 'Online' }]}
            onChange={setAccount}
          />
          <SectionLabel>Type</SectionLabel>
          <View style={s.wrap}>
            {FILTER_TYPES.map((ty) => <Chip key={ty} label={TX_TYPE_LABEL[ty]} selected={types.includes(ty)} onPress={() => setTypes((x) => toggle(x, ty))} />)}
          </View>
          <SectionLabel>Category</SectionLabel>
          <View style={s.wrap}>
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} icon={asIcon(c.icon)} color={c.color} selected={cats.includes(c.id)} onPress={() => setCats((x) => toggle(x, c.id))} />
            ))}
          </View>
        </Card>
      ) : null}

      <Text style={{ color: t.textMuted, fontSize: 14 }}>
        {txs.length} transaction{txs.length === 1 ? '' : 's'} · In <Text style={{ color: t.income, fontWeight: '700' }}>{formatINR(totals.in)}</Text> · Out <Text style={{ color: t.expense, fontWeight: '700' }}>{formatINR(totals.out)}</Text>
      </Text>
    </View>
  );

  return (
    <Screen title="History" scroll={false}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <EmptyState icon="search" title="No transactions found" message={filterCount || search ? 'Try clearing your filters.' : 'Add one with the + button on Home.'} />
        }
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <Text style={[s.day, { color: t.textMuted }]} accessibilityRole="header">{item.label}</Text>
          ) : (
            <Pressable style={[s.txCard, { backgroundColor: t.card, borderColor: t.border }]}>
              <TxRow
                tx={item.tx}
                onPress={() => router.push(`/transaction/${encodeURIComponent(item.tx.id)}`)}
                onLongPress={() => actions(item.tx)}
              />
            </Pressable>
          )
        }
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, minHeight: 52 },
  searchInput: { flex: 1, fontSize: 17, minHeight: 48 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  day: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  txCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, marginBottom: 6 },
});
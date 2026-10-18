import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '../../src/db';
import {
  accountBalances, categorySpend, creditOwed, listTransactions, monthSummary, monthlySeries,
} from '../../src/db/repo';
import { useLedgerVersion } from '../../src/state/ledgerStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { currentMonthKey, shortMonth } from '../../src/lib/dates';
import { formatCompactINR, formatINR } from '../../src/lib/money';
import { Card, EmptyState, Fab, FadeIn, Screen, SectionLabel, type IconName } from '../../src/components/ui';
import { BarChart, HBarList } from '../../src/components/charts';
import { MonthPicker } from '../../src/components/MonthPicker';
import { TxRow } from '../../src/components/TxRow';

export default function HomeScreen() {
  const t = useTheme();
  const v = useLedgerVersion();
  const [month, setMonth] = useState(currentMonthKey());

  const d = useMemo(() => {
    const db = getDb();
    return {
      balances: accountBalances(db),
      creditOwed: creditOwed(db),
      s: monthSummary(db, month),
      series: monthlySeries(db, month, 6),
      cats: categorySpend(db, month).slice(0, 5),
      recent: listTransactions(db, { limit: 6 }),
    };
  }, [month, v]);

  const total = d.balances.reduce((sum, a) => sum + a.balance_paise, 0);
  const cash = d.balances.find((a) => a.kind === 'cash')?.balance_paise ?? 0;
  const online = d.balances.find((a) => a.kind === 'online')?.balance_paise ?? 0;
  const availableCash = total - d.creditOwed;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Screen title="PocketLedger" subtitle="Offline · Indian Rupee">
        <MonthPicker value={month} onChange={(k) => k && setMonth(k)} />

        <FadeIn>
          <View style={[s.hero, { backgroundColor: t.heroBg }]} accessible accessibilityLabel={`Current balance ${formatINR(availableCash)}. Cash ${formatINR(cash)}. Online ${formatINR(online)}. Credit owed ${formatINR(d.creditOwed)}.`}>
            <Text style={[s.heroLabel, { color: t.heroMuted }]}>Current balance</Text>
            <Text style={[s.heroValue, { color: t.heroText }]} numberOfLines={1} adjustsFontSizeToFit>{formatINR(availableCash)}</Text>
            <Text style={[s.heroReal, { color: t.heroMuted }]} numberOfLines={1} adjustsFontSizeToFit>
              Actual {formatINR(total)}{d.creditOwed ? ` · Credit owed ${formatINR(d.creditOwed)}` : ''}
            </Text>
            <View style={s.heroRow}>
              <HeroSplit icon="cash-outline" label="Cash" paise={cash} />
              <View style={[s.heroDivider, { backgroundColor: t.heroMuted }]} />
              <HeroSplit icon="phone-portrait-outline" label="Online" paise={online} />
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={80}>
          <View style={s.grid}>
            <StatTile label="Income" paise={d.s.income} color={t.income} icon="arrow-down-circle" />
            <StatTile label="Expenses" paise={d.s.expenses} color={t.expense} icon="arrow-up-circle" hint={d.s.refunds ? `after ${formatCompactINR(d.s.refunds)} refunds` : undefined} />
            <StatTile label="Savings" paise={d.s.savings} color={d.s.savings >= 0 ? t.income : t.expense} icon="shield-checkmark" hint="income − expenses incl. credit" />
            <StatTile label="Credit owed" paise={d.creditOwed} color={t.warning} icon="card" hint="credit − repaid" full />
          </View>
        </FadeIn>

        <SectionLabel>Monthly spending</SectionLabel>
        <Card>
          <BarChart color={t.expense} data={d.series.map((m) => ({ label: shortMonth(m.key), value: m.summary.expenses, highlight: m.key === month }))} />
        </Card>

        <SectionLabel>Top categories</SectionLabel>
        <Card>
          {d.cats.length ? (
            <HBarList items={d.cats.map((c) => ({
              label: c.name, value: c.total, color: c.color, icon: c.icon,
              onPress: () => router.push(`/category/${encodeURIComponent(c.id)}`),
            }))} />
          ) : (
            <EmptyState icon="pie-chart-outline" title="No spending this month" />
          )}
        </Card>

        <SectionLabel right={<Text onPress={() => router.push('/history')} style={{ color: t.accent, fontWeight: '700', fontSize: 15 }} accessibilityRole="link">See all</Text>}>
          Recent transactions
        </SectionLabel>
        <Card style={{ paddingVertical: 4 }}>
          {d.recent.length ? (
            d.recent.map((tx) => <TxRow key={tx.id} tx={tx} onPress={() => router.push(`/transaction/${encodeURIComponent(tx.id)}`)} />)
          ) : (
            <EmptyState icon="wallet-outline" title="No transactions yet" message="Tap + to add one, or import your spreadsheet CSV from Settings." />
          )}
        </Card>
        <View style={{ height: 90 }} />
      </Screen>
      <Fab onPress={() => router.push('/add')} />
    </View>
  );
}

function HeroSplit({ icon, label, paise }: { icon: IconName; label: string; paise: number }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={icon} size={16} color={t.heroMuted} />
        <Text style={{ color: t.heroMuted, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      </View>
      <Text style={{ color: t.heroText, fontSize: 20, fontWeight: '800' }} numberOfLines={1} adjustsFontSizeToFit>{formatINR(paise)}</Text>
    </View>
  );
}

function StatTile({ label, paise, color, icon, hint, full }: { label: string; paise: number; color: string; icon: IconName; hint?: string; full?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={[s.tile, { backgroundColor: t.card, borderColor: t.border, width: full ? '100%' : '48.5%' }]}
      accessible
      accessibilityLabel={`${label} ${formatINR(paise)}${hint ? `, ${hint}` : ''}`}
    >
      <View style={s.tileTop}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={[s.tileLabel, { color: t.textMuted }]}>{label}</Text>
      </View>
      <Text style={[s.tileValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{formatINR(paise)}</Text>
      {hint ? <Text style={{ color: t.textMuted, fontSize: 12 }} numberOfLines={1}>{hint}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 28, padding: 22, gap: 6 },
  heroLabel: { fontSize: 15, fontWeight: '600' },
  heroValue: { fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  heroReal: { fontSize: 13, fontWeight: '600' },
  heroRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 16 },
  heroDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', opacity: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  tile: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileLabel: { fontSize: 13, fontWeight: '700' },
  tileValue: { fontSize: 22, fontWeight: '800' },
});
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getDb } from '../../src/db';
import { categorySpend, modeSplit, monthSummary, monthlySeries } from '../../src/db/repo';
import { useLedgerVersion } from '../../src/state/ledgerStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { currentMonthKey, monthLabel, shiftMonth, shortMonth } from '../../src/lib/dates';
import { formatINR } from '../../src/lib/money';
import { Card, EmptyState, Screen, SectionLabel } from '../../src/components/ui';
import { BarChart, GroupedBars, HBarList, SplitBar } from '../../src/components/charts';
import { MonthPicker } from '../../src/components/MonthPicker';

export default function AnalyticsScreen() {
  const t = useTheme();
  const v = useLedgerVersion();
  const [month, setMonth] = useState(currentMonthKey());

  const d = useMemo(() => {
    const db = getDb();
    return {
      s: monthSummary(db, month),
      prev: monthSummary(db, shiftMonth(month, -1)),
      series: monthlySeries(db, month, 6),
      cats: categorySpend(db, month),
      split: modeSplit(db, month),
    };
  }, [month, v]);

  return (
    <Screen title="Analytics">
      <MonthPicker value={month} onChange={(k) => k && setMonth(k)} />

      <SectionLabel>Spending by category</SectionLabel>
      <Card>
        {d.cats.length ? (
          <HBarList items={d.cats.map((c) => ({
            label: c.name, value: c.total, color: c.color, icon: c.icon,
            onPress: () => router.push(`/category/${encodeURIComponent(c.id)}`),
          }))} />
        ) : (
          <EmptyState icon="pie-chart-outline" title={`No spending in ${monthLabel(month)}`} />
        )}
      </Card>

      <SectionLabel>Income vs expenses</SectionLabel>
      <Card>
        <GroupedBars
          data={d.series.map((m) => ({ label: shortMonth(m.key), a: m.summary.income, b: m.summary.expenses }))}
          colors={[t.income, t.expense]}
          legend={['Income', 'Expenses']}
        />
      </Card>

      <SectionLabel>Monthly savings</SectionLabel>
      <Card style={{ gap: 8 }}>
        <BarChart color={t.income} data={d.series.map((m) => ({ label: shortMonth(m.key), value: m.summary.savings, highlight: m.key === month }))} />
        <Text style={{ color: t.textMuted, fontSize: 13 }}>
          Savings = salary/income − expenses. Borrowed money is not income.
        </Text>
      </Card>

      <SectionLabel>Cash vs online spending</SectionLabel>
      <Card>
        <SplitBar items={[{ label: 'Cash', value: d.split.cash, color: t.warning }, { label: 'Online', value: d.split.online, color: t.accent }]} />
      </Card>

      <SectionLabel>{`${monthLabel(month)} vs ${monthLabel(shiftMonth(month, -1))}`}</SectionLabel>
      <Card style={{ gap: 4 }}>
        <Compare label="Income" cur={d.s.income} prev={d.prev.income} upIsGood />
        <Compare label="Expenses" cur={d.s.expenses} prev={d.prev.expenses} upIsGood={false} />
        <Compare label="Savings" cur={d.s.savings} prev={d.prev.savings} upIsGood />
        <Compare label="Net cash flow" cur={d.s.netCashFlow} prev={d.prev.netCashFlow} upIsGood />
      </Card>
    </Screen>
  );
}

function Compare({ label, cur, prev, upIsGood }: { label: string; cur: number; prev: number; upIsGood: boolean }) {
  const t = useTheme();
  const diff = cur - prev;
  const pct = prev !== 0 ? Math.round((diff / Math.abs(prev)) * 100) : null;
  const good = diff === 0 ? null : (diff > 0) === upIsGood;
  const color = good === null ? t.textMuted : good ? t.income : t.expense;
  const change = diff === 0 ? 'no change' : `${diff > 0 ? '▲' : '▼'} ${formatINR(Math.abs(diff))}${pct !== null ? ` (${Math.abs(pct)}%)` : ''}`;
  return (
    <View style={s.compare} accessible accessibilityLabel={`${label}: ${formatINR(cur)}, previous ${formatINR(prev)}, ${change}`}>
      <Text style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: t.text, fontSize: 15, fontWeight: '800' }}>{formatINR(cur)}</Text>
        <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{change}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  compare: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
});
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { formatCompactINR, formatINR } from '../lib/money';
import { asIcon, IconCircle } from './ui';

function GrowBar({ height, color, delay = 0, width = '70%', opacity = 1 }: { height: number; color: string; delay?: number; width?: DimensionValue; opacity?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 650, delay, useNativeDriver: false }).start();
  }, [a, height, delay]);
  return (
    <Animated.View
      style={{
        width, opacity, backgroundColor: color, borderRadius: 8,
        height: a.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(height, 3)] }),
      }}
    />
  );
}

/** Vertical bars. Negative values are drawn in the expense colour. */
export function BarChart({ data, color, height = 140 }: { data: { label: string; value: number; highlight?: boolean }[]; color: string; height?: number }) {
  const t = useTheme();
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={data.map((d) => `${d.label} ${formatINR(d.value)}`).join(', ')}>
      <View style={[s.barsRow, { height: height + 22 }]}>
        {data.map((d, i) => (
          <View key={`${d.label}-${i}`} style={s.barCol}>
            <Text style={[s.barValue, { color: t.textMuted }]} numberOfLines={1}>{d.value ? formatCompactINR(d.value) : ''}</Text>
            <GrowBar height={(Math.abs(d.value) / max) * height} color={d.value < 0 ? t.expense : color} opacity={d.highlight === false ? 0.45 : 1} delay={i * 60} />
          </View>
        ))}
      </View>
      <View style={s.labelsRow}>
        {data.map((d, i) => (
          <Text key={`${d.label}-l-${i}`} style={[s.barLabel, { color: d.highlight ? t.text : t.textMuted, fontWeight: d.highlight ? '800' : '500' }]}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

/** Two bars per group, e.g. income vs expenses per month. */
export function GroupedBars({
  data, colors, legend, height = 140,
}: {
  data: { label: string; a: number; b: number }[];
  colors: [string, string];
  legend: [string, string];
  height?: number;
}) {
  const t = useTheme();
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={data.map((d) => `${d.label}: ${legend[0]} ${formatINR(d.a)}, ${legend[1]} ${formatINR(d.b)}`).join('. ')}>
      <View style={s.legend}>
        {legend.map((l, i) => (
          <View key={l} style={s.legendItem}>
            <View style={[s.dot, { backgroundColor: colors[i] }]} />
            <Text style={{ color: t.textMuted, fontSize: 13 }}>{l}</Text>
          </View>
        ))}
      </View>
      <View style={[s.barsRow, { height }]}>
        {data.map((d, i) => (
          <View key={`${d.label}-${i}`} style={[s.barCol, { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 }]}>
            <GrowBar height={(d.a / max) * height} color={colors[0]} width={10} delay={i * 60} />
            <GrowBar height={(d.b / max) * height} color={colors[1]} width={10} delay={i * 60 + 30} />
          </View>
        ))}
      </View>
      <View style={s.labelsRow}>
        {data.map((d, i) => <Text key={`${d.label}-g-${i}`} style={[s.barLabel, { color: t.textMuted }]}>{d.label}</Text>)}
      </View>
    </View>
  );
}

function GrowWidth({ pct, color, delay }: { pct: number; color: string; delay: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 700, delay, useNativeDriver: false }).start();
  }, [a, pct, delay]);
  return (
    <Animated.View
      style={{
        height: 8, borderRadius: 4, backgroundColor: color,
        width: a.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${Math.max(2, Math.min(100, pct))}%`] }),
      }}
    />
  );
}

/** Ranked horizontal bars with share of total. */
export function HBarList({ items }: { items: { label: string; value: number; color: string; icon?: string }[] }) {
  const t = useTheme();
  const total = items.reduce((sum, i) => sum + Math.max(0, i.value), 0) || 1;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <View style={{ gap: 14 }}>
      {items.map((i, idx) => (
        <View key={i.label} style={s.hRow} accessible accessibilityLabel={`${i.label}: ${formatINR(i.value)}, ${Math.round((i.value / total) * 100)} percent`}>
          <IconCircle name={asIcon(i.icon)} color={i.color} size={38} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={s.hTop}>
              <Text style={[s.hLabel, { color: t.text }]} numberOfLines={1}>{i.label}</Text>
              <Text style={[s.hValue, { color: t.text }]}>{formatINR(i.value)}</Text>
            </View>
            <View style={[s.track, { backgroundColor: t.cardAlt }]}>
              <GrowWidth pct={(i.value / max) * 100} color={i.color} delay={idx * 70} />
            </View>
            <Text style={{ color: t.textMuted, fontSize: 12 }}>{Math.round((i.value / total) * 100)}% of spending</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** One stacked bar split between segments, e.g. Cash vs Online. */
export function SplitBar({ items }: { items: { label: string; value: number; color: string }[] }) {
  const t = useTheme();
  const total = items.reduce((sum, i) => sum + Math.max(0, i.value), 0);
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.split, { backgroundColor: t.cardAlt }]}>
        {total > 0 && items.map((i) => (i.value > 0 ? <View key={i.label} style={{ flex: i.value, backgroundColor: i.color }} /> : null))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {items.map((i) => (
          <View key={i.label} style={{ gap: 2 }}>
            <View style={s.legendItem}>
              <View style={[s.dot, { backgroundColor: i.color }]} />
              <Text style={{ color: t.textMuted, fontSize: 13 }}>{i.label}</Text>
            </View>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{formatINR(i.value)}</Text>
            <Text style={{ color: t.textMuted, fontSize: 12 }}>{total ? Math.round((Math.max(0, i.value) / total) * 100) : 0}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barValue: { fontSize: 10, marginBottom: 4 },
  labelsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  barLabel: { flex: 1, textAlign: 'center', fontSize: 12 },
  legend: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  hRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  hTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  hLabel: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  hValue: { fontSize: 15, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  split: { height: 16, borderRadius: 8, overflow: 'hidden', flexDirection: 'row' },
});
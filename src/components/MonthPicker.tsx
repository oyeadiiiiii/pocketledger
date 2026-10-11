import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { currentMonthKey, monthLabel, shiftMonth } from '../lib/dates';
import { IconButton } from './ui';

export function MonthPicker({
  value, onChange, allowAll = false,
}: {
  value: string | null;
  onChange: (key: string | null) => void;
  allowAll?: boolean;
}) {
  const t = useTheme();
  const thisMonth = currentMonthKey();
  const base = value ?? thisMonth;
  const hint = allowAll
    ? value ? 'Tap to show all months' : 'Tap to pick a month'
    : value === thisMonth ? 'This month' : 'Tap to jump to this month';

  return (
    <View style={[s.row, { backgroundColor: t.card, borderColor: t.border }]}>
      <IconButton icon="chevron-back" label="Previous month" onPress={() => onChange(shiftMonth(base, -1))} />
      <Pressable
        style={s.center}
        accessibilityRole="button"
        accessibilityLabel={value ? monthLabel(value) : 'All months'}
        accessibilityHint={hint}
        onPress={() => (allowAll ? onChange(value ? null : thisMonth) : onChange(thisMonth))}
      >
        <Text style={[s.label, { color: t.text }]}>{value ? monthLabel(value) : 'All months'}</Text>
        <Text style={[s.hint, { color: t.textMuted }]}>{hint}</Text>
      </Pressable>
      <IconButton icon="chevron-forward" label="Next month" onPress={() => onChange(shiftMonth(base, 1))} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 8 },
  center: { flex: 1, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  label: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 12, marginTop: 2 },
});
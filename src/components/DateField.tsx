import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme } from '../theme/ThemeProvider';
import { localIsoToDate, toLocalIso } from '../lib/dates';

/** Native iOS date (and optional time) picker bound to a local 'YYYY-MM-DDTHH:MM' string. */
export function DateField({
  label, value, onChange, mode = 'datetime', maximumDate,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  mode?: 'date' | 'datetime';
  maximumDate?: Date;
}) {
  const t = useTheme();
  const parsed = localIsoToDate(value);
  const current = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  const handle = (part: 'date' | 'time') => (_event: DateTimePickerEvent, picked?: Date) => {
    if (!picked) return;
    const next = new Date(current);
    if (part === 'date') next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    onChange(toLocalIso(next));
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={[s.label, { color: t.textMuted }]}>{label}</Text>
      <View style={[s.row, { backgroundColor: t.card, borderColor: t.border }]}>
        <DateTimePicker value={current} mode="date" display="compact" onChange={handle('date')} maximumDate={maximumDate}
          themeVariant={t.dark ? 'dark' : 'light'} accentColor={t.accent} locale="en-IN" />
        {mode === 'datetime' ? (
          <DateTimePicker value={current} mode="time" display="compact" onChange={handle('time')}
            themeVariant={t.dark ? 'dark' : 'light'} accentColor={t.accent} locale="en-IN" />
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1 },
});
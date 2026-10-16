import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme } from '../theme/ThemeProvider';
import { localIsoToDate, toLocalIso, LOCAL_ISO_RE } from '../lib/dates';

/** Native iOS date (and optional time) picker bound to a local 'YYYY-MM-DDTHH:MM' string. */
export function DateField({
  label, value, onChange, mode = 'datetime',
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  mode?: 'date' | 'datetime';
}) {
  const t = useTheme();
  const parsed = localIsoToDate(value);
  const initial = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  // Keep the picker state in sync with the parent value so it always reflects the date that was picked.
  const [pickerValue, setPickerValue] = useState(initial);
  useEffect(() => {
    setPickerValue((prev) => {
      const next = localIsoToDate(value);
      return Number.isNaN(next.getTime()) ? prev : next;
    });
  }, [value]);

  const memoValue = useMemo(() => new Date(pickerValue), [pickerValue]);

  // Handler for the date picker; uses memoValue as the base and applies the picked component.
  const handle = useCallback((part: 'date' | 'time') => (_event: DateTimePickerEvent, picked?: Date) => {
    if (!picked) return;
    const next = new Date(memoValue);
    if (part === 'date') next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    const iso = toLocalIso(next);
    onChange(iso);
  }, [memoValue, onChange]);

  const isoToTs = useCallback((s: string) => {
    const m = LOCAL_ISO_RE.exec(s);
    if (!m) return 0;
    const [y, mo, d, h, mi] = m.slice(1).map(Number);
    return new Date(y, mo - 1, d, h, mi).getTime();
  }, []);

  return (
    <View style={{ gap: 6 }}>
      <Text style={[s.label, { color: t.textMuted }]}>{label}</Text>
      <View style={[s.row, { backgroundColor: t.card, borderColor: t.border }]}>
        <DateTimePicker
          value={memoValue}
          mode="date"
          display="compact"
          onChange={handle('date')}
          themeVariant={t.dark ? 'dark' : 'light'}
          accentColor={t.accent}
          locale="en-IN"
        />
        {mode === 'datetime' ? (
          <DateTimePicker
            value={memoValue}
            mode="time"
            display="compact"
            onChange={handle('time')}
            themeVariant={t.dark ? 'dark' : 'light'}
            accentColor={t.accent}
            locale="en-IN"
          />
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1 },
});
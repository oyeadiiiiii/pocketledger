import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme } from '../theme/ThemeProvider';
import { localIsoToDate, toLocalIso, LOCAL_ISO_RE } from '../lib/dates';

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
  const initial = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  // Internal picker state is isolated so a parent re-render (from onChange) does not reset the native picker.
  const [pickerValue, setPickerValue] = useState(initial);

  const memoValue = useMemo(() => {
    const next = new Date(pickerValue);
    if (maximumDate && next.getTime() > maximumDate.getTime()) next.setTime(maximumDate.getTime());
    return next;
  }, [pickerValue, maximumDate]);

  // Stabilised handler so the native picker is not re-mounted on parent re-render.
  const handle = useCallback((part: 'date' | 'time') => (_event: DateTimePickerEvent, picked?: Date) => {
    if (!picked) return;
    const next = new Date(memoValue);
    if (part === 'date') next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    const iso = toLocalIso(next);
    if (maximumDate && isoToTs(iso) > maximumDate.getTime()) {
      // Falling back to maximumDate so the parent keeps a value that can be validated too.
      onChange(toLocalIso(maximumDate));
      return;
    }
    onChange(iso);
  }, [memoValue, onChange, maximumDate]);

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
          maximumDate={maximumDate}
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
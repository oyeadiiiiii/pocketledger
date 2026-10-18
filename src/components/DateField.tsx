import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme } from '../theme/ThemeProvider';
import { formatDate, localIsoToDate, toLocalIso } from '../lib/dates';

/** Native date (and optional time) picker bound to a local 'YYYY-MM-DDTHH:MM' string. Inline on iOS; modal on Android. */
export function DateField({
  label, value, onChange, mode = 'datetime',
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  mode?: 'date' | 'datetime';
}) {
  const t = useTheme();
  const baseValue = useMemo(() => {
    const parsed = localIsoToDate(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [value]);

  // Keep the iOS picker state in sync with the parent value so it always reflects the date that was picked.
  const [pickerValue, setPickerValue] = useState(baseValue);
  const [dialog, setDialog] = useState<null | 'date' | 'time'>(null);
  useEffect(() => {
    setPickerValue((prev) => {
      const next = localIsoToDate(value);
      return Number.isNaN(next.getTime()) ? prev : next;
    });
  }, [value]);

  const memoValue = useMemo(() => new Date(pickerValue), [pickerValue]);

  // Handler for the iOS picker; uses memoValue as the base and applies the picked component.
  const handle = useCallback((part: 'date' | 'time') => (_event: DateTimePickerEvent, picked?: Date) => {
    if (!picked) return;
    const next = new Date(memoValue);
    if (part === 'date') next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    const iso = toLocalIso(next);
    onChange(iso);
  }, [memoValue, onChange]);

  // Android uses modal dialogs. Always close before applying a selection so a dismissed
  // dialog cannot be reopened by the parent's state update.
  const handleAndroid = useCallback((part: 'date' | 'time') => (event: DateTimePickerEvent, picked?: Date) => {
    setDialog(null);
    if (event?.type === 'dismissed' || !picked) return;
    const next = new Date(baseValue);
    if (part === 'date') next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    onChange(toLocalIso(next));
  }, [baseValue, onChange]);

  if (Platform.OS === 'android') {
    const displayValue = toLocalIso(baseValue);
    return (
      <View style={{ gap: 6 }}>
        <Text style={[s.label, { color: t.textMuted }]}>{label}</Text>
        <View style={[s.row, { backgroundColor: t.card, borderColor: t.border }]}>
          <Pressable
            onPress={() => setDialog('date')}
            accessibilityRole="button"
            accessibilityLabel="Choose date"
            style={s.androidButton}
          >
            <Text style={[s.androidText, { color: t.text }]}>{formatDate(displayValue)}</Text>
          </Pressable>
          {mode === 'datetime' ? (
            <Pressable
              onPress={() => setDialog('time')}
              accessibilityRole="button"
              accessibilityLabel="Choose time"
              style={s.androidButton}
            >
              <Text style={[s.androidText, { color: t.text }]}>{displayValue.slice(11, 16)}</Text>
            </Pressable>
          ) : null}
        </View>
        {dialog ? (
          <DateTimePicker
            value={baseValue}
            mode={dialog}
            display="default"
            onChange={handleAndroid(dialog)}
            themeVariant={t.dark ? 'dark' : 'light'}
            accentColor={t.accent}
            locale="en-IN"
          />
        ) : null}
      </View>
    );
  }

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
  androidButton: { flex: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  androidText: { fontSize: 17, fontWeight: '600' },
});
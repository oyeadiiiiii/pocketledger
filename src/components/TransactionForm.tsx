import React, { ReactNode, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TX_TYPES, TX_TYPE_LABEL, type TxType } from '../lib/types';
import { formatINR, paiseToPlain, parseRupeesToPaise } from '../lib/money';
import { addDays, nowLocalIso, parseDMY, ymdToDMY } from '../lib/dates';
import { type TxErrors, type TxInput, needsCategory, validateTxInput } from '../lib/validation';
import type { Account, Category, TxView } from '../db/repo';
import { Chip, ErrorText, Field, IconButton, PrimaryButton, SectionLabel, Segmented, asIcon } from './ui';

export interface TxFormValues {
  type: TxType;
  amountText: string;
  title: string;
  dateText: string; // DD/MM/YYYY
  timeText: string; // HH:MM
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  remark: string;
}

export function blankFormValues(accounts: Account[], categories: Category[], type: TxType = 'expense'): TxFormValues {
  const now = nowLocalIso();
  const online = accounts.find((a) => a.kind === 'online') ?? accounts[0];
  const defaultCat =
    type === 'investment' ? categories.find((c) => c.name === 'Invest')?.id
    : type === 'income' ? categories.find((c) => c.name === 'Income')?.id
    : undefined;
  return {
    type,
    amountText: '',
    title: '',
    dateText: ymdToDMY(now.slice(0, 10)),
    timeText: now.slice(11, 16),
    categoryId: defaultCat ?? null,
    accountId: online?.id ?? '',
    toAccountId: type === 'transfer' ? accounts.find((a) => a.id !== online?.id)?.id ?? null : null,
    remark: '',
  };
}

export function valuesFromTx(tx: TxView): TxFormValues {
  return {
    type: tx.type,
    amountText: paiseToPlain(tx.amount_paise),
    title: tx.title,
    dateText: ymdToDMY(tx.occurred_at.slice(0, 10)),
    timeText: tx.occurred_at.slice(11, 16),
    categoryId: tx.category_id,
    accountId: tx.account_id,
    toAccountId: tx.to_account_id,
    remark: tx.remark ?? '',
  };
}

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function categoriesFor(type: TxType, categories: Category[]): Category[] {
  if (type === 'income') return categories.filter((c) => c.kind !== 'expense');
  if (type === 'investment') return categories;
  return categories.filter((c) => c.kind !== 'income');
}

interface Props {
  initial: TxFormValues;
  accounts: Account[];
  categories: Category[];
  submitLabel: string;
  onSubmit: (input: TxInput) => void;
  types?: TxType[];
  remarkLabel?: string;
  footer?: ReactNode;
}

export function TransactionForm({ initial, accounts, categories, submitLabel, onSubmit, types = TX_TYPES, remarkLabel = 'Remarks', footer }: Props) {
  const t = useTheme();
  const [v, setV] = useState<TxFormValues>(initial);
  const [errors, setErrors] = useState<TxErrors>({});
  const set = <K extends keyof TxFormValues>(key: K, value: TxFormValues[K]) => setV((p) => ({ ...p, [key]: value }));

  const visibleCats = useMemo(() => categoriesFor(v.type, categories), [v.type, categories]);
  const otherAccount = (id: string) => accounts.find((a) => a.id !== id)?.id ?? null;
  const amountPaise = parseRupeesToPaise(v.amountText);

  const changeType = (type: TxType) =>
    setV((p) => {
      let categoryId = needsCategory(type) ? p.categoryId : null;
      if (categoryId && !categoriesFor(type, categories).some((c) => c.id === categoryId)) categoryId = null;
      if (type === 'investment' && !categoryId) categoryId = categories.find((c) => c.name === 'Invest')?.id ?? null;
      if (type === 'income' && !categoryId) categoryId = categories.find((c) => c.name === 'Income')?.id ?? null;
      return { ...p, type, categoryId, toAccountId: type === 'transfer' ? otherAccount(p.accountId) : null };
    });

  const setDay = (ymd: string) => set('dateText', ymdToDMY(ymd));
  const shiftDay = (n: number) => {
    const base = parseDMY(v.dateText) ?? nowLocalIso().slice(0, 10);
    setDay(addDays(`${base}T00:00`, n).slice(0, 10));
  };

  const submit = () => {
    const ymd = parseDMY(v.dateText);
    const tm = TIME_RE.exec(v.timeText.trim());
    const occurredAt = ymd && tm ? `${ymd}T${tm[1].padStart(2, '0')}:${tm[2]}` : '';
    const input: TxInput = {
      type: v.type,
      amountPaise: amountPaise ?? 0,
      title: v.title.trim(),
      occurredAt,
      categoryId: needsCategory(v.type) ? v.categoryId : null,
      accountId: v.accountId,
      toAccountId: v.type === 'transfer' ? v.toAccountId : null,
      remark: v.remark.trim() || null,
    };
    const e = validateTxInput(input);
    if (!ymd) e.occurredAt = 'Enter the date as DD/MM/YYYY';
    else if (!tm) e.occurredAt = 'Enter the time as HH:MM (24-hour)';
    if (v.amountText.trim() && amountPaise === null) e.amount = 'Use numbers only, with up to 2 decimals (e.g. 149.28)';
    setErrors(e);
    if (Object.keys(e).length === 0) onSubmit(input);
  };

  const today = nowLocalIso().slice(0, 10);
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }));

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 10 }}>
        <SectionLabel>Type</SectionLabel>
        <View style={s.wrap}>
          {types.map((ty) => (
            <Chip key={ty} label={TX_TYPE_LABEL[ty]} selected={v.type === ty} onPress={() => changeType(ty)} />
          ))}
        </View>
      </View>

      <View>
        <Text style={[s.label, { color: t.textMuted }]}>Amount</Text>
        <View style={[s.amountBox, { backgroundColor: t.card, borderColor: errors.amount ? t.expense : t.border }]}>
          <Text style={[s.rupee, { color: t.textMuted }]}>₹</Text>
          <TextInput
            value={v.amountText}
            onChangeText={(x) => set('amountText', x.replace(/[^0-9.,]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={t.textMuted}
            style={[s.amountInput, { color: t.text }]}
            accessibilityLabel="Amount in rupees"
          />
        </View>
        {amountPaise ? <Text style={[s.preview, { color: t.textMuted }]}>{formatINR(amountPaise)}</Text> : null}
        <ErrorText>{errors.amount}</ErrorText>
      </View>

      <Field
        label={v.type === 'transfer' ? 'Description' : 'Title or merchant'}
        value={v.title}
        onChangeText={(x) => set('title', x)}
        error={errors.title}
        placeholder={v.type === 'income' ? 'e.g. Salary Credit' : 'e.g. Butter Chicken'}
        maxLength={120}
        returnKeyType="done"
      />

      <View>
        <Text style={[s.label, { color: t.textMuted }]}>Date and time</Text>
        <View style={s.row}>
          <IconButton icon="chevron-back" label="Previous day" onPress={() => shiftDay(-1)} />
          <TextInput
            value={v.dateText}
            onChangeText={(x) => set('dateText', x)}
            placeholder="DD/MM/YYYY"
            placeholderTextColor={t.textMuted}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            accessibilityLabel="Date, day month year"
            style={[s.dateInput, { backgroundColor: t.card, color: t.text, borderColor: errors.occurredAt ? t.expense : t.border }]}
          />
          <IconButton icon="chevron-forward" label="Next day" onPress={() => shiftDay(1)} />
          <TextInput
            value={v.timeText}
            onChangeText={(x) => set('timeText', x)}
            placeholder="HH:MM"
            placeholderTextColor={t.textMuted}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            accessibilityLabel="Time, 24 hour"
            style={[s.timeInput, { backgroundColor: t.card, color: t.text, borderColor: errors.occurredAt ? t.expense : t.border }]}
          />
        </View>
        <View style={[s.wrap, { marginTop: 10 }]}>
          <Chip label="Today" selected={parseDMY(v.dateText) === today} onPress={() => setDay(today)} />
          <Chip label="Yesterday" onPress={() => setDay(addDays(`${today}T00:00`, -1).slice(0, 10))} />
        </View>
        <ErrorText>{errors.occurredAt}</ErrorText>
      </View>

      {needsCategory(v.type) ? (
        <View style={{ gap: 10 }}>
          <SectionLabel>Category</SectionLabel>
          <View style={s.wrap}>
            {visibleCats.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                icon={asIcon(c.icon)}
                color={c.color}
                selected={v.categoryId === c.id}
                onPress={() => set('categoryId', c.id)}
              />
            ))}
          </View>
          <ErrorText>{errors.category}</ErrorText>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionLabel>{v.type === 'transfer' ? 'From account' : 'Account'}</SectionLabel>
        <Segmented
          value={v.accountId}
          options={accountOptions}
          onChange={(id) => setV((p) => ({ ...p, accountId: id, toAccountId: p.type === 'transfer' ? otherAccount(id) : null }))}
        />
        <ErrorText>{errors.account}</ErrorText>
      </View>

      {v.type === 'transfer' ? (
        <View style={{ gap: 10 }}>
          <SectionLabel>To account</SectionLabel>
          <Segmented
            value={v.toAccountId ?? ''}
            options={accountOptions.filter((o) => o.value !== v.accountId)}
            onChange={(id) => set('toAccountId', id)}
          />
          <ErrorText>{errors.toAccount}</ErrorText>
        </View>
      ) : null}

      <Field
        label={remarkLabel}
        value={v.remark}
        onChangeText={(x) => set('remark', x)}
        placeholder="Optional"
        multiline
        maxLength={500}
        error={errors.remark}
      />

      <PrimaryButton label={submitLabel} icon="checkmark-circle" onPress={submit} />
      {footer}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  amountBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, minHeight: 76 },
  rupee: { fontSize: 32, fontWeight: '700', marginRight: 6 },
  amountInput: { flex: 1, fontSize: 36, fontWeight: '800' },
  preview: { fontSize: 14, marginTop: 6 },
  dateInput: { flex: 1, minHeight: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, fontSize: 17, textAlign: 'center' },
  timeInput: { width: 80, minHeight: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 8, fontSize: 17, textAlign: 'center' },
});
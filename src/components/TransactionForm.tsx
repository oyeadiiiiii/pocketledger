import React, { ReactNode, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TX_TYPES, TX_TYPE_LABEL, type TxType } from '../lib/types';
import { formatINR, paiseToPlain, parseRupeesToPaise } from '../lib/money';
import { addDays, nowLocalIso } from '../lib/dates';
import { type TxErrors, type TxInput, needsCategory, validateTxInput } from '../lib/validation';
import type { Account, Category, TxView } from '../db/repo';
import { Chip, ErrorText, Field, PrimaryButton, SectionLabel, Segmented, asIcon } from './ui';
import { DateField } from './DateField';

export interface TxFormValues {
  type: TxType;
  amountText: string;
  title: string;
  occurredAt: string;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  remark: string;
}

export function blankFormValues(accounts: Account[], categories: Category[], type: TxType = 'expense'): TxFormValues {
  const online = accounts.find((a) => a.kind === 'online') ?? accounts[0];
  const defaultCat =
    type === 'investment' ? categories.find((c) => c.name === 'Invest')?.id
    : type === 'income' ? categories.find((c) => c.name === 'Income')?.id
    : undefined;
  return {
    type, amountText: '', title: '', occurredAt: nowLocalIso(), categoryId: defaultCat ?? null,
    accountId: online?.id ?? '',
    toAccountId: type === 'transfer' ? accounts.find((a) => a.id !== online?.id)?.id ?? null : null,
    remark: '',
  };
}

export function valuesFromTx(tx: TxView): TxFormValues {
  return {
    type: tx.type, amountText: paiseToPlain(tx.amount_paise), title: tx.title, occurredAt: tx.occurred_at,
    categoryId: tx.category_id, accountId: tx.account_id, toAccountId: tx.to_account_id, remark: tx.remark ?? '',
  };
}

function categoriesFor(type: TxType, categories: Category[]): Category[] {
  if (type === 'income') return categories.filter((c) => c.kind !== 'expense');
  if (type === 'investment') return categories;
  return categories.filter((c) => c.kind !== 'income');
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
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
  const today = nowLocalIso().slice(0, 10);
  const yesterday = addDays(`${today}T00:00`, -1).slice(0, 10);
  const setDay = (ymd: string) => setV((p) => ({ ...p, occurredAt: `${ymd}T${p.occurredAt.slice(11, 16)}` }));

  const changeType = (type: TxType) =>
    setV((p) => {
      let categoryId = needsCategory(type) ? p.categoryId : null;
      if (categoryId && !categoriesFor(type, categories).some((c) => c.id === categoryId)) categoryId = null;
      if (type === 'investment' && !categoryId) categoryId = categories.find((c) => c.name === 'Invest')?.id ?? null;
      if (type === 'income' && !categoryId) categoryId = categories.find((c) => c.name === 'Income')?.id ?? null;
      return { ...p, type, categoryId, toAccountId: type === 'transfer' ? otherAccount(p.accountId) : null };
    });

  const submit = () => {
    const input: TxInput = {
      type: v.type, amountPaise: amountPaise ?? 0, title: v.title.trim(), occurredAt: v.occurredAt,
      categoryId: needsCategory(v.type) ? v.categoryId : null, accountId: v.accountId,
      toAccountId: v.type === 'transfer' ? v.toAccountId : null, remark: v.remark.trim() || null,
    };
    const e = validateTxInput(input);
    if (v.amountText.trim() && amountPaise === null) e.amount = 'Use numbers only, with up to 2 decimals (e.g. 149.28)';
    setErrors(e);
    if (Object.keys(e).length === 0) onSubmit(input);
  };

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }));

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 10 }}>
        <SectionLabel>Type</SectionLabel>
        <View style={s.wrap}>
          {types.map((ty) => <Chip key={ty} label={TX_TYPE_LABEL[ty]} selected={v.type === ty} onPress={() => changeType(ty)} />)}
        </View>
      </View>

      <View>
        <Text style={[s.label, { color: t.textMuted }]}>Amount</Text>
        <View style={[s.amountBox, { backgroundColor: t.card, borderColor: errors.amount ? t.expense : t.border }]}>
          <Text style={[s.rupee, { color: t.textMuted }]}>₹</Text>
          <TextInput value={v.amountText} onChangeText={(x) => set('amountText', x.replace(/[^0-9.,]/g, ''))}
            keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={t.textMuted}
            style={[s.amountInput, { color: t.text }]} accessibilityLabel="Amount in rupees" />
        </View>
        {amountPaise ? <Text style={[s.preview, { color: t.textMuted }]}>{formatINR(amountPaise)}</Text> : null}
        <ErrorText>{errors.amount}</ErrorText>
      </View>

      <Field label={v.type === 'transfer' ? 'Description' : 'Title or merchant'} value={v.title} onChangeText={(x) => set('title', x)}
        error={errors.title} placeholder={v.type === 'income' ? 'e.g. Salary Credit' : 'e.g. Butter Chicken'} maxLength={120} returnKeyType="done" />

      <View style={{ gap: 10 }}>
        <DateField label="Date and time" value={v.occurredAt} onChange={(iso) => set('occurredAt', iso)} maximumDate={endOfToday()} />
        <View style={s.wrap}>
          <Chip label="Today" selected={v.occurredAt.startsWith(today)} onPress={() => setDay(today)} />
          <Chip label="Yesterday" selected={v.occurredAt.startsWith(yesterday)} onPress={() => setDay(yesterday)} />
        </View>
        <ErrorText>{errors.occurredAt}</ErrorText>
      </View>

      {needsCategory(v.type) ? (
        <View style={{ gap: 10 }}>
          <SectionLabel>Category</SectionLabel>
          <View style={s.wrap}>
            {visibleCats.map((c) => (
              <Chip key={c.id} label={c.name} icon={asIcon(c.icon)} color={c.color} selected={v.categoryId === c.id} onPress={() => set('categoryId', c.id)} />
            ))}
          </View>
          <ErrorText>{errors.category}</ErrorText>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionLabel>{v.type === 'transfer' ? 'From account' : 'Account'}</SectionLabel>
        <Segmented value={v.accountId} options={accountOptions}
          onChange={(id) => setV((p) => ({ ...p, accountId: id, toAccountId: p.type === 'transfer' ? otherAccount(id) : null }))} />
        <ErrorText>{errors.account}</ErrorText>
      </View>

      {v.type === 'transfer' ? (
        <View style={{ gap: 10 }}>
          <SectionLabel>To account</SectionLabel>
          <Segmented value={v.toAccountId ?? ''} options={accountOptions.filter((o) => o.value !== v.accountId)} onChange={(id) => set('toAccountId', id)} />
          <ErrorText>{errors.toAccount}</ErrorText>
        </View>
      ) : null}

      <Field label={remarkLabel} value={v.remark} onChangeText={(x) => set('remark', x)} placeholder="Optional" multiline maxLength={500} error={errors.remark} />
      <PrimaryButton label={submitLabel} icon="checkmark-circle" onPress={submit} />
      {footer}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  amountBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, minHeight: 76 },
  rupee: { fontSize: 32, fontWeight: '700', marginRight: 6 },
  amountInput: { flex: 1, fontSize: 36, fontWeight: '800' },
  preview: { fontSize: 14, marginTop: 6 },
});
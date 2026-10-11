import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '../src/db';
import {
  addCategory, deleteCategory, listCategories, mergeCategories, renameCategory, type CategoryWithUsage,
} from '../src/db/repo';
import { bumpLedger, useLedgerVersion } from '../src/state/ledgerStore';
import { useTheme } from '../src/theme/ThemeProvider';
import type { CategoryKind } from '../src/lib/types';
import { Badge, Card, Field, IconCircle, PrimaryButton, Screen, SectionLabel, Segmented, asIcon, errorMessage } from '../src/components/ui';

type Moving = { action: 'merge' | 'delete'; source: CategoryWithUsage };

export default function CategoriesScreen() {
  const t = useTheme();
  const v = useLedgerVersion();
  const db = getDb();
  const cats = useMemo(() => listCategories(db), [db, v]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [moving, setMoving] = useState<Moving | null>(null);

  const run = (fn: () => void): boolean => {
    try {
      fn();
      bumpLedger();
      return true;
    } catch (e) {
      Alert.alert('Could not update category', errorMessage(e));
      return false;
    }
  };

  const add = () => {
    if (run(() => addCategory(db, name, kind))) setName('');
  };

  const openActions = (c: CategoryWithUsage) =>
    Alert.alert(c.name, `${c.usage} transaction${c.usage === 1 ? '' : 's'}`, [
      {
        text: 'Rename',
        onPress: () => Alert.prompt('Rename category', `Current name: ${c.name}`, (n: string) => { run(() => renameCategory(db, c.id, n)); }, 'plain-text', c.name),
      },
      { text: 'Merge into…', onPress: () => setMoving({ action: 'merge', source: c }) },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          if (c.usage > 0) {
            setMoving({ action: 'delete', source: c });
            return;
          }
          Alert.alert(`Delete "${c.name}"?`, 'No transactions use it.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => { run(() => deleteCategory(db, c.id, null)); } },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const chooseTarget = (target: CategoryWithUsage) => {
    if (!moving) return;
    const src = moving.source;
    const verb = moving.action === 'merge' ? 'Merge' : 'Delete';
    Alert.alert(
      moving.action === 'merge' ? `Merge "${src.name}" into "${target.name}"?` : `Delete "${src.name}"?`,
      `${src.usage} transaction${src.usage === 1 ? '' : 's'} will move to "${target.name}". Amounts and dates stay the same. "${src.name}" will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: verb, style: 'destructive', onPress: () => {
            if (run(() => (moving.action === 'merge' ? mergeCategories(db, src.id, target.id) : deleteCategory(db, src.id, target.id)))) setMoving(null);
          },
        },
      ],
    );
  };

  return (
    <Screen edges={['bottom']}>
      <Card style={{ gap: 12 }}>
        <Field label="New category" value={name} onChangeText={setName} placeholder="e.g. Subscriptions" maxLength={40} />
        <Segmented<CategoryKind>
          value={kind}
          onChange={setKind}
          options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'any', label: 'Both' }]}
        />
        <PrimaryButton label="Add category" icon="add-circle" onPress={add} disabled={!name.trim()} />
      </Card>

      {moving ? (
        <Card style={{ backgroundColor: t.warningSoft, borderColor: t.warning, gap: 10 }}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>
            Tap the category that should receive the {moving.source.usage} transaction{moving.source.usage === 1 ? '' : 's'} from &quot;{moving.source.name}&quot;.
          </Text>
          <PrimaryButton label="Cancel" tone="ghost" onPress={() => setMoving(null)} />
        </Card>
      ) : (
        <Text style={{ color: t.textMuted, fontSize: 14 }}>Tap a category to rename, merge or delete it. History is never lost.</Text>
      )}

      <SectionLabel>{`${cats.length} categories`}</SectionLabel>
      <Card style={{ paddingVertical: 4 }}>
        {cats.map((c) => {
          const isSource = moving?.source.id === c.id;
          return (
            <Pressable
              key={c.id}
              disabled={isSource}
              onPress={() => (moving ? chooseTarget(c) : openActions(c))}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, ${c.usage} transactions`}
              style={({ pressed }) => [s.row, { borderBottomColor: t.border, opacity: isSource ? 0.4 : pressed ? 0.7 : 1 }]}
            >
              <IconCircle name={asIcon(c.icon)} color={c.color} size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{c.name}</Text>
                <Text style={{ color: t.textMuted, fontSize: 13 }}>{c.usage} transaction{c.usage === 1 ? '' : 's'}</Text>
              </View>
              {c.kind !== 'expense' ? <Badge label={c.kind === 'income' ? 'Income' : 'Both'} tone={c.kind === 'income' ? 'income' : 'accent'} /> : null}
              <Ionicons name={moving ? 'arrow-redo' : 'chevron-forward'} size={18} color={t.textMuted} />
            </Pressable>
          );
        })}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth },
});
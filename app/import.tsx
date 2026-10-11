import React, { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Switch, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { getDb } from '../src/db';
import { commitImport, previewImport, type ImportPreview } from '../src/db/repo';
import { bumpLedger } from '../src/state/ledgerStore';
import { useTheme } from '../src/theme/ThemeProvider';
import { TX_TYPE_LABEL } from '../src/lib/types';
import { formatDate } from '../src/lib/dates';
import { formatINR } from '../src/lib/money';
import type { ImportRow } from '../src/lib/csv';
import { Badge, Card, Chip, PrimaryButton, Screen, errorMessage } from '../src/components/ui';

export default function ImportScreen() {
  const t = useTheme();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  const stats = useMemo(() => {
    const rows = preview?.rows ?? [];
    return {
      total: rows.length,
      errors: rows.filter((r) => r.errors.length).length,
      duplicates: rows.filter((r) => r.duplicate).length,
      selected: rows.filter((r) => r.include && !r.errors.length).length,
    };
  }, [preview]);

  const pick = async () => {
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      if (asset.size && asset.size > 5_000_000) throw new Error('File is larger than 5 MB.');
      const text = await new File(asset.uri).text();
      setPreview(previewImport(getDb(), text));
      setFileName(asset.name ?? null);
      setResult(null);
    } catch (e) {
      Alert.alert('Could not read file', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const setAll = (include: boolean) =>
    setPreview((p) => p && { ...p, rows: p.rows.map((r) => (r.errors.length || r.duplicate ? r : { ...r, include })) });

  const toggleRow = (index: number) =>
    setPreview((p) => p && { ...p, rows: p.rows.map((r, i) => (i === index && !r.errors.length ? { ...r, include: !r.include } : r)) });

  const commit = () => {
    if (!preview) return;
    Alert.alert(`Import ${stats.selected} transaction${stats.selected === 1 ? '' : 's'}?`, 'New rows are added. Existing data is never changed or overwritten.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Import', onPress: () => {
          try {
            const r = commitImport(getDb(), preview, fileName);
            bumpLedger();
            setResult(r);
            setPreview(null);
          } catch (e) {
            Alert.alert('Import failed. Nothing was saved.', errorMessage(e));
          }
        },
      },
    ]);
  };

  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <Card style={{ gap: 8 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>Supported files</Text>
        <Text style={{ color: t.textMuted, fontSize: 14 }}>
          • Your spreadsheet: columns Title, Date (DD/MM/YYYY), Use, Amount, Mode (Cash/Online), Remark. Export each tab as CSV. Months are taken from each row&apos;s date, not the tab name.{'\n'}
          • PocketLedger backup files from Settings → Export full backup.
        </Text>
      </Card>
      <PrimaryButton label={busy ? 'Reading…' : 'Choose CSV file'} icon="document-attach" onPress={pick} disabled={busy} />

      {result ? (
        <Card style={{ backgroundColor: t.incomeSoft, borderColor: t.income }}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>
            Imported {result.imported} transaction{result.imported === 1 ? '' : 's'} · skipped {result.skipped}
          </Text>
        </Card>
      ) : null}

      {preview ? (
        <>
          <Card style={{ gap: 6 }}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>
              {fileName ?? 'File'} · {preview.format === 'legacy' ? 'Spreadsheet format' : 'PocketLedger backup'}
            </Text>
            <Text style={{ color: t.textMuted }}>
              {stats.total} rows · {stats.errors} with errors · {stats.duplicates} already in ledger · {stats.selected} selected
            </Text>
            {preview.previouslyImportedAt ? (
              <Text style={{ color: t.warning, fontWeight: '700' }}>
                This exact file was imported before ({new Date(preview.previouslyImportedAt).toLocaleString('en-IN')}).
              </Text>
            ) : null}
          </Card>
          <View style={s.wrap}>
            <Chip label="Select all valid" onPress={() => setAll(true)} />
            <Chip label="Select none" onPress={() => setAll(false)} />
          </View>
          <PrimaryButton label={`Import ${stats.selected} selected`} icon="checkmark-circle" tone="success" onPress={commit} disabled={stats.selected === 0} />
        </>
      ) : null}
    </View>
  );

  return (
    <Screen scroll={false} edges={['bottom']}>
      <FlatList
        data={preview?.rows ?? []}
        keyExtractor={(r, i) => String(r.line) + '-' + i}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 8 }}
        renderItem={({ item, index }) => <PreviewRow row={item} onToggle={() => toggleRow(index)} />}
      />
    </Screen>
  );
}

function PreviewRow({ row, onToggle }: { row: ImportRow; onToggle: () => void }) {
  const t = useTheme();
  const invalid = row.errors.length > 0;
  return (
    <Card style={{ gap: 6, opacity: row.include || invalid ? 1 : 0.6 }}>
      <View style={s.top}>
        <Text style={{ color: t.textMuted, fontSize: 12 }}>Line {row.line}</Text>
        <Badge label={TX_TYPE_LABEL[row.type]} tone="neutral" />
        {row.duplicate ? <Badge label="Duplicate" tone="warning" /> : null}
        <View style={{ marginLeft: 'auto' }}>
          <Switch value={row.include && !invalid} onValueChange={onToggle} disabled={invalid} accessibilityLabel={`Include line ${row.line}`} />
        </View>
      </View>
      <View style={s.top}>
        <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{row.title || '(no title)'}</Text>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>{row.amountPaise ? formatINR(row.amountPaise) : '—'}</Text>
      </View>
      <Text style={{ color: t.textMuted, fontSize: 13 }}>
        {row.occurredAt ? formatDate(row.occurredAt) : 'no date'} · {row.categoryName ?? '—'} · {row.accountKind === 'cash' ? 'Cash' : 'Online'}
        {row.remark ? ` · ${row.remark}` : ''}
      </Text>
      {row.errors.map((e) => <Text key={e} style={{ color: t.expense, fontSize: 13, fontWeight: '600' }}>✕ {e}</Text>)}
      {row.warnings.map((w) => <Text key={w} style={{ color: t.warning, fontSize: 13 }}>! {w}</Text>)}
    </Card>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
import React, { useMemo, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { getDb } from '../../src/db';
import {
  accountBalances, exportRows, getSmsToken, ledgerStats, regenerateSmsToken, updateAccountOpening, type AccountWithBalance,
} from '../../src/db/repo';
import { bumpLedger, useLedgerVersion } from '../../src/state/ledgerStore';
import { useTheme, useThemeMode, type ThemeMode } from '../../src/theme/ThemeProvider';
import { buildBackupCsv, buildLegacyCsv } from '../../src/lib/csv';
import { nowLocalIso, parseDMY, ymdToDMY } from '../../src/lib/dates';
import { formatINR, paiseToPlain, parseSignedAmount } from '../../src/lib/money';
import { Card, Field, PrimaryButton, Screen, SectionLabel, Segmented, errorMessage } from '../../src/components/ui';

export default function SettingsScreen() {
  const t = useTheme();
  const v = useLedgerVersion();
  const { mode, setMode } = useThemeMode();
  const balances = useMemo(() => accountBalances(getDb()), [v]);
  const stats = useMemo(() => ledgerStats(getDb()), [v]);
  const [token, setToken] = useState(() => getSmsToken(getDb()));
  const template = `pocketledger://sms?key=${token}&text=`;

  const exportCsv = async (kind: 'backup' | 'legacy') => {
    try {
      const rows = exportRows(getDb());
      if (!rows.length) {
        Alert.alert('Nothing to export', 'Add or import transactions first.');
        return;
      }
      const csv = kind === 'backup' ? buildBackupCsv(rows) : buildLegacyCsv(rows);
      const file = new File(Paths.cache, `pocketledger-${kind === 'backup' ? 'backup' : 'spreadsheet'}-${nowLocalIso().slice(0, 10)}.csv`);
      if (file.exists) file.delete();
      file.create();
      file.write(csv);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'The iOS share sheet is not available.');
        return;
      }
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Save or share your CSV' });
    } catch (e) {
      Alert.alert('Export failed', errorMessage(e));
    }
  };

  const regenerate = () =>
    Alert.alert('Create a new key?', 'Your existing Shortcut will stop working until you paste the new URL template into it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'New key', style: 'destructive', onPress: () => setToken(regenerateSmsToken(getDb())) },
    ]);

  return (
    <Screen title="Settings">
      <SectionLabel>Appearance</SectionLabel>
      <Segmented<ThemeMode>
        value={mode}
        onChange={setMode}
        options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
      />

      <SectionLabel>Accounts</SectionLabel>
      <Text style={{ color: t.textMuted, fontSize: 14 }}>
        Set each account&apos;s real balance and the date it applies from. Only transactions on or after that date change the balance, so imported history won&apos;t distort it. Leave the date blank to count everything.
      </Text>
      {balances.map((a) => <AccountEditor key={`${a.id}-${a.opening_balance_paise}-${a.opening_as_of}`} account={a} />)}

      <SectionLabel>Categories</SectionLabel>
      <PrimaryButton label="Manage categories" icon="pricetags" tone="ghost" onPress={() => router.push('/categories')} />

      <SectionLabel>Backup and import</SectionLabel>
      <Card style={{ gap: 10 }}>
        <PrimaryButton label="Export full backup (CSV)" icon="cloud-upload" onPress={() => exportCsv('backup')} />
        <PrimaryButton label="Export spreadsheet format" icon="grid" tone="ghost" onPress={() => exportCsv('legacy')} />
        <PrimaryButton label="Import spreadsheet / Restore backup" icon="cloud-download" tone="ghost" onPress={() => router.push('/import')} />
        <Text style={{ color: t.textMuted, fontSize: 13 }}>
          Imports only add rows; existing data is never overwritten. Export a backup regularly, especially before re-signing the app.
        </Text>
      </Card>

      <SectionLabel>SMS automation (Apple Shortcuts)</SectionLabel>
      <Card style={{ gap: 10 }}>
        <Text style={{ color: t.textMuted, fontSize: 14 }}>
          Your Shortcut opens this URL with the bank SMS appended (URL-encoded). The key stops other apps and websites from adding fake alerts.
        </Text>
        <Text selectable style={[s.code, { backgroundColor: t.cardAlt, color: t.text }]}>{template}</Text>
        <PrimaryButton label="Share URL template" icon="share-outline" onPress={() => Share.share({ message: template })} />
        <PrimaryButton label="Create new key" icon="key" tone="ghost" onPress={regenerate} />
      </Card>

      <SectionLabel>Data</SectionLabel>
      <Card style={{ gap: 6 }}>
        <Text style={{ color: t.text }}>{stats.transactions} transactions · {stats.categories} categories</Text>
        <Text style={{ color: t.text }}>{stats.pending} pending alerts · {stats.imports} imports</Text>
        <Text style={{ color: t.textMuted, fontSize: 13 }}>Everything is stored only on this iPhone in SQLite. No account, cloud or internet needed.</Text>
      </Card>

      <Text style={{ color: t.textMuted, textAlign: 'center', fontSize: 13, marginTop: 8 }}>
        PocketLedger {Constants.expoConfig?.version ?? ''}
      </Text>
    </Screen>
  );
}

function AccountEditor({ account }: { account: AccountWithBalance }) {
  const t = useTheme();
  const [opening, setOpening] = useState(paiseToPlain(account.opening_balance_paise));
  const [asOf, setAsOf] = useState(account.opening_as_of.startsWith('1970') ? '' : ymdToDMY(account.opening_as_of.slice(0, 10)));

  const save = () => {
    const paise = parseSignedAmount(opening);
    if (paise === null) {
      Alert.alert('Check the amount', 'Enter the opening balance in rupees, e.g. 4510 or 303.63.');
      return;
    }
    const ymd = asOf.trim() ? parseDMY(asOf) : '1970-01-01';
    if (!ymd) {
      Alert.alert('Check the date', 'Enter the date as DD/MM/YYYY, or leave it blank.');
      return;
    }
    try {
      updateAccountOpening(getDb(), account.id, paise, `${ymd}T00:00`);
      bumpLedger();
      Alert.alert('Saved', `${account.name} opening balance updated.`);
    } catch (e) {
      Alert.alert('Could not save', errorMessage(e));
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <View style={s.accountTop}>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>{account.name}</Text>
        <Text style={{ color: account.balance_paise < 0 ? t.expense : t.text, fontSize: 18, fontWeight: '800' }}>{formatINR(account.balance_paise)}</Text>
      </View>
      <Field label="Opening balance (₹)" value={opening} onChangeText={setOpening} keyboardType="numbers-and-punctuation" />
      <Field label="Counts from (DD/MM/YYYY)" value={asOf} onChangeText={setAsOf} placeholder="Blank = from the beginning" keyboardType="numbers-and-punctuation" maxLength={10} />
      <PrimaryButton label={`Save ${account.name}`} icon="save" tone="ghost" onPress={save} />
    </Card>
  );
}

const s = StyleSheet.create({
  code: { fontFamily: 'Menlo', fontSize: 13, padding: 12, borderRadius: 12 },
  accountTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
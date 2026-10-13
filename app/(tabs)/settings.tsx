import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { getDb } from '../../src/db';
import {
  accountBalances, exportRows, ledgerStats, updateAccountOpening, type AccountWithBalance,
} from '../../src/db/repo';
import { bumpLedger, useLedgerVersion } from '../../src/state/ledgerStore';
import { useTheme, useThemeMode, type ThemeMode } from '../../src/theme/ThemeProvider';
import { buildBackupCsv, buildLegacyCsv } from '../../src/lib/csv';
import { nowLocalIso, parseDMY, ymdToDMY } from '../../src/lib/dates';
import { formatINR, paiseToPlain, parseSignedAmount } from '../../src/lib/money';
import {
  AUTO_BACKUP_INTERVAL_DAYS, formatBackupTime, isAutoBackupEnabled, lastAutoBackupAt, listAutoBackups,
  setAutoBackupEnabled, shareAutoBackup, writeAutoBackup,
} from '../../src/lib/autoBackup';
import { Card, Field, PrimaryButton, Screen, SectionLabel, Segmented, errorMessage } from '../../src/components/ui';
import { AccountEditor } from '../../src/components/AccountEditor';

export default function SettingsScreen() {
  const t = useTheme();
  const v = useLedgerVersion();
  const { mode, setMode } = useThemeMode();
  const balances = useMemo(() => accountBalances(getDb()), [v]);
  const stats = useMemo(() => ledgerStats(getDb()), [v]);
  const [autoOn, setAutoOn] = useState(() => isAutoBackupEnabled(getDb()));
  const [autoLast, setAutoLast] = useState(() => lastAutoBackupAt(getDb()));
  const autoBackups = useMemo(() => listAutoBackups(), [v, autoLast]);

  const toggleAuto = (on: boolean) => {
    setAutoBackupEnabled(getDb(), on);
    setAutoOn(on);
  };

  const backupNow = () => {
    try {
      const name = writeAutoBackup(getDb());
      setAutoLast(lastAutoBackupAt(getDb()));
      Alert.alert(
        name ? 'Backup created' : 'Nothing to back up',
        name
          ? `Saved as ${name}. Only the newest 2 automatic backups are kept; older ones are deleted automatically.`
          : 'Add or import transactions first.',
      );
    } catch (e) {
      Alert.alert('Backup failed', errorMessage(e));
    }
  };

  const shareBackup = async (name: string) => {
    try {
      if (!(await shareAutoBackup(name))) {
        Alert.alert('Backup not found', 'The file is no longer on this phone.');
      }
    } catch (e) {
      Alert.alert('Could not share', errorMessage(e));
    }
  };

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
        Set each account&apos;s real balance and the date it applies from. Only transactions on or after that date change the balance, so imported history won&apos;t distort it. Turn on Count all history to include everything.
      </Text>
      {balances.map((a) => <AccountEditor key={`${a.id}-${a.opening_balance_paise}-${a.opening_as_of}`} account={a} />)}

      <SectionLabel>Categories</SectionLabel>
      <PrimaryButton label="Manage categories" icon="pricetags" tone="ghost" onPress={() => router.push('/categories')} />

      <SectionLabel>Backup and import</SectionLabel>
      <Card style={{ gap: 10 }}>
        <View style={s.autoRow}>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '700', flex: 1 }}>Automatic backup</Text>
          <Switch value={autoOn} onValueChange={toggleAuto} trackColor={{ true: t.accent }} accessibilityLabel="Automatic backup" />
        </View>
        <Text style={{ color: t.textMuted, fontSize: 13 }}>
          Every {AUTO_BACKUP_INTERVAL_DAYS} days the app silently saves a full backup on this iPhone. Only the last 2 backups are kept; older ones are deleted.
        </Text>
        <Text style={{ color: t.textMuted, fontSize: 13 }}>Last automatic backup: {formatBackupTime(autoLast)}</Text>
        {autoOn ? autoBackups.map((name) => (
          <PrimaryButton key={name} label={`Share ${name.replace('auto-backup-', '').replace('.csv', '')}`} icon="share-outline" tone="ghost" onPress={() => shareBackup(name)} />
        )) : null}
        <PrimaryButton label="Back up now" icon="save" tone="ghost" onPress={backupNow} />
        <PrimaryButton label="Export full backup (CSV)" icon="cloud-upload" onPress={() => exportCsv('backup')} />
        <PrimaryButton label="Export spreadsheet format" icon="grid" tone="ghost" onPress={() => exportCsv('legacy')} />
        <PrimaryButton label="Import spreadsheet / Restore backup" icon="cloud-download" tone="ghost" onPress={() => router.push('/import')} />
        <Text style={{ color: t.textMuted, fontSize: 13 }}>
          Imports only add rows; existing data is never overwritten. Keep a copy outside the app too, especially before re-signing — automatic backups live inside the app&apos;s storage and are lost on uninstall.
        </Text>
      </Card>

      <Card style={{ gap: 6 }}>
        <Text style={{ color: t.text }}>{stats.transactions} transactions · {stats.categories} categories</Text>
        <Text style={{ color: t.text }}>{stats.imports} imports</Text>
        <Text style={{ color: t.textMuted, fontSize: 13 }}>Everything is stored only on this iPhone in SQLite. No account, cloud or internet needed.</Text>
      </Card>

      <Text style={{ color: t.textMuted, textAlign: 'center', fontSize: 13, marginTop: 8 }}>
        PocketLedger {Constants.expoConfig?.version ?? ''}
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  accountTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
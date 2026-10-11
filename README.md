# PocketLedger

Offline iPhone expense tracker (Expo SDK 57, React Native, TypeScript, SQLite). Money is stored as integer paise.

## Develop on Windows
    npm ci
    npm run typecheck
    npm test
    npx expo install --check

## Build the iPhone app
Push to `main` (or run the "iOS unsigned IPA" workflow manually). Download the
`PocketLedger-unsigned-ipa` artifact, unzip it, and sign/install `PocketLedger-unsigned.ipa` with Sideloadly.

## SMS automation
Set up an Apple Shortcuts Message automation (see Settings → SMS automation). It silently
queues each bank SMS into the clipboard and shows a "Transaction detected" notification —
**the app never opens by itself**. Open PocketLedger whenever you're free; queued alerts are
picked up automatically and sit in the Review tab until you confirm them all at once.

## Data safety
Everything is on the phone only. Export a backup CSV regularly (Settings → Export full backup).
Keep the same bundle ID when re-signing so your data is preserved.
// Usage: node scripts/setup-project.js com.yourname.pocketledger
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bundleId = process.argv[2];
if (!bundleId || !/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+){2,}$/.test(bundleId)) {
  console.error('Pass a bundle ID like com.yourname.pocketledger');
  process.exit(1);
}

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.main = 'expo-router/entry';
pkg.scripts = {
  ...pkg.scripts,
  start: 'expo start',
  typecheck: 'tsc --noEmit',
  test: 'jest',
  check: 'npm run typecheck && npm test',
  'deps:check': 'expo install --check',
};
pkg.jest = { testEnvironment: 'node', testMatch: ['<rootDir>/__tests__/**/*.test.ts'] };
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('updated package.json');

const app = {
  expo: {
    name: 'PocketLedger',
    slug: 'pocketledger',
    version: '1.0.0',
    scheme: 'pocketledger',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    platforms: ['ios'],
    ios: {
      bundleIdentifier: bundleId,
      buildNumber: '1',
      supportsTablet: false,
      infoPlist: { ITSAppUsesNonExemptEncryption: false },
    },
    plugins: ['expo-router'],
  },
};
if (fs.existsSync(path.join(root, 'assets', 'icon.png'))) app.expo.icon = './assets/icon.png';
fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify(app, null, 2) + '\n');
console.log('wrote app.json with bundle ID ' + bundleId);
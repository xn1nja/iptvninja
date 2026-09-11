#!/usr/bin/env node
/**
 * Fails if anything under /core imports a platform SDK.
 *
 * The Tizen/webOS client planned later consumes this package unchanged, so the
 * "core is plain TypeScript" rule is enforced rather than merely documented.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN = [
  'react',
  'react-dom',
  'react-native',
  'react-native-web',
  '@react-navigation',
  'expo',
  '@react-native-async-storage/async-storage',
];

// `fileURLToPath`, not `new URL(...).pathname`: on Windows the latter yields
// "/C:/..." with a leading slash, which `join` then turns into "C:\C:\...".
const PACKAGE_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const SRC = join(PACKAGE_ROOT, 'src');

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (entry.endsWith('.ts')) files.push(full);
  }
  return files;
}

const importPattern = /(?:from\s+|import\s+|require\(\s*)['"]([^'"]+)['"]/g;
const violations = [];

for (const file of walk(SRC)) {
  const source = readFileSync(file, 'utf8');
  let match;
  while ((match = importPattern.exec(source)) !== null) {
    const specifier = match[1];
    if (specifier.startsWith('.')) continue;
    const root = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0];
    if (FORBIDDEN.includes(root) || FORBIDDEN.includes(specifier)) {
      violations.push(`${relative(PACKAGE_ROOT, file)}: imports "${specifier}"`);
    }
  }
}

if (violations.length > 0) {
  console.error('core must stay platform-agnostic, but found:\n  ' + violations.join('\n  '));
  console.error('\nMove this code into /mobile instead.');
  process.exit(1);
}

console.log('core boundary OK: no React / React Native / Expo imports.');

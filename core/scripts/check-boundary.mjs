#!/usr/bin/env node
/**
 * Fails if anything under /core imports a platform SDK.
 *
 * The Tizen/webOS client planned later consumes this package unchanged, so the
 * "core is plain TypeScript" rule is enforced rather than merely documented.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = [
  'react',
  'react-dom',
  'react-native',
  'react-native-web',
  '@react-navigation',
  'expo',
  '@react-native-async-storage/async-storage',
];

const SRC = new URL('../src/', import.meta.url).pathname;

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
      violations.push(`${file}: imports "${specifier}"`);
    }
  }
}

if (violations.length > 0) {
  console.error('core must stay platform-agnostic, but found:\n  ' + violations.join('\n  '));
  console.error('\nMove this code into /mobile instead.');
  process.exit(1);
}

console.log('core boundary OK: no React / React Native / Expo imports.');

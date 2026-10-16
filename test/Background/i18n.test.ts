/**
 * @jest-environment jsdom
 */
/*
 * Zed Attack Proxy (ZAP) and its related source files.
 *
 * ZAP is an HTTP/HTTPS proxy for assessing web application security.
 *
 * Copyright 2026 The ZAP Development Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as fs from 'fs';
import * as path from 'path';
import i18n from '../../source/utils/i18n';

const root = path.join(__dirname, '..', '..');

function read(file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function matches(text: string, pattern: RegExp): string[] {
  return Array.from(text.matchAll(pattern), (m) => m[1]);
}

test('every key used by the script viewer page has a translation', () => {
  const html = read('views/script.html');
  const keys = [
    ...matches(html, /data-i18n="([^"]+)"/g),
    ...matches(html, /data-i18n-title="([^"]+)"/g),
  ];
  expect(keys.length).toBeGreaterThan(10);
  expect(keys.filter((key) => !i18n.exists(key))).toEqual([]);
});

// Keys are used in t('...') calls and as values such as labelKey and errorKey
const SOURCES = [
  'source/ScriptView/index.ts',
  'source/ScriptView/dialogs.ts',
  'source/ScriptView/player.ts',
  'source/ContentScript/replayer.ts',
  'source/utils/zestEdit.ts',
  'source/utils/zestSummary.ts',
  'source/Popup/index.tsx',
];

test.each(SOURCES)('every key used by %s has a translation', (file) => {
  const text = read(file);
  const keys = [
    ...matches(text, /\bt\('([\w.]+)'/g),
    ...matches(text, /'((?:script|summary|edit)\.[\w.]+)'/g),
  ];
  expect(
    keys.filter((key) => !key.endsWith('.html') && !i18n.exists(key))
  ).toEqual([]);
});

test('translations are returned, not the keys', () => {
  expect(i18n.t('script.new')).toBe('New');
  expect(i18n.t('script.newMessage', {count: 3})).toContain('3 statement(s)');
});

test('every translation is used', () => {
  const used = [...SOURCES, 'views/script.html'].map(read).join('\n');
  const missing: string[] = [];
  const walk = (node: Record<string, unknown>, prefix: string): void => {
    Object.entries(node).forEach(([key, value]) => {
      const full = prefix + key;
      if (typeof value === 'object' && value !== null) {
        walk(value as Record<string, unknown>, `${full}.`);
      } else if (!used.includes(full)) {
        missing.push(full);
      }
    });
  };
  walk(i18n.getResourceBundle('en', 'translation'), '');
  // Keys of the popup are used with the short name e.g. i18n.t('start')
  expect(missing).toEqual([]);
});

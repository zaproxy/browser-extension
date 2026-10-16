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

beforeAll(() => {
  document.body.innerHTML = fs.readFileSync(
    path.join(__dirname, '..', '..', 'views', 'popup.html'),
    'utf8'
  );
});

test('the view script control can be used from the keyboard', () => {
  const control = document.getElementById('view-btn') as HTMLElement;

  // A button can be focused and is activated by Enter and Space
  expect(control.tagName).toBe('BUTTON');
  expect(control.getAttribute('type')).toBe('button');
  expect(control.querySelector('img.view')).not.toBeNull();
  // The name comes from the button, which is given one when the popup is shown
  expect(control.querySelector('img.view')?.getAttribute('alt')).toBe('');
});

describe('where the buttons are', () => {
  const scss = fs.readFileSync(
    path.join(__dirname, '..', '..', 'source', 'Popup', 'styles.scss'),
    'utf8'
  );

  // The row and column that a button is in, from the styles of its class
  function place(selector: string): {row: number; column: number} {
    const start = scss.indexOf(`\n${selector} {`);
    const block = scss.slice(start, scss.indexOf('&__settings', start));
    return {
      row: Number(/grid-row:\s*(\d+)/.exec(block)?.[1]),
      column: Number(/grid-column:\s*(\d+)/.exec(block)?.[1]),
    };
  }

  test('the config button is at the top left, on the same level as help', () => {
    expect(place('.setting-icon')).toEqual({row: 1, column: 1});
    expect(place('.help-icon').row).toBe(place('.setting-icon').row);
  });

  test('the view script button is below the config button', () => {
    expect(place('.view-icon')).toEqual({row: 2, column: 1});
  });

  test('the buttons are all in the page', () => {
    ['configure-btn', 'view-btn', 'help-btn', 'record-btn'].forEach((id) =>
      expect(document.getElementById(id)).not.toBeNull()
    );
  });
});

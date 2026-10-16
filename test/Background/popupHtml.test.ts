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

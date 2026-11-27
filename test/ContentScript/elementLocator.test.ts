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
import {ElementLocator} from '../../source/types/zestScript/ZestStatement';

describe('ElementLocator.equals', () => {
  test('is true for the same type, element and shadow path', () => {
    expect(
      new ElementLocator('cssSelector', '#f', ['#a', '#b']).equals(
        new ElementLocator('cssSelector', '#f', ['#a', '#b'])
      )
    ).toBe(true);
  });

  test('is false for a different element', () => {
    expect(
      new ElementLocator('cssSelector', '#f').equals(
        new ElementLocator('cssSelector', '#g')
      )
    ).toBe(false);
  });

  test('is false for a different type', () => {
    expect(
      new ElementLocator('id', 'f').equals(new ElementLocator('name', 'f'))
    ).toBe(false);
  });

  test('is false for a different shadow path', () => {
    expect(
      new ElementLocator('cssSelector', '#f', ['#a']).equals(
        new ElementLocator('cssSelector', '#f', ['#b'])
      )
    ).toBe(false);
    expect(
      new ElementLocator('cssSelector', '#f', ['#a']).equals(
        new ElementLocator('cssSelector', '#f')
      )
    ).toBe(false);
  });
});

/**
 * @jest-environment jsdom
 */
/*
 * Zed Attack Proxy (ZAP) and its related source files.
 *
 * ZAP is an HTTP/HTTPS proxy for assessing web application security.
 *
 * Copyright 2023 The ZAP Development Team
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
import {TextEncoder, TextDecoder} from 'util';
import * as src from '../../source/Background/index';

console.log(src);
console.log(TextEncoder);
console.log(TextDecoder);

jest.mock('webextension-polyfill');

// These lines must appear before the JSDOM import
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;

// eslint-disable-next-line import/order,import/first
import Browser from 'webextension-polyfill';

test('Report storage', () => {
  // Given

  const setCookie = Browser.cookies.set({
    url: 'https://www.example.com/',
    name: 'ZAP',
    value: 'Proxy',
    domain: 'example.com',
    path: '/',
  });

  setCookie.then((newCookie) => {
    console.log(newCookie);
    // When
    const success = src.reportCookies(
      newCookie,
      'http://localhost:8080/',
      'secretKey'
    );
    // Then
    expect(success).toBe(true);
  });
});

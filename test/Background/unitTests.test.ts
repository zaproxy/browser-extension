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
import {
  DEFAULT_WINDOW_HANDLE,
  RESET_ZEST_SCRIPT,
  ZAP_REGISTER_POPUP,
} from '../../source/utils/constants';

console.log(src);
console.log(TextEncoder);
console.log(TextDecoder);

jest.mock('webextension-polyfill');

// These lines must appear before the JSDOM import
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;

// eslint-disable-next-line import/order,import/first
import Browser from 'webextension-polyfill';

global.fetch = jest.fn().mockResolvedValue({ok: true});

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

describe('ZAP_REGISTER_POPUP handler', () => {
  // eslint-disable-next-line @typescript-eslint/ban-types
  let onMessageHandler: Function;

  beforeAll(() => {
    const addListenerMock = Browser.runtime.onMessage
      .addListener as jest.Mock;
    onMessageHandler = addListenerMock.mock.calls[0][0];
  });

  beforeEach(async () => {
    (Browser.storage.sync.get as jest.Mock).mockResolvedValue({
      zapurl: 'http://zap/',
      zapkey: 'testkey',
      zapenable: false,
    });
    // Reset zest script state between tests (resets counter and popup map)
    await onMessageHandler({type: RESET_ZEST_SCRIPT}, {});
  });

  test('assigns a new window handle for a new popup tab', async () => {
    const result = await onMessageHandler(
      {type: ZAP_REGISTER_POPUP, url: 'https://example.com/popup'},
      {tab: {id: 42}}
    );
    expect(result).toBe('windowHandle2');
  });

  test('returns cached handle for the same popup tab on repeated calls', async () => {
    const first = await onMessageHandler(
      {type: ZAP_REGISTER_POPUP, url: 'https://example.com/popup'},
      {tab: {id: 99}}
    );
    const second = await onMessageHandler(
      {type: ZAP_REGISTER_POPUP, url: 'https://example.com/popup'},
      {tab: {id: 99}}
    );
    expect(first).toBe('windowHandle2');
    expect(second).toBe('windowHandle2');
  });

  test('assigns different handles for different popup tabs', async () => {
    const first = await onMessageHandler(
      {type: ZAP_REGISTER_POPUP, url: 'https://example.com/popup1'},
      {tab: {id: 10}}
    );
    const second = await onMessageHandler(
      {type: ZAP_REGISTER_POPUP, url: 'https://example.com/popup2'},
      {tab: {id: 20}}
    );
    expect(first).toBe('windowHandle2');
    expect(second).toBe('windowHandle3');
  });

  test('returns default handle when sender has no tab id', async () => {
    const result = await onMessageHandler(
      {type: ZAP_REGISTER_POPUP, url: 'https://example.com/popup'},
      {}
    );
    expect(result).toBe(DEFAULT_WINDOW_HANDLE);
  });

  test('handles invalid popup URL gracefully', async () => {
    const result = await onMessageHandler(
      {type: ZAP_REGISTER_POPUP, url: 'not-a-valid-url'},
      {tab: {id: 55}}
    );
    expect(result).toBe('windowHandle2');
  });
});

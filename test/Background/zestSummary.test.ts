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
import {summarizeZestScript} from '../../source/utils/zestSummary';

test('summarizes recorded statements', () => {
  const script = JSON.stringify({
    statements: [
      {
        index: 1,
        elementType: 'ZestClientLaunch',
        browserType: 'Chrome',
        url: 'http://a.com',
      },
      {
        index: 2,
        elementType: 'ZestClientElementSendKeys',
        type: 'id',
        element: 'user',
        value: 'bob',
      },
      {
        index: 3,
        elementType: 'ZestClientElementClick',
        type: 'cssSelector',
        element: '.go',
        enabled: false,
      },
      {index: 4, elementType: 'ZestClientSwitchToFrame', parent: true},
      {
        index: 5,
        elementType: 'ZestClientWindowClose',
        windowHandle: 'windowHandle1',
      },
    ],
  });
  expect(summarizeZestScript(script)).toEqual([
    {index: 1, enabled: true, summary: 'Launch Chrome http://a.com'},
    {index: 2, enabled: true, summary: 'Send keys "bob" to element id: user'},
    {index: 3, enabled: false, summary: 'Click element cssSelector: .go'},
    {index: 4, enabled: true, summary: 'Switch to frame parent'},
    {index: 5, enabled: true, summary: 'Close window windowHandle1'},
  ]);
});

test('handles empty script', () => {
  expect(summarizeZestScript('{}')).toEqual([]);
});

test('summarizes a statement that finds a link by part of its text', () => {
  const script = JSON.stringify({
    statements: [
      {
        index: 1,
        elementType: 'ZestClientElementClick',
        type: 'partialLinkText',
        element: 'Sign in',
      },
    ],
  });

  expect(summarizeZestScript(script)).toEqual([
    {
      index: 1,
      enabled: true,
      summary: 'Click element partialLinkText: Sign in',
    },
  ]);
});

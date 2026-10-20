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
import {
  applyFieldValues,
  getStatementType,
  isReplayableUrl,
  LOCATOR_TYPES,
  moveItem,
  newStatement,
  parseZestScript,
  toFieldValues,
  StatementTypeDef,
} from '../../source/utils/zestEdit';

function typeDef(elementType: string): StatementTypeDef {
  const def = getStatementType(elementType);
  if (!def) {
    throw new Error(`No such statement type: ${elementType}`);
  }
  return def;
}

test('new statements have defaults', () => {
  expect(newStatement('ZestClientElementClick')).toEqual({
    windowHandle: 'windowHandle1',
    type: 'id',
    element: '',
    waitForMsec: 0,
    index: 0,
    enabled: true,
    elementType: 'ZestClientElementClick',
  });
});

test('applies values, keeping hidden fields', () => {
  const def = typeDef('ZestClientElementSendKeys');
  const stmt = {...newStatement('ZestClientElementSendKeys'), index: 3};
  const values = toFieldValues(def, stmt);
  values.element = 'user';
  values.value = 'bob';
  values.waitForMsec = '25';
  values.enabled = false;
  const {statement, errors} = applyFieldValues(def, stmt, values);
  expect(errors).toEqual([]);
  expect(statement).toMatchObject({
    index: 3,
    windowHandle: 'windowHandle1',
    element: 'user',
    value: 'bob',
    waitForMsec: 25,
    enabled: false,
  });
});

test('reports validation errors', () => {
  const def = typeDef('ZestClientElementClick');
  const stmt = newStatement('ZestClientElementClick');
  const values = toFieldValues(def, stmt);
  values.waitForMsec = 'abc';
  const {statement, errors} = applyFieldValues(def, stmt, values);
  expect(statement).toBeUndefined();
  expect(errors).toEqual([
    'Locator is required',
    'Wait for (ms) must be a whole number',
  ]);
});

test('frame index -1 means parent', () => {
  const def = typeDef('ZestClientSwitchToFrame');
  const stmt = newStatement('ZestClientSwitchToFrame');
  const values = toFieldValues(def, stmt);
  values.frameIndex = '-1';
  expect(applyFieldValues(def, stmt, values).statement?.parent).toBe(true);
});

test('moves items', () => {
  expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
  expect(moveItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
  expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
});

test('parses a Zest script', () => {
  const text = JSON.stringify({
    title: 'My script',
    statements: [{elementType: 'ZestComment', comment: 'hi'}],
  });
  expect(parseZestScript(text)).toEqual({
    title: 'My script',
    statements: [{elementType: 'ZestComment', comment: 'hi'}],
  });
});

test('rejects things that are not Zest scripts', () => {
  expect(() => parseZestScript('nope')).toThrow('not valid JSON');
  expect(() => parseZestScript('{}')).toThrow('not a Zest script');
  expect(() => parseZestScript('{"statements": [1]}')).toThrow(
    'not a Zest script'
  );
  expect(() => parseZestScript('null')).toThrow('not a Zest script');
});

test('only http and https URLs can be launched', () => {
  expect(isReplayableUrl('https://example.com/a?b=c')).toBe(true);
  expect(isReplayableUrl('http://localhost:8080')).toBe(true);
  // eslint-disable-next-line no-script-url
  expect(isReplayableUrl('javascript:alert(1)')).toBe(false);
  expect(isReplayableUrl('file:///etc/passwd')).toBe(false);
  expect(isReplayableUrl('example.com')).toBe(false);
});

test('launch URL is validated when editing', () => {
  const def = typeDef('ZestClientLaunch');
  const stmt = newStatement('ZestClientLaunch');
  const values = toFieldValues(def, stmt);
  values.url = 'file:///tmp/a.html';
  expect(applyFieldValues(def, stmt, values).errors).toEqual([
    'URL must be a valid http or https URL',
  ]);
  values.url = 'https://example.com';
  expect(applyFieldValues(def, stmt, values).errors).toEqual([]);
});

describe('script settings that are not kept', () => {
  const script = (extra: Record<string, unknown>): string =>
    JSON.stringify({
      title: 'T',
      statements: [{elementType: 'ZestComment', comment: 'hi'}],
      ...extra,
    });

  test('the defaults are accepted', () => {
    expect(() =>
      parseZestScript(
        script({
          description: '',
          prefix: '',
          type: 'StandAlone',
          parameters: {tokenStart: '{{', tokenEnd: '}}', tokens: {}},
          authentication: [],
          options: {statementDelay: '500'},
        })
      )
    ).not.toThrow();
  });

  test.each([
    ['a type other than standalone', {type: 'Targeted'}, 'script type'],
    ['a description', {description: 'About'}, 'description'],
    ['a prefix', {prefix: 'https://example.com'}, 'prefix'],
    [
      'token definitions',
      {parameters: {tokenStart: '{{', tokenEnd: '}}', tokens: {a: 'b'}}},
      'parameters',
    ],
    [
      'other token delimiters',
      {parameters: {tokenStart: '<<', tokenEnd: '>>', tokens: {}}},
      'parameters',
    ],
    ['authentication', {authentication: [{a: 1}]}, 'authentication'],
  ])('rejects %s', (_name, extra, feature) => {
    expect(() => parseZestScript(script(extra))).toThrow(
      `The script uses features that cannot be preserved (${feature})`
    );
  });

  test('lists everything that cannot be kept', () => {
    expect(() =>
      parseZestScript(script({description: 'About', authentication: [{a: 1}]}))
    ).toThrow('(description, authentication)');
  });
});

describe('line breaks', () => {
  test.each(['ZestComment', 'ZestClientElementSendKeys'])(
    'are kept when editing a %s',
    (elementType) => {
      const def = typeDef(elementType);
      const field = elementType === 'ZestComment' ? 'comment' : 'value';
      const stmt = {
        ...newStatement(elementType),
        [field]: 'line 1\nline 2\r\nline 3',
      };
      const values = toFieldValues(def, stmt);
      // The locator of an element statement is required
      if ('element' in stmt) {
        values.element = 'target';
      }
      values.enabled = false;

      const result = applyFieldValues(def, stmt, values);

      expect(result.statement?.[field]).toBe('line 1\nline 2\r\nline 3');
      expect(result.statement?.enabled).toBe(false);
    }
  );

  test('the fields that can contain them are multiline', () => {
    const kinds = (elementType: string): Record<string, string> =>
      Object.fromEntries(
        typeDef(elementType).fields.map((f) => [f.key, f.kind])
      );
    expect(kinds('ZestComment').comment).toBe('multiline');
    expect(kinds('ZestClientElementSendKeys').value).toBe('multiline');
    expect(kinds('ZestClientLaunch').url).toBe('text');
  });
});

describe('the locator types', () => {
  test('include partialLinkText, next to linkText', () => {
    expect(LOCATOR_TYPES).toContain('partialLinkText');
    expect(LOCATOR_TYPES.indexOf('partialLinkText')).toBe(
      LOCATOR_TYPES.indexOf('linkText') + 1
    );
  });

  test('are all different', () => {
    expect(new Set(LOCATOR_TYPES).size).toBe(LOCATOR_TYPES.length);
  });

  test.each(['ZestClientElementClick', 'ZestClientElementSendKeys'])(
    'a %s can use partialLinkText',
    (elementType) => {
      const def = typeDef(elementType);
      const stmt = {...newStatement(elementType), type: 'partialLinkText'};
      const values = toFieldValues(def, stmt);
      values.element = 'Sign in';

      const result = applyFieldValues(def, stmt, values);

      expect(result.errors).toEqual([]);
      expect(result.statement).toMatchObject({
        type: 'partialLinkText',
        element: 'Sign in',
      });
    }
  );

  test('a locator is still needed with partialLinkText', () => {
    const def = typeDef('ZestClientElementClick');
    const stmt = {
      ...newStatement('ZestClientElementClick'),
      type: 'partialLinkText',
    };

    expect(
      applyFieldValues(def, stmt, toFieldValues(def, stmt)).errors
    ).toEqual(['Locator is required']);
  });
});

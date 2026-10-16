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
import Browser from 'webextension-polyfill';
import {ZestScript} from '../../source/types/zestScript/ZestScript';

jest.mock('webextension-polyfill', () => ({
  __esModule: true,
  default: {storage: {sync: {get: jest.fn()}}},
}));

function replace(script: ZestScript, statements: unknown): void {
  const prepared = script.prepareStatements(statements);
  script.restoreStatements(prepared.statements, prepared.curIndex);
}

test('preparing replacement statements does not change the script', () => {
  const script = new ZestScript();
  script.addStatement(JSON.stringify({elementType: 'ZestComment'}));

  const prepared = script.prepareStatements([
    {elementType: 'ZestComment'},
    {elementType: 'ZestComment'},
  ]);

  expect(prepared.statements).toHaveLength(2);
  expect(prepared.curIndex).toBe(3);
  expect(script.getZestStatementCount()).toBe(1);
  expect(script.getCurIndex()).toBe(2);
});

test('replaces and renumbers the statements', () => {
  const script = new ZestScript();
  script.addStatement(JSON.stringify({elementType: 'ZestComment'}));

  replace(script, [
    {index: 7, elementType: 'ZestComment', comment: 'a'},
    {elementType: 'ZestComment', comment: 'b', extra: true},
  ]);

  expect(script.getStatements().map((s) => JSON.parse(s))).toEqual([
    {index: 1, elementType: 'ZestComment', comment: 'a'},
    {index: 2, elementType: 'ZestComment', comment: 'b', extra: true},
  ]);
  expect(script.getCurIndex()).toBe(3);
  expect(script.getZestStatementCount()).toBe(2);
});

test('statements added afterwards continue the numbering', () => {
  const script = new ZestScript();
  replace(script, [{elementType: 'ZestComment'}]);

  const added = JSON.parse(
    script.addStatement(JSON.stringify({elementType: 'ZestComment'}))
  );

  expect(added.index).toBe(2);
});

test('replacing with an empty list clears the script', () => {
  const script = new ZestScript();
  script.addStatement(JSON.stringify({elementType: 'ZestComment'}));

  replace(script, []);

  expect(script.getZestStatementCount()).toBe(0);
  expect(script.getCurIndex()).toBe(1);
});

test.each([
  ['not a list', 'nope'],
  ['missing', undefined],
  ['null', null],
  ['an object', {a: 1}],
  ['a list of non-objects', [1, 2]],
  ['a list containing null', [{a: 1}, null]],
  ['a list containing a list', [[1]]],
])('rejects statements that are %s', (_name, statements) => {
  const script = new ZestScript();
  script.addStatement(JSON.stringify({elementType: 'ZestComment'}));

  expect(() => script.prepareStatements(statements)).toThrow(
    'The statements must be a list of objects'
  );
  // and leaves the script as it was
  expect(script.getZestStatementCount()).toBe(1);
});

describe('getting the script', () => {
  const get = Browser.storage.sync.get as jest.Mock;

  test('returns the script with the stored name and delay', async () => {
    get.mockResolvedValueOnce({zapscriptname: 'Mine', zapstatementdelay: 250});
    const script = new ZestScript();
    script.addStatement(JSON.stringify({elementType: 'ZestComment'}));

    const msg = await script.getZestScript();

    expect(msg.title).toBe('Mine');
    expect(msg.statementCount).toBe(1);
    expect(JSON.parse(msg.script).options).toEqual({statementDelay: '250'});
  });

  test('fails if the settings cannot be read, rather than never finishing', async () => {
    get.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(new ZestScript().getZestScript()).rejects.toThrow(
      'storage unavailable'
    );
  });
});

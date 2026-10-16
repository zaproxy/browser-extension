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
import {TextEncoder, TextDecoder} from 'util';
import * as src from '../../source/Background/index';

console.log(src);

jest.mock('webextension-polyfill');

// These lines must appear before the JSDOM import
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;

// eslint-disable-next-line import/order,import/first
import Browser from 'webextension-polyfill';

type Listener = (message: unknown, sender: unknown) => Promise<unknown>;

const listener = (Browser.runtime.onMessage.addListener as jest.Mock).mock
  .calls[0][0] as Listener;

const comment = (text: string): Record<string, unknown> => ({
  elementType: 'ZestComment',
  comment: text,
});

async function statementCount(): Promise<number> {
  const msg = (await listener({type: 'getZestScript'}, {})) as {
    statementCount: number;
  };
  return msg.statementCount;
}

// Recording sends statements to ZAP
global.fetch = jest.fn();

const set = Browser.storage.local.set as jest.Mock;

(Browser.storage.sync.get as jest.Mock).mockResolvedValue({
  zapurl: 'http://zap/',
  zapkey: 'key',
});

beforeEach(async () => {
  set.mockClear();
  await listener({type: 'resetZestScript'}, {});
  set.mockClear();
});

test('replacing the statements stores and then uses them', async () => {
  await listener(
    {type: 'setZestStatements', data: [comment('a'), comment('b')]},
    {}
  );

  expect(await statementCount()).toBe(2);
  const stored = set.mock.calls[0][0];
  expect(stored.zestCurIndex).toBe(3);
  expect(stored.zestStatements.map((s: string) => JSON.parse(s).index)).toEqual(
    [1, 2]
  );
});

test('the script is unchanged if the new statements cannot be stored', async () => {
  await listener({type: 'setZestStatements', data: [comment('a')]}, {});
  set.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));

  await expect(
    listener(
      {type: 'setZestStatements', data: [comment('x'), comment('y')]},
      {}
    )
  ).rejects.toThrow('QUOTA_BYTES quota exceeded');

  expect(await statementCount()).toBe(1);
});

test('invalid statements are rejected without storing anything', async () => {
  await listener({type: 'setZestStatements', data: [comment('a')]}, {});
  set.mockClear();

  await expect(
    listener({type: 'setZestStatements', data: 'nope'}, {})
  ).rejects.toThrow('The statements must be a list of objects');

  expect(set).not.toHaveBeenCalled();
  expect(await statementCount()).toBe(1);
});

describe('changes made while a save is being stored', () => {
  const tick = (): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

  // Makes the next write to storage wait until the returned function is called
  function holdNextWrite(): () => void {
    let release: () => void = () => {};
    set.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    return () => release();
  }

  const lastStored = (): {zestStatements: string[]; zestCurIndex: number} =>
    set.mock.calls[set.mock.calls.length - 1][0];

  test('a recorded statement is not lost', async () => {
    const release = holdNextWrite();
    const saving = listener(
      {type: 'setZestStatements', data: [comment('a'), comment('b')]},
      {}
    );
    const recorded = listener(
      {type: 'zestScript', data: JSON.stringify(comment('recorded'))},
      {}
    );
    await tick();

    release();
    await Promise.all([saving, recorded]);

    expect(await statementCount()).toBe(3);
    // and what is stored is the same as what is in memory
    expect(lastStored().zestStatements).toHaveLength(3);
    expect(lastStored().zestCurIndex).toBe(4);
  });

  test('a reset is not undone', async () => {
    const release = holdNextWrite();
    const saving = listener(
      {type: 'setZestStatements', data: [comment('a'), comment('b')]},
      {}
    );
    const reset = listener({type: 'resetZestScript'}, {});
    await tick();

    release();
    await Promise.all([saving, reset]);

    expect(await statementCount()).toBe(0);
    expect(lastStored().zestStatements).toEqual([]);
  });

  test('reading waits for a save that is being stored', async () => {
    const release = holdNextWrite();
    const saving = listener(
      {type: 'setZestStatements', data: [comment('a'), comment('b')]},
      {}
    );
    const reading = statementCount();
    await tick();

    release();
    await saving;

    expect(await reading).toBe(2);
  });

  test('a failed save does not stop later changes', async () => {
    set.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));
    const failing = listener(
      {type: 'setZestStatements', data: [comment('a')]},
      {}
    );
    const recorded = listener(
      {type: 'zestScript', data: JSON.stringify(comment('recorded'))},
      {}
    );

    await expect(failing).rejects.toThrow('QUOTA_BYTES');
    await recorded;

    expect(await statementCount()).toBe(1);
  });
});

describe('a failed read of the settings', () => {
  const syncGet = Browser.storage.sync.get as jest.Mock;

  test('does not stop later changes', async () => {
    // The first read is for the zap settings, and the second is for the script
    syncGet
      .mockResolvedValueOnce({zapurl: 'http://zap/', zapkey: 'key'})
      .mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(listener({type: 'getZestScript'}, {})).rejects.toThrow(
      'storage unavailable'
    );

    // Everything queued after it still runs
    await listener({type: 'setZestStatements', data: [comment('a')]}, {});
    await listener(
      {type: 'zestScript', data: JSON.stringify(comment('recorded'))},
      {}
    );
    expect(await statementCount()).toBe(2);
  });

  test('does not stop changes that were already waiting', async () => {
    // Both messages read the zap settings before the script is read
    syncGet
      .mockResolvedValueOnce({zapurl: 'http://zap/', zapkey: 'key'})
      .mockResolvedValueOnce({zapurl: 'http://zap/', zapkey: 'key'})
      .mockRejectedValueOnce(new Error('storage unavailable'));

    const failing = listener({type: 'getZestScript'}, {});
    const waiting = listener(
      {type: 'setZestStatements', data: [comment('a'), comment('b')]},
      {}
    );

    await expect(failing).rejects.toThrow('storage unavailable');
    await waiting;
    expect(await statementCount()).toBe(2);
  });
});

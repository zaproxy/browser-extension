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
import ScriptPlayer from '../../source/ScriptView/player';

jest.mock('webextension-polyfill', () => ({
  __esModule: true,
  default: {
    // constants.ts looks at the manifest, which is not there in tests
    runtime: {},
    tabs: {
      create: jest.fn(),
      update: jest.fn(),
      get: jest.fn(),
      sendMessage: jest.fn(),
      onUpdated: {addListener: jest.fn(), removeListener: jest.fn()},
    },
    windows: {create: jest.fn()},
  },
}));

const mocks = Browser as unknown as {
  tabs: {
    onUpdated: {addListener: jest.Mock; removeListener: jest.Mock};
    create: jest.Mock;
    update: jest.Mock;
    get: jest.Mock;
    sendMessage: jest.Mock;
  };
  windows: {create: jest.Mock};
};

const launch = {
  elementType: 'ZestClientLaunch',
  url: 'https://example.com/',
};
const click = {elementType: 'ZestClientElementClick', type: 'id', element: 'a'};
const comment = {elementType: 'ZestComment', comment: 'hi'};
const close = {elementType: 'ZestClientWindowClose'};

type State = [number, string, string | undefined];

function run(
  player: ScriptPlayer,
  statements: Record<string, unknown>[],
  delayMsec = 0
): {result: Promise<boolean>; states: State[]} {
  const states: State[] = [];
  const result = player.play(
    statements,
    delayMsec,
    (position, state, message) => states.push([position, state, message])
  );
  return {result, states};
}

function messagesOfType(type: string): {type: string; [k: string]: unknown}[] {
  return mocks.tabs.sendMessage.mock.calls
    .map((c) => c[1])
    .filter((m) => m.type === type);
}

beforeEach(() => {
  jest.clearAllMocks();
  mocks.tabs.get.mockResolvedValue({status: 'complete'});
  mocks.tabs.create.mockResolvedValue({id: 7});
  mocks.tabs.update.mockResolvedValue({});
  mocks.windows.create.mockResolvedValue({tabs: [{id: 9}]});
  mocks.tabs.sendMessage.mockImplementation((_id, message) =>
    Promise.resolve(message.type === 'replayStatement' ? {ok: true} : true)
  );
});

test('runs the statements in a new window', async () => {
  const {result, states} = run(new ScriptPlayer('window'), [
    comment,
    launch,
    click,
    close,
  ]);

  expect(await result).toBe(true);
  expect(mocks.windows.create).toHaveBeenCalledWith({
    url: 'https://example.com/',
    focused: true,
  });
  expect(mocks.tabs.create).not.toHaveBeenCalled();
  expect(states).toEqual([
    [0, 'skipped', undefined],
    [1, 'running', undefined],
    [1, 'ok', undefined],
    [2, 'running', undefined],
    [2, 'ok', undefined],
    [3, 'skipped', undefined],
  ]);
  const sent = messagesOfType('replayStatement');
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    data: click,
    display: {
      title: 'ZAP Replay',
      heading: 'Step 3 of 4',
      text: 'Click element id: a',
    },
  });
  expect(mocks.tabs.sendMessage.mock.calls[0][0]).toBe(9);
  expect(messagesOfType('replayFinished')[0]).toMatchObject({
    data: {ok: true},
  });
});

test('runs the statements in a new tab', async () => {
  const {result} = run(new ScriptPlayer('tab'), [launch, click]);

  expect(await result).toBe(true);
  expect(mocks.tabs.create).toHaveBeenCalledWith({
    url: 'https://example.com/',
    active: true,
  });
  expect(mocks.windows.create).not.toHaveBeenCalled();
  expect(mocks.tabs.sendMessage.mock.calls[0][0]).toBe(7);
});

test('a second launch reuses the tab', async () => {
  const {result} = run(new ScriptPlayer('tab'), [launch, launch]);

  expect(await result).toBe(true);
  expect(mocks.tabs.create).toHaveBeenCalledTimes(1);
  expect(mocks.tabs.update).toHaveBeenCalledWith(7, {
    url: 'https://example.com/',
  });
});

test('skips disabled statements', async () => {
  const {result, states} = run(new ScriptPlayer('tab'), [
    launch,
    {...click, enabled: false},
  ]);

  expect(await result).toBe(true);
  expect(states[states.length - 1]).toEqual([1, 'skipped', undefined]);
  expect(messagesOfType('replayStatement')).toHaveLength(0);
});

test('fails if the script does not start with a launch', async () => {
  const {result, states} = run(new ScriptPlayer('tab'), [click]);

  expect(await result).toBe(false);
  expect(states[1]).toEqual([
    0,
    'failed',
    'The script must start with a launch statement',
  ]);
  expect(mocks.tabs.create).not.toHaveBeenCalled();
  expect(mocks.tabs.sendMessage).not.toHaveBeenCalled();
});

test('only launches http and https URLs', async () => {
  const {result, states} = run(new ScriptPlayer('window'), [
    {...launch, url: 'file:///etc/passwd'},
  ]);

  expect(await result).toBe(false);
  expect(states[1][2]).toContain('Only http and https URLs can be launched');
  expect(mocks.windows.create).not.toHaveBeenCalled();
  expect(mocks.tabs.create).not.toHaveBeenCalled();
});

test('stops at the first failure and tells the page', async () => {
  mocks.tabs.sendMessage.mockImplementation((_id, message) =>
    Promise.resolve(
      message.type === 'replayStatement'
        ? {
            ok: false,
            errorKey: 'script.error.unexpected',
            errorParams: {message: 'boom'},
          }
        : true
    )
  );
  const {result, states} = run(new ScriptPlayer('tab'), [launch, click, click]);

  expect(await result).toBe(false);
  expect(states).toContainEqual([1, 'failed', 'boom']);
  expect(states.some(([position]) => position === 2)).toBe(false);
  expect(messagesOfType('replayStatement')).toHaveLength(1);
  expect(messagesOfType('replayFinished')[0]).toMatchObject({
    data: {ok: false, message: 'boom'},
  });
});

test('shows the error from the page in the language of the viewer', async () => {
  mocks.tabs.sendMessage.mockImplementation((_id, message) =>
    Promise.resolve(
      message.type === 'replayStatement'
        ? {
            ok: false,
            errorKey: 'script.error.elementNotFound',
            errorParams: {type: 'id', element: 'a'},
          }
        : true
    )
  );
  const {result, states} = run(new ScriptPlayer('tab'), [launch, click]);

  expect(await result).toBe(false);
  expect(states).toContainEqual([1, 'failed', 'Element not found: id: a']);
  expect(messagesOfType('replayFinished')[0]).toMatchObject({
    data: {
      ok: false,
      title: 'ZAP Replay',
      heading: 'Failed',
      message: 'Element not found: id: a',
    },
  });
});

test('tells the page when the script completes', async () => {
  const {result} = run(new ScriptPlayer('tab'), [launch]);

  expect(await result).toBe(true);
  expect(messagesOfType('replayFinished')[0]).toMatchObject({
    data: {
      ok: true,
      title: 'ZAP Replay',
      heading: 'Complete',
      message: 'Script completed successfully',
    },
  });
});

test('fails if the window cannot be opened', async () => {
  mocks.windows.create.mockResolvedValue({tabs: []});
  const {result, states} = run(new ScriptPlayer('window'), [launch]);

  expect(await result).toBe(false);
  expect(states[1]).toEqual([0, 'failed', 'Failed to open the page']);
});

describe('step through', () => {
  // Resolves when the player next reports that it is waiting
  function waitForPause(player: ScriptPlayer): Promise<string> {
    return new Promise((resolve) => {
      // eslint-disable-next-line no-param-reassign
      player.onPauseChange = (paused, statement): void => {
        if (paused) {
          resolve(statement);
        }
      };
    });
  }

  test('waits for next before each later statement', async () => {
    const player = new ScriptPlayer('tab', true);
    const firstPause = waitForPause(player);
    const {result} = run(player, [launch, click, click]);

    expect(await firstPause).toBe('Click element id: a');
    expect(messagesOfType('replayStatement')).toHaveLength(0);
    // The page is asked to show the buttons
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(messagesOfType('replayPause')[0]).toMatchObject({
      data: {
        title: 'ZAP Replay',
        heading: 'Step 2 of 3 - paused',
        text: 'Next: Click element id: a',
        nextLabel: 'Next',
        cancelLabel: 'Cancel',
      },
    });

    const secondPause = waitForPause(player);
    player.next();
    await secondPause;
    expect(messagesOfType('replayStatement')).toHaveLength(1);

    player.next();
    expect(await result).toBe(true);
    expect(messagesOfType('replayStatement')).toHaveLength(2);
  });

  test('stop cancels while paused', async () => {
    const player = new ScriptPlayer('tab', true);
    const pause = waitForPause(player);
    const {result, states} = run(player, [launch, click]);

    await pause;
    player.stop();

    expect(await result).toBe(false);
    expect(states).toContainEqual([1, 'failed', 'Stopped']);
    expect(messagesOfType('replayStatement')).toHaveLength(0);
    expect(messagesOfType('replayFinished')[0]).toMatchObject({
      data: {ok: false, message: 'Stopped'},
    });
  });

  test('does not show the buttons if next was already pressed', async () => {
    let finishLoad: () => void = () => {};
    const player = new ScriptPlayer('tab', true);
    const pause = waitForPause(player);
    const {result} = run(player, [launch, click]);
    await pause;
    // The page is still loading when the user presses next
    mocks.tabs.get.mockReturnValue(
      new Promise((resolve) => {
        finishLoad = (): void => resolve({status: 'complete'});
      })
    );
    player.next();
    finishLoad();
    await result;

    expect(messagesOfType('replayPause')).toHaveLength(0);
  });
});

describe('stop', () => {
  const wait = (msec: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, msec);
    });

  test('during the statement delay stops a later launch', async () => {
    const player = new ScriptPlayer('tab');
    const {result, states} = run(player, [launch, launch], 300);
    await wait(100);

    player.stop();

    expect(await result).toBe(false);
    expect(mocks.tabs.update).not.toHaveBeenCalled();
    expect(states).toContainEqual([1, 'failed', 'Stopped']);
  });

  test('tells the page to stop what it is doing', async () => {
    const player = new ScriptPlayer('tab', true);
    const {result} = run(player, [launch, click]);
    await wait(100);

    player.stop();
    await result;

    expect(
      mocks.tabs.sendMessage.mock.calls.filter(
        (c) => c[0] === 7 && c[1].type === 'replayAbort'
      )
    ).toHaveLength(1);
  });

  test('does not message a page that has not been opened', async () => {
    const player = new ScriptPlayer('tab');
    player.stop();
    expect(mocks.tabs.sendMessage).not.toHaveBeenCalled();
  });

  test('a statement that finishes after stop is not a success', async () => {
    let finish: (value: unknown) => void = () => {};
    const player = new ScriptPlayer('tab');
    mocks.tabs.sendMessage.mockImplementation((_id, message) =>
      message.type === 'replayStatement'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(true)
    );
    const {result, states} = run(player, [launch, click]);
    await wait(100);

    player.stop();
    finish({ok: true});

    expect(await result).toBe(false);
    expect(states).toContainEqual([1, 'failed', 'Stopped']);
    expect(states).not.toContainEqual([1, 'ok', undefined]);
  });
});

describe('waits that can be interrupted', () => {
  const wait = (msec: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, msec);
    });

  test('stop ends the wait for a page that keeps loading', async () => {
    // The launch finishes loading, then the next page never does
    mocks.tabs.get
      .mockResolvedValueOnce({status: 'complete'})
      .mockResolvedValue({status: 'loading'});
    const player = new ScriptPlayer('tab');
    const {result, states} = run(player, [launch, click]);
    await wait(100);
    const started = Date.now();

    player.stop();

    expect(await result).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
    // It is reported as stopped, not as the page taking too long
    expect(states).toContainEqual([1, 'failed', 'Stopped']);
    // and nothing is left listening for the page
    expect(mocks.tabs.onUpdated.removeListener).toHaveBeenCalledTimes(
      mocks.tabs.onUpdated.addListener.mock.calls.length
    );
  });

  test('stop ends the delay between statements at once', async () => {
    const player = new ScriptPlayer('tab');
    const {result} = run(player, [launch, launch], 5000);
    await wait(100);
    const started = Date.now();

    player.stop();

    expect(await result).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test('stop does not wait for a page before telling it', async () => {
    mocks.tabs.get
      .mockResolvedValueOnce({status: 'complete'})
      .mockResolvedValue({status: 'loading'});
    const player = new ScriptPlayer('tab');
    const {result} = run(player, [launch, click]);
    await wait(100);

    player.stop();
    await result;

    expect(messagesOfType('replayFinished')[0]).toMatchObject({
      data: {ok: false, message: 'Stopped'},
    });
  });

  test('showing how the script finished does not wait long for a page', async () => {
    mocks.tabs.sendMessage.mockImplementation((_id, message) =>
      Promise.resolve(
        message.type === 'replayStatement'
          ? {
              ok: false,
              errorKey: 'script.error.unexpected',
              errorParams: {message: 'boom'},
            }
          : true
      )
    );
    // The launch and the wait before the click are fine, then it is loading
    mocks.tabs.get
      .mockResolvedValueOnce({status: 'complete'})
      .mockResolvedValueOnce({status: 'complete'})
      .mockResolvedValue({status: 'loading'});
    const started = Date.now();

    const {result} = run(new ScriptPlayer('tab'), [launch, click]);

    expect(await result).toBe(false);
    // Well under the 30 seconds a page can be given to load
    expect(Date.now() - started).toBeLessThan(5000);
    expect(messagesOfType('replayFinished')).toHaveLength(1);
  });

  test('stop while paused removes the wait for the buttons', async () => {
    mocks.tabs.get
      .mockResolvedValueOnce({status: 'complete'})
      .mockResolvedValue({status: 'loading'});
    const player = new ScriptPlayer('tab', true);
    const {result} = run(player, [launch, click]);
    await wait(100);

    player.stop();
    await result;

    expect(mocks.tabs.onUpdated.removeListener).toHaveBeenCalledTimes(
      mocks.tabs.onUpdated.addListener.mock.calls.length
    );
  });
});

describe('sending a statement to the page', () => {
  const wait = (msec: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, msec);
    });

  const sent = (type: string): number => messagesOfType(type).length;

  test('checks that the page is ready before sending anything', async () => {
    const {result} = run(new ScriptPlayer('tab'), [launch, click]);

    expect(await result).toBe(true);
    const types = mocks.tabs.sendMessage.mock.calls.map((c) => c[1].type);
    expect(types.indexOf('replayPing')).toBeLessThan(
      types.indexOf('replayStatement')
    );
  });

  test('keeps asking until the page is ready, and sends the statement once', async () => {
    let attempts = 0;
    mocks.tabs.sendMessage.mockImplementation((_id, message) => {
      if (message.type === 'replayPing') {
        attempts += 1;
        return attempts < 3
          ? Promise.reject(new Error('Receiving end does not exist'))
          : Promise.resolve(true);
      }
      return Promise.resolve(
        message.type === 'replayStatement' ? {ok: true} : true
      );
    });

    const {result} = run(new ScriptPlayer('tab'), [launch, click]);

    expect(await result).toBe(true);
    expect(attempts).toBe(3);
    expect(sent('replayStatement')).toBe(1);
  });

  test('gives up if the page never answers', async () => {
    mocks.tabs.sendMessage.mockImplementation((_id, message) =>
      message.type === 'replayPing'
        ? Promise.reject(new Error('Receiving end does not exist'))
        : Promise.resolve(true)
    );
    const player = new ScriptPlayer('tab');
    const {result, states} = run(player, [launch, click]);
    await wait(300);

    player.stop();

    expect(await result).toBe(false);
    expect(sent('replayStatement')).toBe(0);
    expect(states).toContainEqual([1, 'failed', 'Stopped']);
  });

  test('a statement is not sent again if the page was replaced by it', async () => {
    mocks.tabs.sendMessage.mockImplementation((_id, message) => {
      if (message.type === 'replayStatement') {
        // As when a click loads another page before the answer is sent
        return Promise.reject(
          new Error('The message port closed before a response was received.')
        );
      }
      return Promise.resolve(true);
    });

    const {result, states} = run(new ScriptPlayer('tab'), [
      launch,
      click,
      click,
    ]);

    expect(await result).toBe(true);
    // Once for each click, never repeated
    expect(sent('replayStatement')).toBe(2);
    expect(states.filter(([, state]) => state === 'ok')).toHaveLength(3);
  });

  test('fails if the page has gone, rather than assuming it worked', async () => {
    mocks.tabs.sendMessage.mockImplementation((_id, message) =>
      message.type === 'replayStatement'
        ? Promise.reject(new Error('No tab with id: 7'))
        : Promise.resolve(true)
    );
    // The tab is there for the launch, and for the wait before the click, then it is gone
    mocks.tabs.get
      .mockResolvedValueOnce({status: 'complete'})
      .mockResolvedValueOnce({status: 'complete'})
      .mockRejectedValue(new Error('No tab with id: 7'));

    const {result, states} = run(new ScriptPlayer('tab'), [launch, click]);

    expect(await result).toBe(false);
    expect(states).toContainEqual([
      1,
      'failed',
      'Could not talk to the page: Error: No tab with id: 7',
    ]);
    expect(sent('replayStatement')).toBe(1);
  });
});

describe('which tab belongs to the player', () => {
  test('is only the tab it opened', async () => {
    const player = new ScriptPlayer('tab');
    expect(player.ownsTab(7)).toBe(false);
    expect(player.ownsTab(undefined)).toBe(false);

    const {result} = run(player, [launch]);
    await result;

    expect(player.ownsTab(7)).toBe(true);
    expect(player.ownsTab(8)).toBe(false);
    expect(player.ownsTab(undefined)).toBe(false);
  });
});

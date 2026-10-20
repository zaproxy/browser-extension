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
import Browser from 'webextension-polyfill';
import * as path from 'path';

const script = (titles: string[]): string =>
  JSON.stringify({
    title: 'My script',
    statements: titles.map((comment, i) => ({
      index: i + 1,
      enabled: true,
      // A comment that starts with a question mark is a type that cannot be edited
      elementType: comment.startsWith('?')
        ? 'ZestSomethingElse'
        : 'ZestComment',
      comment,
    })),
  });

const mockSyncStore: Record<string, unknown> = {};
let stored: string[] = ['first', 'second'];
let failSave = false;
let holdSave: Promise<void> | undefined;
// Each request for the script waits for the next of these, if there are any
const holdLoads: Promise<void>[] = [];
// The number of the next requests for the script that fail
let failLoads = 0;

const sendMessage = jest.fn((request: {type: string; data?: unknown[]}) => {
  if (request.type === 'getZestScript') {
    // What is stored when the request is made, as a late reply would have
    const reply = {
      script: script(stored),
      title: 'My script',
      statementCount: stored.length,
    };
    if (failLoads > 0) {
      failLoads -= 1;
      return Promise.reject(new Error('background unavailable'));
    }
    const gate = holdLoads.shift();
    return gate ? gate.then(() => reply) : Promise.resolve(reply);
  }
  if (request.type === 'setZestStatements') {
    if (failSave) {
      return Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
    }
    const apply = (): void => {
      stored = (request.data as {comment: string}[]).map((s) => s.comment);
    };
    if (holdSave) {
      return holdSave.then(apply).then(() => 2);
    }
    apply();
  }
  return Promise.resolve(2);
});

const mockPlay = jest.fn();
const mockPlayer = {
  play: (...args: unknown[]): unknown => mockPlay(...args),
  stop: jest.fn(),
  next: jest.fn(),
  ownsTab: jest.fn(),
};

jest.mock('../../source/ScriptView/player', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockPlayer),
}));

jest.mock('webextension-polyfill', () => ({
  __esModule: true,
  default: {
    runtime: {
      sendMessage: (m: unknown): Promise<unknown> => sendMessage(m as never),
      onMessage: {addListener: jest.fn()},
      getManifest: undefined,
    },
    storage: {
      sync: {
        get: (defaults: Record<string, unknown>): Promise<unknown> =>
          Promise.resolve({
            zaprecordingactive: false,
            ...defaults,
            ...mockSyncStore,
          }),
        set: (items: Record<string, unknown>): Promise<void> => {
          Object.assign(mockSyncStore, items);
          return Promise.resolve();
        },
      },
      onChanged: {addListener: jest.fn()},
    },
  },
}));

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function rowTexts(): string[] {
  return Array.from(document.querySelectorAll('#script-body tr')).map(
    (r): string => (r as HTMLTableRowElement).cells[1].textContent ?? ''
  );
}

function message(): string {
  return document.getElementById('script-message')?.textContent ?? '';
}

function clickRowButton(row: number, title: string): void {
  const rows = document.querySelectorAll('#script-body tr');
  (
    rows[row].querySelector(`button[title="${title}"]`) as HTMLButtonElement
  ).click();
}

// jsdom does not implement modal dialogs
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(): void {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(): void {
    this.removeAttribute('open');
  };
});

beforeAll(async () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', '..', 'views', 'script.html'),
    'utf8'
  );
  document.documentElement.innerHTML = html;
  // eslint-disable-next-line node/no-unsupported-features/es-syntax
  await import('../../source/ScriptView/index');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flush();
});

test('shows the stored statements', () => {
  expect(rowTexts()).toEqual(['Comment: first', 'Comment: second']);
});

test('a change is saved and shown', async () => {
  clickRowButton(0, 'Move down');
  await flush();

  expect(stored).toEqual(['second', 'first']);
  expect(rowTexts()).toEqual(['Comment: second', 'Comment: first']);
});

test('a failed save is reported and nothing changes', async () => {
  failSave = true;
  clickRowButton(0, 'Move down');
  await flush();
  failSave = false;

  expect(message()).toBe(
    'Failed to save the changes: QUOTA_BYTES quota exceeded'
  );
  // Still shows what is really stored
  expect(rowTexts()).toEqual(['Comment: second', 'Comment: first']);
});

test('a failed save leaves no undo step behind', async () => {
  const undo = document.getElementById('undo-btn') as HTMLButtonElement;
  // Only the earlier, successful change can be undone
  expect(undo.disabled).toBe(false);
  undo.click();
  await flush();

  expect(stored).toEqual(['first', 'second']);
  expect(undo.disabled).toBe(true);
});

test('the controls are usable again after a failed save', async () => {
  expect(
    (document.getElementById('add-btn') as HTMLButtonElement).disabled
  ).toBe(false);
  clickRowButton(1, 'Move up');
  await flush();

  expect(stored).toEqual(['second', 'first']);
  expect(message()).toBe('2 statement(s)');
});

test('the script cannot be run or refreshed while a change is being saved', async () => {
  let release: () => void = () => {};
  holdSave = new Promise<void>((resolve) => {
    release = resolve;
  });
  const run = document.getElementById('run-btn') as HTMLButtonElement;
  const refresh = document.getElementById('refresh-btn') as HTMLButtonElement;
  expect(run.disabled).toBe(false);

  clickRowButton(0, 'Move down');
  await flush();
  expect(run.disabled).toBe(true);
  expect(refresh.disabled).toBe(true);

  holdSave = undefined;
  release();
  await flush();
  expect(run.disabled).toBe(false);
  expect(refresh.disabled).toBe(false);
});

const undoButton = (): HTMLButtonElement =>
  document.getElementById('undo-btn') as HTMLButtonElement;

// Earlier tests leave undo steps behind
async function drainUndo(): Promise<void> {
  while (!undoButton().disabled) {
    undoButton().click();
    // eslint-disable-next-line no-await-in-loop
    await flush();
  }
}

function getScriptRequests(): number {
  return sendMessage.mock.calls.filter(
    (c) => (c[0] as {type: string}).type === 'getZestScript'
  ).length;
}

describe('refreshing from the popup', () => {
  const onMessage = (): ((message: unknown) => void) =>
    (Browser.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];

  test('reloads the script', async () => {
    const before = getScriptRequests();

    onMessage()({type: 'refreshScriptView'});
    await flush();

    expect(getScriptRequests()).toBe(before + 1);
  });

  test('is ignored while a change is being saved', async () => {
    let release: () => void = () => {};
    holdSave = new Promise<void>((resolve) => {
      release = resolve;
    });
    clickRowButton(0, 'Move down');
    await flush();
    const before = getScriptRequests();

    onMessage()({type: 'refreshScriptView'});
    await flush();
    expect(getScriptRequests()).toBe(before);

    holdSave = undefined;
    release();
    await flush();
  });
});

describe('undo', () => {
  test('keeps the step if undoing fails, so it can be tried again', async () => {
    await drainUndo();
    const original = [...stored];
    clickRowButton(0, 'Move down');
    await flush();
    const changed = [...stored];
    expect(changed).not.toEqual(original);

    failSave = true;
    undoButton().click();
    await flush();
    failSave = false;

    expect(message()).toContain('Failed to save the changes');
    expect(undoButton().disabled).toBe(false);

    undoButton().click();
    await flush();

    expect(stored).toEqual(original);
    expect(undoButton().disabled).toBe(true);
  });
});

describe('loading a file', () => {
  const fileInput = (): HTMLInputElement =>
    document.getElementById('load-file') as HTMLInputElement;

  async function load(content: object): Promise<void> {
    const json = JSON.stringify(content);
    const file = new File([json], 'loaded.zst');
    // jsdom does not implement Blob.text
    Object.defineProperty(file, 'text', {value: () => Promise.resolve(json)});
    Object.defineProperty(fileInput(), 'files', {
      value: [file],
      configurable: true,
    });
    fileInput().dispatchEvent(new Event('change'));
    await flush();
    await flush();
  }

  const statements = [{elementType: 'ZestComment', comment: 'loaded'}];

  test('uses the name in the file', async () => {
    await load({title: 'From file', statements});

    expect(mockSyncStore.zapscriptname).toBe('From file');
    expect(stored).toEqual(['loaded']);
    expect(message()).toBe('Loaded 1 statement(s) from loaded.zst');
  });

  test('clears the old name if the file has none', async () => {
    mockSyncStore.zapscriptname = 'Previous script';

    await load({statements});

    expect(mockSyncStore.zapscriptname).toBe('');
  });

  test('puts back the old name if the file could not be saved', async () => {
    mockSyncStore.zapscriptname = 'Previous script';
    failSave = true;

    await load({title: 'Not saved', statements});
    failSave = false;

    expect(mockSyncStore.zapscriptname).toBe('Previous script');
    expect(message()).toContain('Failed to save the changes');
  });

  test('rejects a file with settings that cannot be kept', async () => {
    mockSyncStore.zapscriptname = 'Previous script';
    const before = [...stored];

    await load({
      title: 'Has tokens',
      statements,
      parameters: {tokenStart: '{{', tokenEnd: '}}', tokens: {a: 'b'}},
    });

    expect(message()).toBe(
      'Failed to load loaded.zst: The script uses features that cannot be preserved (parameters)'
    );
    expect(stored).toEqual(before);
    expect(mockSyncStore.zapscriptname).toBe('Previous script');
  });
});

describe('the script name with undo', () => {
  const fileInput = (): HTMLInputElement =>
    document.getElementById('load-file') as HTMLInputElement;

  async function loadFile(content: object): Promise<void> {
    const json = JSON.stringify(content);
    const file = new File([json], 'loaded.zst');
    Object.defineProperty(file, 'text', {value: () => Promise.resolve(json)});
    Object.defineProperty(fileInput(), 'files', {
      value: [file],
      configurable: true,
    });
    fileInput().dispatchEvent(new Event('change'));
    await flush();
    await flush();
  }

  async function startNew(): Promise<void> {
    (document.getElementById('new-btn') as HTMLButtonElement).click();
    (document.getElementById('confirm-ok') as HTMLButtonElement).click();
    await flush();
    await flush();
  }

  beforeEach(async () => {
    await drainUndo();
    stored = ['first', 'second'];
    mockSyncStore.zapscriptname = 'Script A';
  });

  test('undoing a load puts back the old name as well as the statements', async () => {
    await loadFile({
      title: 'Script B',
      statements: [{elementType: 'ZestComment', comment: 'from B'}],
    });
    expect(mockSyncStore.zapscriptname).toBe('Script B');
    expect(stored).toEqual(['from B']);

    undoButton().click();
    await flush();

    expect(mockSyncStore.zapscriptname).toBe('Script A');
    expect(stored).toEqual(['first', 'second']);
  });

  test('undoing a new script puts back the old name as well', async () => {
    await startNew();
    expect(mockSyncStore.zapscriptname).toBe('');
    expect(stored).toEqual([]);

    undoButton().click();
    await flush();

    expect(mockSyncStore.zapscriptname).toBe('Script A');
    expect(stored).toEqual(['first', 'second']);
  });

  test('a new script that cannot be saved keeps the old name', async () => {
    failSave = true;

    await startNew();
    failSave = false;

    expect(mockSyncStore.zapscriptname).toBe('Script A');
    expect(stored).toEqual(['first', 'second']);
    expect(message()).toContain('Failed to save the changes');
    // and nothing was left to undo
    expect(undoButton().disabled).toBe(true);
  });

  test('a change that does not rename the script leaves the name alone', async () => {
    clickRowButton(0, 'Move down');
    await flush();
    expect(mockSyncStore.zapscriptname).toBe('Script A');

    undoButton().click();
    await flush();

    expect(mockSyncStore.zapscriptname).toBe('Script A');
    expect(stored).toEqual(['first', 'second']);
  });
});

describe('editing statements with line breaks', () => {
  const requests = (): {data: {comment: string; enabled: boolean}[]}[] =>
    sendMessage.mock.calls
      .map((c) => c[0] as {type: string; data: never})
      .filter((m) => m.type === 'setZestStatements') as never;

  test('the line breaks are kept when only another field is changed', async () => {
    stored = ['line one\nline two', 'other'];
    (Browser.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0]({
      type: 'refreshScriptView',
    });
    await flush();
    const rows = document.querySelectorAll('#script-body tr');
    rows[0].dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));

    const comment = document.getElementById(
      'field-comment'
    ) as HTMLTextAreaElement;
    expect(comment.tagName).toBe('TEXTAREA');
    expect(comment.value).toBe('line one\nline two');
    (document.getElementById('field-enabled') as HTMLInputElement).checked =
      false;
    (document.getElementById('edit-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', {cancelable: true})
    );
    await flush();

    const saved = requests()[requests().length - 1].data;
    expect(saved[0].comment).toBe('line one\nline two');
    expect(saved[0].enabled).toBe(false);
    expect(stored[0]).toBe('line one\nline two');
  });
});

describe('while the script is being loaded', () => {
  const refresh = (): void =>
    (Browser.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0]({
      type: 'refreshScriptView',
    });
  const runButton = (): HTMLButtonElement =>
    document.getElementById('run-btn') as HTMLButtonElement;

  // Makes the next request for the script wait until the returned function is called
  function holdNextLoad(): () => void {
    let release: () => void = () => {};
    holdLoads.push(
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );
    return () => release();
  }

  beforeEach(async () => {
    await drainUndo();
    stored = ['first', 'second'];
    refresh();
    await flush();
  });

  test('the script cannot be run or changed until it has arrived', async () => {
    const release = holdNextLoad();
    refresh();
    await flush();
    const savesBefore = sendMessage.mock.calls.filter(
      (c) => (c[0] as {type: string}).type === 'setZestStatements'
    ).length;

    expect(runButton().disabled).toBe(true);
    expect(
      (document.getElementById('add-btn') as HTMLButtonElement).disabled
    ).toBe(true);
    clickRowButton(0, 'Move down');
    await flush();
    expect(
      sendMessage.mock.calls.filter(
        (c) => (c[0] as {type: string}).type === 'setZestStatements'
      ).length
    ).toBe(savesBefore);

    release();
    await flush();

    expect(runButton().disabled).toBe(false);
    expect(
      (document.getElementById('add-btn') as HTMLButtonElement).disabled
    ).toBe(false);
  });

  test('an out of date reply does not replace a newer one', async () => {
    const releaseOld = holdNextLoad();
    refresh();
    await flush();
    stored = ['newer'];
    refresh();
    await flush();
    expect(rowTexts()).toEqual(['Comment: newer']);

    releaseOld();
    await flush();

    expect(rowTexts()).toEqual(['Comment: newer']);
    expect(runButton().disabled).toBe(false);
  });
});

describe('running a script', () => {
  const runButton = (): HTMLButtonElement =>
    document.getElementById('run-btn') as HTMLButtonElement;

  beforeEach(async () => {
    mockPlay.mockReset();
    stored = ['first', 'second'];
    (Browser.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0]({
      type: 'refreshScriptView',
    });
    await flush();
  });

  test('the controls are released if the player fails', async () => {
    mockPlay.mockRejectedValue(new Error('boom'));

    runButton().click();
    await flush();

    expect(message()).toBe('Script failed: boom');
    expect(runButton().hidden).toBe(false);
    expect(runButton().disabled).toBe(false);
    expect(
      (document.getElementById('add-btn') as HTMLButtonElement).disabled
    ).toBe(false);
    expect(
      (document.getElementById('stop-btn') as HTMLButtonElement).hidden
    ).toBe(true);
  });

  test('a result for a row that is not there does not stop the run', async () => {
    mockPlay.mockImplementation(
      async (
        _statements: unknown,
        _delay: unknown,
        onState: (position: number, state: string) => void
      ) => {
        onState(99, 'running');
        onState(0, 'ok');
        return true;
      }
    );

    runButton().click();
    await flush();

    expect(message()).toBe('Script completed successfully');
    expect(
      (document.querySelector('#script-body tr') as HTMLTableRowElement)
        .cells[3].textContent
    ).toBe('✓');
    expect(runButton().hidden).toBe(false);
  });
});

describe('line endings when editing', () => {
  const requests = (): {data: {comment: string; enabled: boolean}[]}[] =>
    sendMessage.mock.calls
      .map((c) => c[0] as {type: string; data: never})
      .filter((m) => m.type === 'setZestStatements') as never;

  async function openFirstStatement(): Promise<void> {
    (Browser.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0]({
      type: 'refreshScriptView',
    });
    await flush();
    document
      .querySelector('#script-body tr')
      ?.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
  }

  async function submit(): Promise<string> {
    (document.getElementById('edit-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', {cancelable: true})
    );
    await flush();
    return requests()[requests().length - 1].data[0].comment;
  }

  test.each([
    ['CRLF', 'line 1\r\nline 2'],
    ['a lone CR', 'line 1\rline 2'],
    ['mixed', 'a\r\nb\nc\rd'],
  ])('%s is kept if only another field is changed', async (_name, text) => {
    stored = [text, 'other'];
    await openFirstStatement();
    (document.getElementById('field-enabled') as HTMLInputElement).checked =
      false;

    expect(await submit()).toBe(text);
  });

  test('an edited text is saved as it was entered', async () => {
    stored = ['line 1\r\nline 2', 'other'];
    await openFirstStatement();
    (document.getElementById('field-comment') as HTMLTextAreaElement).value =
      'changed\nlines';

    expect(await submit()).toBe('changed\nlines');
  });
});

const saveCount = (): number =>
  sendMessage.mock.calls.filter(
    (c) => (c[0] as {type: string}).type === 'setZestStatements'
  ).length;

const refreshView = (): void =>
  (Browser.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0]({
    type: 'refreshScriptView',
  });

const dialogOpen = (id: string): boolean =>
  (document.getElementById(id) as HTMLElement).hasAttribute('open');

describe('when the script cannot be loaded', () => {
  beforeEach(async () => {
    stored = ['first', 'second'];
    refreshView();
    await flush();
  });

  test('nothing can be changed until it has been loaded again', async () => {
    failLoads = 1;
    refreshView();
    await flush();
    const before = saveCount();

    expect(message()).toBe(
      'Failed to load script: Error: background unavailable'
    );
    for (const id of [
      'add-btn',
      'new-btn',
      'load-btn',
      'undo-btn',
      'run-btn',
    ]) {
      expect((document.getElementById(id) as HTMLButtonElement).disabled).toBe(
        true
      );
    }
    // The statements still on the page are not what is stored, so changing them is refused
    clickRowButton(0, 'Move down');
    clickRowButton(0, 'Delete');
    await flush();
    expect(saveCount()).toBe(before);
    expect(dialogOpen('confirm-dialog')).toBe(false);

    refreshView();
    await flush();

    expect(
      (document.getElementById('add-btn') as HTMLButtonElement).disabled
    ).toBe(false);
    expect(
      (document.getElementById('run-btn') as HTMLButtonElement).disabled
    ).toBe(false);
    clickRowButton(0, 'Move down');
    await flush();
    expect(saveCount()).toBe(before + 1);
  });

  test('an open dialog is closed when the script cannot be loaded', async () => {
    document
      .querySelector('#script-body tr')
      ?.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
    expect(dialogOpen('edit-dialog')).toBe(true);

    failLoads = 1;
    refreshView();
    await flush();

    expect(dialogOpen('edit-dialog')).toBe(false);
    // Recover for the other tests
    refreshView();
    await flush();
  });
});

describe('dialogs for a script that has been replaced', () => {
  const submitEdit = (): void => {
    (document.getElementById('edit-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', {cancelable: true})
    );
  };

  beforeEach(async () => {
    stored = ['first', 'second', 'third'];
    refreshView();
    await flush();
  });

  test('an edit dialog is closed and cannot change the new script', async () => {
    document
      .querySelectorAll('#script-body tr')[1]
      .dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
    expect(dialogOpen('edit-dialog')).toBe(true);
    const before = saveCount();

    stored = ['one', 'two', 'three'];
    refreshView();
    await flush();
    expect(dialogOpen('edit-dialog')).toBe(false);
    (document.getElementById('field-comment') as HTMLTextAreaElement).value =
      'changed';
    submitEdit();
    await flush();

    expect(saveCount()).toBe(before);
    expect(stored).toEqual(['one', 'two', 'three']);
  });

  test('a delete confirmation is closed and cannot delete from the new script', async () => {
    clickRowButton(0, 'Delete');
    expect(dialogOpen('confirm-dialog')).toBe(true);
    const before = saveCount();

    stored = ['one', 'two'];
    refreshView();
    await flush();
    expect(dialogOpen('confirm-dialog')).toBe(false);
    (document.getElementById('confirm-ok') as HTMLButtonElement).click();
    await flush();

    expect(saveCount()).toBe(before);
    expect(stored).toEqual(['one', 'two']);
  });

  test('an add dialog cannot add to the new script', async () => {
    (document.getElementById('add-btn') as HTMLButtonElement).click();
    expect(dialogOpen('edit-dialog')).toBe(true);
    const before = saveCount();

    stored = ['one'];
    refreshView();
    await flush();
    submitEdit();
    await flush();

    expect(saveCount()).toBe(before);
    expect(stored).toEqual(['one']);
  });

  test('a new script confirmation is closed too', async () => {
    (document.getElementById('new-btn') as HTMLButtonElement).click();
    expect(dialogOpen('confirm-dialog')).toBe(true);
    const before = saveCount();

    stored = ['one'];
    refreshView();
    await flush();
    (document.getElementById('confirm-ok') as HTMLButtonElement).click();
    await flush();

    expect(saveCount()).toBe(before);
    expect(stored).toEqual(['one']);
  });

  test('starting a recording closes the dialogs', async () => {
    const onChanged = (Browser.storage.onChanged.addListener as jest.Mock).mock
      .calls[0][0];
    document
      .querySelector('#script-body tr')
      ?.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
    expect(dialogOpen('edit-dialog')).toBe(true);

    onChanged({zaprecordingactive: {newValue: true}});
    expect(dialogOpen('edit-dialog')).toBe(false);

    onChanged({zaprecordingactive: {newValue: false}});
    await flush();
  });
});

describe('replay controls from the page', () => {
  const onMessage = (): ((
    message: unknown,
    sender: {tab?: {id?: number}}
  ) => void) =>
    (Browser.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];

  let finish: (ok: boolean) => void = () => {};

  beforeEach(async () => {
    stored = ['first', 'second'];
    refreshView();
    await flush();
    mockPlayer.next.mockClear();
    mockPlayer.stop.mockClear();
    mockPlayer.ownsTab.mockReset();
    mockPlayer.ownsTab.mockImplementation((id?: number) => id === 7);
    mockPlay.mockReset();
    mockPlay.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      })
    );
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flush();
  });

  afterEach(async () => {
    finish(true);
    await flush();
  });

  test('next and cancel from the replay tab are acted on', () => {
    onMessage()({type: 'replayNext'}, {tab: {id: 7}});
    expect(mockPlayer.next).toHaveBeenCalledTimes(1);

    onMessage()({type: 'replayCancel'}, {tab: {id: 7}});
    expect(mockPlayer.stop).toHaveBeenCalledTimes(1);
  });

  test('next and cancel from another tab are ignored', () => {
    onMessage()({type: 'replayNext'}, {tab: {id: 8}});
    onMessage()({type: 'replayCancel'}, {tab: {id: 8}});

    expect(mockPlayer.next).not.toHaveBeenCalled();
    expect(mockPlayer.stop).not.toHaveBeenCalled();
  });

  test('next and cancel with no tab are ignored', () => {
    onMessage()({type: 'replayNext'}, {});
    onMessage()({type: 'replayCancel'}, {tab: {}});

    expect(mockPlayer.next).not.toHaveBeenCalled();
    expect(mockPlayer.stop).not.toHaveBeenCalled();
  });

  test('they are ignored when nothing is being replayed', async () => {
    finish(true);
    await flush();

    onMessage()({type: 'replayNext'}, {tab: {id: 7}});
    onMessage()({type: 'replayCancel'}, {tab: {id: 7}});

    expect(mockPlayer.next).not.toHaveBeenCalled();
    expect(mockPlayer.stop).not.toHaveBeenCalled();
  });
});

describe('the move buttons', () => {
  const button = (row: number, title: string): HTMLButtonElement =>
    document
      .querySelectorAll('#script-body tr')
      [row].querySelector(`button[title="${title}"]`) as HTMLButtonElement;

  async function show(statementsToShow: string[]): Promise<void> {
    stored = statementsToShow;
    refreshView();
    await flush();
  }

  test('the first statement cannot move up and the last cannot move down', async () => {
    await show(['one', 'two', 'three']);

    expect(button(0, 'Move up').disabled).toBe(true);
    expect(button(0, 'Move down').disabled).toBe(false);
    expect(button(1, 'Move up').disabled).toBe(false);
    expect(button(1, 'Move down').disabled).toBe(false);
    expect(button(2, 'Move up').disabled).toBe(false);
    expect(button(2, 'Move down').disabled).toBe(true);
  });

  test('a single statement cannot move at all', async () => {
    await show(['only']);

    expect(button(0, 'Move up').disabled).toBe(true);
    expect(button(0, 'Move down').disabled).toBe(true);
  });

  test('the other buttons are not affected', async () => {
    await show(['one', 'two']);

    for (const row of [0, 1]) {
      expect(button(row, 'Edit').disabled).toBe(false);
      expect(button(row, 'Delete').disabled).toBe(false);
    }
  });

  test('they follow a statement that has moved', async () => {
    await show(['one', 'two', 'three']);

    button(0, 'Move down').click();
    await flush();

    expect(stored).toEqual(['two', 'one', 'three']);
    expect(button(0, 'Move up').disabled).toBe(true);
    expect(button(1, 'Move up').disabled).toBe(false);
    expect(button(2, 'Move down').disabled).toBe(true);
  });

  test('a disabled button does nothing', async () => {
    await show(['one', 'two']);
    const before = saveCount();

    button(0, 'Move up').click();
    button(1, 'Move down').click();
    await flush();

    expect(saveCount()).toBe(before);
    expect(stored).toEqual(['one', 'two']);
  });

  test('a script that loses statements gets the right buttons', async () => {
    await show(['one', 'two', 'three']);

    button(2, 'Delete').click();
    (document.getElementById('confirm-ok') as HTMLButtonElement).click();
    await flush();

    expect(stored).toEqual(['one', 'two']);
    expect(button(1, 'Move down').disabled).toBe(true);
  });
});

describe('redo', () => {
  const redoButton = (): HTMLButtonElement =>
    document.getElementById('redo-btn') as HTMLButtonElement;
  const fileInput = (): HTMLInputElement =>
    document.getElementById('load-file') as HTMLInputElement;

  async function loadFile(content: object): Promise<void> {
    const json = JSON.stringify(content);
    const file = new File([json], 'loaded.zst');
    Object.defineProperty(file, 'text', {value: () => Promise.resolve(json)});
    Object.defineProperty(fileInput(), 'files', {
      value: [file],
      configurable: true,
    });
    fileInput().dispatchEvent(new Event('change'));
    await flush();
    await flush();
  }

  const recording = (active: boolean): void =>
    (Browser.storage.onChanged.addListener as jest.Mock).mock.calls[0][0]({
      zaprecordingactive: {newValue: active},
    });

  // Starts with a script and nothing to undo or redo
  beforeEach(async () => {
    stored = ['one', 'two', 'three'];
    mockSyncStore.zapscriptname = 'Script A';
    recording(true);
    recording(false);
    await flush();
    await flush();
  });

  const moveDown = async (row: number): Promise<void> => {
    clickRowButton(row, 'Move down');
    await flush();
  };

  test('is on the same line as undo, and not with the other buttons', () => {
    const line = undoButton().parentElement as HTMLElement;

    expect(redoButton().parentElement).toBe(line);
    expect(line.contains(document.getElementById('add-btn'))).toBe(false);
    expect(line.contains(document.getElementById('new-btn'))).toBe(false);
    expect(line.contains(document.getElementById('run-btn'))).toBe(false);
    // and undo comes first
    const buttons = Array.from(line.querySelectorAll('button'));
    expect(buttons.map((b) => b.id)).toEqual(['undo-btn', 'redo-btn']);
  });

  test('has nothing to do until something has been undone', async () => {
    expect(redoButton().disabled).toBe(true);

    await moveDown(0);

    expect(undoButton().disabled).toBe(false);
    expect(redoButton().disabled).toBe(true);
  });

  test('puts back what was undone', async () => {
    await moveDown(0);
    expect(stored).toEqual(['two', 'one', 'three']);

    undoButton().click();
    await flush();
    expect(stored).toEqual(['one', 'two', 'three']);
    expect(redoButton().disabled).toBe(false);

    redoButton().click();
    await flush();

    expect(stored).toEqual(['two', 'one', 'three']);
    expect(redoButton().disabled).toBe(true);
    expect(undoButton().disabled).toBe(false);
  });

  test('can be undone again after it has been redone', async () => {
    await moveDown(0);
    undoButton().click();
    await flush();
    redoButton().click();
    await flush();

    undoButton().click();
    await flush();

    expect(stored).toEqual(['one', 'two', 'three']);
    expect(redoButton().disabled).toBe(false);
  });

  test('puts back several changes in order', async () => {
    await moveDown(0);
    await moveDown(1);
    expect(stored).toEqual(['two', 'three', 'one']);

    undoButton().click();
    await flush();
    undoButton().click();
    await flush();
    expect(stored).toEqual(['one', 'two', 'three']);

    redoButton().click();
    await flush();
    expect(stored).toEqual(['two', 'one', 'three']);
    redoButton().click();
    await flush();
    expect(stored).toEqual(['two', 'three', 'one']);
    expect(redoButton().disabled).toBe(true);
  });

  test('is lost when another change is made', async () => {
    await moveDown(0);
    undoButton().click();
    await flush();
    expect(redoButton().disabled).toBe(false);

    await moveDown(1);

    expect(redoButton().disabled).toBe(true);
  });

  test('puts back the name of a script that was loaded', async () => {
    await loadFile({
      title: 'Script B',
      statements: [{elementType: 'ZestComment', comment: 'from B'}],
    });
    undoButton().click();
    await flush();
    expect(mockSyncStore.zapscriptname).toBe('Script A');
    expect(stored).toEqual(['one', 'two', 'three']);

    redoButton().click();
    await flush();

    expect(mockSyncStore.zapscriptname).toBe('Script B');
    expect(stored).toEqual(['from B']);
  });

  test('puts back an empty script after a new one was made and undone', async () => {
    (document.getElementById('new-btn') as HTMLButtonElement).click();
    (document.getElementById('confirm-ok') as HTMLButtonElement).click();
    await flush();
    await flush();
    undoButton().click();
    await flush();
    expect(stored).toEqual(['one', 'two', 'three']);

    redoButton().click();
    await flush();

    expect(stored).toEqual([]);
    expect(mockSyncStore.zapscriptname).toBe('');
  });

  test('a load ends any redo', async () => {
    await moveDown(0);
    undoButton().click();
    await flush();

    await loadFile({
      statements: [{elementType: 'ZestComment', comment: 'loaded'}],
    });

    expect(redoButton().disabled).toBe(true);
  });

  test('a redo that cannot be saved can be tried again', async () => {
    await moveDown(0);
    undoButton().click();
    await flush();

    failSave = true;
    redoButton().click();
    await flush();
    failSave = false;

    expect(message()).toContain('Failed to save the changes');
    expect(stored).toEqual(['one', 'two', 'three']);
    expect(redoButton().disabled).toBe(false);
    expect(undoButton().disabled).toBe(true);

    redoButton().click();
    await flush();

    expect(stored).toEqual(['two', 'one', 'three']);
    expect(redoButton().disabled).toBe(true);
    expect(undoButton().disabled).toBe(false);
  });

  test('an undo that cannot be saved leaves nothing to redo', async () => {
    await moveDown(0);

    failSave = true;
    undoButton().click();
    await flush();
    failSave = false;

    expect(redoButton().disabled).toBe(true);
    expect(undoButton().disabled).toBe(false);
  });

  test('a change that cannot be saved does not end a redo', async () => {
    await moveDown(0);
    undoButton().click();
    await flush();

    failSave = true;
    await moveDown(1);
    failSave = false;

    expect(redoButton().disabled).toBe(false);
  });

  test('is not available while a change is being saved', async () => {
    await moveDown(0);
    undoButton().click();
    await flush();
    let release: () => void = () => {};
    holdSave = new Promise<void>((resolve) => {
      release = resolve;
    });

    clickRowButton(0, 'Move down');
    await flush();
    expect(redoButton().disabled).toBe(true);

    holdSave = undefined;
    release();
    await flush();
  });

  test('is cleared when a recording replaces the script', async () => {
    await moveDown(0);
    undoButton().click();
    await flush();
    expect(redoButton().disabled).toBe(false);

    recording(true);
    expect(redoButton().disabled).toBe(true);
    recording(false);
    await flush();

    expect(redoButton().disabled).toBe(true);
    expect(undoButton().disabled).toBe(true);
  });
});

describe('while a script is being recorded', () => {
  const listener = (): ((changes: unknown, area?: string) => void) =>
    (Browser.storage.onChanged.addListener as jest.Mock).mock.calls[0][0];

  const recording = (active: boolean): void =>
    listener()({zaprecordingactive: {newValue: active}}, 'sync');

  // The statements as the background stores them
  const storedStatements = (comments: string[]): string[] =>
    comments.map((comment, i) =>
      JSON.stringify({
        index: i + 1,
        enabled: true,
        elementType: 'ZestComment',
        comment,
      })
    );

  // As when the background stores what has been recorded
  const record = (comments: string[]): void => {
    stored = comments;
    listener()(
      {zestStatements: {newValue: storedStatements(comments)}},
      'local'
    );
  };

  const wait = (msec: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, msec);
    });
  // Longer than the viewer gathers changes for
  const settle = (): Promise<void> => wait(400);

  const scrollIntoView = jest.fn();
  const lastRow = (): Element | null =>
    document.querySelector('#script-body tr:last-child');

  beforeAll(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  beforeEach(async () => {
    stored = ['one'];
    refreshView();
    await flush();
    scrollIntoView.mockClear();
  });

  afterEach(async () => {
    recording(false);
    await settle();
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    delete (document.documentElement as {scrollHeight?: number}).scrollHeight;
  });

  test('shows the statements as they are recorded', async () => {
    recording(true);

    record(['one', 'two']);
    await settle();

    expect(rowTexts()).toEqual(['Comment: one', 'Comment: two']);
    record(['one', 'two', 'three']);
    await settle();
    expect(rowTexts()).toHaveLength(3);
  });

  test('says that it is recording, and how many there are', async () => {
    recording(true);

    record(['one', 'two']);
    await settle();

    expect(message()).toBe('Recording... 2 statement(s)');
  });

  test('says that it is recording before anything has been recorded', async () => {
    recording(true);

    record([]);
    await settle();

    expect(rowTexts()).toEqual([]);
    expect(message()).toBe('Recording... no statements yet');
  });

  test('says so at once when a recording starts', () => {
    recording(true);

    expect(message()).toBe('Recording... 1 statement(s)');
  });

  test('stops saying so when the recording ends', async () => {
    recording(true);
    record(['one', 'two']);
    await settle();

    recording(false);
    await flush();

    expect(message()).toBe('2 statement(s)');
  });

  test('gathers statements that arrive together into one refresh', async () => {
    recording(true);
    const before = getScriptRequests();

    record(['one', 'two']);
    record(['one', 'two', 'three']);
    record(['one', 'two', 'three', 'four']);
    await settle();

    expect(getScriptRequests() - before).toBe(1);
    expect(rowTexts()).toHaveLength(4);
  });

  test('keeps up with statements that arrive after a refresh', async () => {
    recording(true);
    record(['one', 'two']);
    await settle();
    const before = getScriptRequests();

    record(['one', 'two', 'three']);
    await settle();

    expect(getScriptRequests() - before).toBe(1);
    expect(rowTexts()).toHaveLength(3);
  });

  test('does not refresh for its own saves', async () => {
    // Two statements, so that the first can be moved down, which is a save
    stored = ['one', 'two'];
    refreshView();
    await flush();
    let release: () => void = () => {};
    holdSave = new Promise<void>((resolve) => {
      release = resolve;
    });
    const before = getScriptRequests();
    const savesBefore = saveCount();

    clickRowButton(0, 'Move down');
    await flush();
    // The change that the save makes, which is announced while it is being saved
    record(['saved']);
    holdSave = undefined;
    release();
    await settle();

    // Only the one that the save makes itself, and the save did happen
    expect(getScriptRequests() - before).toBe(1);
    expect(saveCount() - savesBefore).toBe(1);
  });

  test('does not refresh for what it is already showing', async () => {
    const before = getScriptRequests();

    record(['one']);
    await settle();

    expect(getScriptRequests()).toBe(before);
  });

  test('refreshes for a change made by something else, and drops the undo steps', async () => {
    clickRowButton(0, 'Move down');
    await flush();
    stored = ['one'];
    refreshView();
    await flush();
    // Something that can be undone
    stored = ['one', 'two'];
    refreshView();
    await flush();
    clickRowButton(0, 'Move down');
    await flush();
    expect(undoButton().disabled).toBe(false);

    record(['x', 'y', 'z']);
    await settle();

    expect(rowTexts()).toHaveLength(3);
    expect(undoButton().disabled).toBe(true);
  });

  test('shows a statement stored after the recording has stopped', async () => {
    recording(true);
    recording(false);
    await flush();

    record(['one', 'two', 'three']);
    await settle();

    expect(rowTexts()).toHaveLength(3);
    expect(message()).toBe('3 statement(s)');
  });

  test('shows the script as soon as the recording stops', async () => {
    recording(true);
    record(['a', 'b']);
    const before = getScriptRequests();

    recording(false);
    await flush();

    expect(getScriptRequests() - before).toBe(1);
    expect(rowTexts()).toHaveLength(2);
    // and the refresh that was waiting is not done as well
    await settle();
    expect(getScriptRequests() - before).toBe(1);
  });

  test('waits until the tab can be seen', async () => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    recording(true);
    const before = getScriptRequests();

    record(['one', 'two']);
    await settle();

    expect(getScriptRequests()).toBe(before);
    expect(rowTexts()).toHaveLength(1);

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();

    expect(rowTexts()).toHaveLength(2);
  });

  test('showing the tab again does nothing if nothing changed', async () => {
    const before = getScriptRequests();

    document.dispatchEvent(new Event('visibilitychange'));
    await flush();

    expect(getScriptRequests()).toBe(before);
  });

  test('scrolls to the newest statement', async () => {
    recording(true);

    record(['one', 'two', 'three']);
    await settle();

    expect(scrollIntoView).toHaveBeenCalled();
    const lastCall = scrollIntoView.mock.calls.length - 1;
    expect(scrollIntoView.mock.contexts[lastCall]).toBe(lastRow());
    expect(scrollIntoView.mock.calls[lastCall][0]).toEqual({block: 'nearest'});
  });

  test('does not scroll if the page has been scrolled up', async () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 5000,
    });
    recording(true);

    record(['one', 'two', 'three']);
    await settle();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  test('does not scroll when it is not recording', async () => {
    record(['one', 'two', 'three']);
    await settle();

    expect(rowTexts()).toHaveLength(3);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  test('editing is not possible while recording', async () => {
    recording(true);
    record(['one', 'two']);
    await settle();

    expect(
      (document.getElementById('add-btn') as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (document.getElementById('run-btn') as HTMLButtonElement).disabled
    ).toBe(true);
  });
});

describe('when the buttons of a row are shown', () => {
  // The rules of the page's style sheet as selectors and declarations
  function rules(): {selectors: string[]; declarations: string}[] {
    const css = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n')
      // Not the rules inside a media query, which are not about the buttons
      .replace(/@media[^{]*\{[^}]*\{[^}]*\}\s*\}/g, '');
    return css
      .split('}')
      .filter((rule) => rule.includes('{'))
      .map((rule) => {
        const [selectors, declarations] = rule.split('{');
        return {
          selectors: selectors.split(',').map((sel) => sel.trim()),
          declarations: declarations.trim(),
        };
      });
  }

  const buttonRules = (): ReturnType<typeof rules> =>
    rules().filter((rule) =>
      rule.selectors.some((sel) => sel.includes('td.actions button'))
    );

  beforeEach(async () => {
    stored = ['one', 'two', 'three'];
    refreshView();
    await flush();
  });

  test('they are hidden unless a rule shows them', () => {
    const hidden = buttonRules().filter(
      (rule) =>
        rule.selectors.includes('td.actions button') &&
        /opacity:\s*0;/.test(rule.declarations)
    );

    expect(hidden).toHaveLength(1);
  });

  test('only hovering or focusing a row shows its buttons', () => {
    const shown = buttonRules().filter(
      (rule) =>
        !rule.selectors.some((sel) => sel.startsWith('#script-table.locked')) &&
        /opacity:\s*(1|0\.3);/.test(rule.declarations)
    );

    expect(shown.length).toBeGreaterThan(0);
    shown.forEach((rule) =>
      rule.selectors.forEach((sel) =>
        expect(sel).toMatch(/^tr:(hover|focus-within) td\.actions button/)
      )
    );
  });

  test('being selected does not show the buttons of a row', () => {
    buttonRules().forEach((rule) =>
      rule.selectors.forEach((sel) => expect(sel).not.toContain('selected'))
    );
  });

  test('a row that has been moved is selected, with its buttons there but hidden', async () => {
    clickRowButton(0, 'Move down');
    await flush();

    const moved = document.querySelectorAll('#script-body tr')[1];
    expect(moved.classList.contains('selected')).toBe(true);
    expect(moved.querySelectorAll('td.actions button')).toHaveLength(4);
    // Only the moved row is selected
    expect(document.querySelectorAll('#script-body tr.selected')).toHaveLength(
      1
    );
  });
});

describe('updating the table', () => {
  const tableRows = (): HTMLTableRowElement[] =>
    Array.from(document.querySelectorAll('#script-body tr'));
  const table = (): HTMLElement =>
    document.getElementById('script-table') as HTMLElement;
  const buttonOf = (
    row: HTMLTableRowElement,
    title: string
  ): HTMLButtonElement =>
    row.querySelector(`button[title="${title}"]`) as HTMLButtonElement;

  async function show(comments: string[]): Promise<void> {
    stored = comments;
    refreshView();
    await flush();
  }

  beforeEach(async () => {
    await show(['one', 'two', 'three']);
  });

  test('keeps the same rows when statements move', async () => {
    const before = tableRows();

    clickRowButton(0, 'Move down');
    await flush();

    // Replacing them would lose the hover of the row under the mouse
    expect(rowTexts()).toEqual([
      'Comment: two',
      'Comment: one',
      'Comment: three',
    ]);
    tableRows().forEach((row, i) => expect(row).toBe(before[i]));
  });

  test('keeps the same rows for a refresh with the same number of statements', async () => {
    const before = tableRows();

    await show(['a', 'b', 'c']);

    expect(rowTexts()).toEqual(['Comment: a', 'Comment: b', 'Comment: c']);
    tableRows().forEach((row, i) => expect(row).toBe(before[i]));
  });

  test('removes the rows that are no longer needed, keeping the others', async () => {
    const before = tableRows();

    await show(['a']);

    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0]).toBe(before[0]);
    expect(rowTexts()).toEqual(['Comment: a']);
  });

  test('adds rows for more statements, keeping the ones there', async () => {
    const before = tableRows();

    await show(['a', 'b', 'c', 'd', 'e']);

    expect(tableRows()).toHaveLength(5);
    before.forEach((row, i) => expect(tableRows()[i]).toBe(row));
    expect(rowTexts()).toHaveLength(5);
  });

  test('shows the numbers of the statements', async () => {
    await show(['a', 'b']);

    expect(tableRows().map((row) => row.cells[0].textContent)).toEqual([
      '1',
      '2',
    ]);
  });

  test('empties the table, and brings it back, for a script with nothing in it', async () => {
    await show([]);
    expect(tableRows()).toHaveLength(0);
    expect(table().hidden).toBe(true);

    await show(['a', 'b']);

    expect(tableRows()).toHaveLength(2);
    expect(table().hidden).toBe(false);
    expect(rowTexts()).toEqual(['Comment: a', 'Comment: b']);
  });

  test('clears the results of a run, as a new table would have', async () => {
    const row = tableRows()[1];
    row.classList.add('ok');
    row.cells[3].textContent = '✓';
    tableRows()[2].classList.add('failed');

    await show(['a', 'b', 'c']);

    tableRows().forEach((r) => {
      expect(r.classList.contains('ok')).toBe(false);
      expect(r.classList.contains('failed')).toBe(false);
      expect(r.cells[3].textContent).toBe('');
    });
  });

  test('shows which row is selected, in the row that is there', async () => {
    tableRows()[1].click();
    expect(tableRows().map((r) => r.classList.contains('selected'))).toEqual([
      false,
      true,
      false,
    ]);

    await show(['a', 'b', 'c']);

    expect(tableRows().map((r) => r.classList.contains('selected'))).toEqual([
      false,
      true,
      false,
    ]);
  });

  test('shows a selected row that goes away as not selected', async () => {
    tableRows()[2].click();

    await show(['a']);

    expect(tableRows().some((r) => r.classList.contains('selected'))).toBe(
      false
    );
  });

  test('shows a statement that is not enabled as such, and then as enabled', async () => {
    tableRows()[0].classList.add('disabled');

    await show(['a', 'b', 'c']);

    expect(tableRows()[0].classList.contains('disabled')).toBe(false);
  });

  test('the buttons of the rows are right for the statements that are there', async () => {
    const rowsBefore = tableRows();
    expect(buttonOf(rowsBefore[0], 'Move up').disabled).toBe(true);

    clickRowButton(0, 'Move down');
    await flush();
    await show(['a', 'b']);

    const rows = tableRows();
    expect(buttonOf(rows[0], 'Move up').disabled).toBe(true);
    expect(buttonOf(rows[0], 'Move down').disabled).toBe(false);
    expect(buttonOf(rows[1], 'Move up').disabled).toBe(false);
    expect(buttonOf(rows[1], 'Move down').disabled).toBe(true);
  });

  test('a button acts on the statement that is in its row now', async () => {
    clickRowButton(0, 'Move down');
    await flush();
    expect(stored).toEqual(['two', 'one', 'three']);

    // Row 1 holds "one" now, and was made for row 1 when there were three rows
    clickRowButton(1, 'Move down');
    await flush();

    expect(stored).toEqual(['two', 'three', 'one']);
  });

  test('a statement that cannot be edited has no edit button, and no double click', async () => {
    await show(['?odd', 'plain']);
    const rows = tableRows();
    const before = saveCount();

    expect(buttonOf(rows[0], 'Edit').hidden).toBe(true);
    expect(buttonOf(rows[1], 'Edit').hidden).toBe(false);
    rows[0].dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
    expect(dialogOpen('edit-dialog')).toBe(false);
    rows[1].dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
    expect(dialogOpen('edit-dialog')).toBe(true);
    expect(saveCount()).toBe(before);
    (document.getElementById('edit-cancel') as HTMLButtonElement).click();
  });

  test('the edit button follows the statement type when the rows are reused', async () => {
    await show(['?odd', 'plain']);
    expect(buttonOf(tableRows()[0], 'Edit').hidden).toBe(true);

    await show(['plain', '?odd']);

    expect(buttonOf(tableRows()[0], 'Edit').hidden).toBe(false);
    expect(buttonOf(tableRows()[1], 'Edit').hidden).toBe(true);
  });
});

describe('how the table shows that changes are not possible', () => {
  const table = (): HTMLElement =>
    document.getElementById('script-table') as HTMLElement;
  const recordingFlag = (active: boolean): void =>
    (Browser.storage.onChanged.addListener as jest.Mock).mock.calls[0][0]({
      zaprecordingactive: {newValue: active},
    });

  beforeEach(async () => {
    stored = ['one', 'two'];
    refreshView();
    await flush();
  });

  test('is not shown while a change is being saved, as it is over too soon to see', async () => {
    let release: () => void = () => {};
    holdSave = new Promise<void>((resolve) => {
      release = resolve;
    });

    clickRowButton(0, 'Move down');
    await flush();

    // Busy, so that nothing can be clicked, but nothing changes in how it looks
    expect(table().classList.contains('busy')).toBe(true);
    expect(table().classList.contains('locked')).toBe(false);

    holdSave = undefined;
    release();
    await flush();
    expect(table().classList.contains('busy')).toBe(false);
    expect(table().classList.contains('locked')).toBe(false);
  });

  test('is not shown while the script is being loaded', async () => {
    let release: () => void = () => {};
    holdLoads.push(
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );

    refreshView();
    await flush();
    expect(table().classList.contains('busy')).toBe(true);
    expect(table().classList.contains('locked')).toBe(false);

    release();
    await flush();
    expect(table().classList.contains('busy')).toBe(false);
  });

  test('is shown for as long as a recording is made', async () => {
    recordingFlag(true);

    expect(table().classList.contains('locked')).toBe(true);
    expect(table().classList.contains('busy')).toBe(false);

    recordingFlag(false);
    await flush();
    expect(table().classList.contains('locked')).toBe(false);
  });

  test('is shown for as long as the script cannot be loaded', async () => {
    failLoads = 1;
    refreshView();
    await flush();

    expect(table().classList.contains('locked')).toBe(true);

    refreshView();
    await flush();
    expect(table().classList.contains('locked')).toBe(false);
  });

  test('is shown for as long as a script is being run', async () => {
    let finish: (ok: boolean) => void = () => {};
    mockPlay.mockReset();
    mockPlay.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      })
    );

    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flush();
    expect(table().classList.contains('locked')).toBe(true);

    finish(true);
    await flush();
    expect(table().classList.contains('locked')).toBe(false);
  });
});

describe('the style of the buttons when changes are not possible', () => {
  function rules(): {selectors: string[]; declarations: string}[] {
    const css = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n')
      .replace(/@media[^{]*\{[^}]*\{[^}]*\}\s*\}/g, '');
    return css
      .split('}')
      .filter((rule) => rule.includes('{'))
      .map((rule) => {
        const [selectors, declarations] = rule.split('{');
        return {
          selectors: selectors.split(',').map((sel) => sel.trim()),
          declarations: declarations.trim(),
        };
      });
  }

  const tableRules = (): ReturnType<typeof rules> =>
    rules().filter((rule) =>
      rule.selectors.some((sel) => sel.startsWith('#script-table'))
    );

  test('never makes a button show that would be hidden', () => {
    const dimming = tableRules().filter((rule) =>
      /opacity/.test(rule.declarations)
    );

    expect(dimming.length).toBeGreaterThan(0);
    dimming.forEach((rule) =>
      rule.selectors.forEach((sel) =>
        expect(sel).toMatch(/:(hover|focus-within)/)
      )
    );
  });

  test('stops a button being used, locked or busy', () => {
    const blocking = tableRules().filter((rule) =>
      /pointer-events:\s*none/.test(rule.declarations)
    );

    const selectors = blocking.flatMap((rule) => rule.selectors).join(' ');
    expect(selectors).toContain('#script-table.locked td.actions button');
    expect(selectors).toContain('#script-table.busy td.actions button');
  });

  test('busy has no effect on how the buttons look', () => {
    tableRules()
      .filter((rule) => rule.selectors.some((sel) => sel.includes('.busy')))
      .forEach((rule) =>
        expect(rule.declarations).not.toMatch(/opacity|visibility/)
      );
  });
});

describe('the focus after using a button of a row', () => {
  const rows = (): HTMLTableRowElement[] =>
    Array.from(document.querySelectorAll('#script-body tr'));
  const button = (row: number, title: string): HTMLButtonElement =>
    rows()[row].querySelector(`button[title="${title}"]`) as HTMLButtonElement;
  const focusInTable = (): boolean =>
    (document.getElementById('script-table') as HTMLElement).contains(
      document.activeElement
    );

  // As when the mouse is used, which gives the button the focus before the click
  function mouseClick(target: HTMLButtonElement): void {
    target.focus();
    target.dispatchEvent(
      new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1})
    );
  }

  beforeEach(async () => {
    stored = ['one', 'two', 'three'];
    refreshView();
    await flush();
    (document.activeElement as HTMLElement | null)?.blur();
  });

  test('a button that is clicked with the mouse does not keep it', async () => {
    mouseClick(button(0, 'Move down'));
    await flush();

    expect(stored).toEqual(['two', 'one', 'three']);
    expect(focusInTable()).toBe(false);
  });

  test.each(['Move up', 'Move down'])(
    'moving with %s does not leave it in the table',
    async (title) => {
      mouseClick(button(1, title));
      await flush();

      expect(focusInTable()).toBe(false);
    }
  );

  test('deleting with the mouse does not leave it in the table', async () => {
    mouseClick(button(1, 'Delete'));
    (document.getElementById('confirm-ok') as HTMLButtonElement).click();
    await flush();

    expect(stored).toEqual(['one', 'three']);
    expect(focusInTable()).toBe(false);
  });

  test('editing with the mouse does not leave it in the table', async () => {
    mouseClick(button(1, 'Edit'));
    expect(dialogOpen('edit-dialog')).toBe(true);
    (document.getElementById('edit-cancel') as HTMLButtonElement).click();

    expect(focusInTable()).toBe(false);
  });

  test('a button used with the keyboard keeps it, so it can be used again', async () => {
    const down = button(0, 'Move down');
    down.focus();

    // A click made by the keyboard has no detail
    down.click();
    await flush();

    expect(stored).toEqual(['two', 'one', 'three']);
    // The same button, as the rows are kept, and still with the focus
    expect(button(0, 'Move down')).toBe(down);
    expect(document.activeElement).toBe(down);

    down.click();
    await flush();
    expect(stored).toEqual(['one', 'two', 'three']);
  });

  test('a click on a button does not select its row', async () => {
    mouseClick(button(2, 'Move up'));
    await flush();

    // The row that was moved is selected, which is by the move itself
    const selected = rows().filter((r) => r.classList.contains('selected'));
    expect(selected).toHaveLength(1);
    expect(rows().indexOf(selected[0])).toBe(1);
  });
});

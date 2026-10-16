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
      elementType: 'ZestComment',
      comment,
    })),
  });

const mockSyncStore: Record<string, unknown> = {};
let stored: string[] = ['first', 'second'];
let failSave = false;
let holdSave: Promise<void> | undefined;

const sendMessage = jest.fn((request: {type: string; data?: unknown[]}) => {
  if (request.type === 'getZestScript') {
    return Promise.resolve({
      script: script(stored),
      title: 'My script',
      statementCount: stored.length,
    });
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

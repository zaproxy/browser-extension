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
import * as path from 'path';

const RECORDER = 'ZAP by Checkmarx Recorder';
const FULL = 'ZAP by Checkmarx Browser Extension';

let mockStored: Record<string, unknown> = {};
const mockSet = jest.fn();

const html = fs.readFileSync(
  path.join(__dirname, '..', '..', 'views', 'options.html'),
  'utf8'
);

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

// Each load of the page adds a listener to the document, which would still be
// there for the next one, so they are taken away
const added: [string, EventListenerOrEventListenerObject][] = [];

function removeListeners(): void {
  added
    .splice(0)
    .forEach(([type, listener]) =>
      document.removeEventListener(type, listener)
    );
}

// Loads the page as the extension with the given name would show it
async function load(manifestName: string | undefined): Promise<void> {
  jest.resetModules();
  jest.doMock('webextension-polyfill', () => ({
    __esModule: true,
    default: {
      runtime: {
        getManifest: manifestName
          ? (): {name: string} => ({name: manifestName})
          : undefined,
      },
      storage: {
        sync: {
          get: (defaults: Record<string, unknown>): Promise<unknown> =>
            Promise.resolve({...defaults, ...mockStored}),
          set: (items: Record<string, unknown>): void => mockSet(items),
        },
      },
    },
  }));
  removeListeners();
  document.documentElement.innerHTML = html;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  const addListener = document.addEventListener.bind(document);
  jest
    .spyOn(document, 'addEventListener')
    .mockImplementation((type, listener, options) => {
      added.push([type, listener]);
      addListener(type, listener, options);
    });
  // eslint-disable-next-line node/no-unsupported-features/es-syntax
  await import('../../source/Options/index');
  jest.restoreAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flush();
  // Saving would otherwise try to submit the form
  (document.querySelector('form') as HTMLFormElement).addEventListener(
    'submit',
    (e) => e.preventDefault()
  );
}

const byId = (id: string): HTMLElement =>
  document.getElementById(id) as HTMLElement;
const isShown = (el: Element | null): boolean =>
  el !== null && el.closest('[hidden]') === null;
const rowOf = (id: string): Element | null => byId(id).closest('tr');

beforeEach(() => {
  mockSet.mockClear();
  mockStored = {};
});

afterEach(() => {
  removeListeners();
  jest.restoreAllMocks();
});

describe('the recorder', () => {
  beforeEach(() => load(RECORDER));

  test('does not show the text about giving ZAP access to the browser', () => {
    const intro = Array.from(document.querySelectorAll('.full-only')).filter(
      (el) => el.tagName === 'DIV'
    );

    expect(intro).toHaveLength(2);
    intro.forEach((el) => expect(isShown(el)).toBe(false));
    expect(document.body.textContent).toContain('gives ZAP access');
  });

  test('does not show the ZAP url', () => {
    expect(isShown(byId('zapurl'))).toBe(false);
    expect(isShown(rowOf('zapurl'))).toBe(false);
  });

  test('does not show the ZAP api key', () => {
    expect(isShown(byId('zapkey'))).toBe(false);
    expect(isShown(rowOf('zapkey'))).toBe(false);
  });

  test('does not show the checkbox to enable ZAP', () => {
    expect(isShown(byId('zapenable'))).toBe(false);
    expect(isShown(rowOf('zapenable'))).toBe(false);
  });

  test('shows the options that apply to it', () => {
    expect(isShown(byId('window-close-input'))).toBe(true);
    expect(isShown(byId('statement-delay-input'))).toBe(true);
    expect(isShown(byId('save'))).toBe(true);
  });

  test('is called by its own name', () => {
    expect(byId('title').textContent).toBe(RECORDER);
  });

  test('shows the options as they are stored', async () => {
    mockStored = {zapstatementdelay: 250, zapclosewindowhandle: false};
    await load(RECORDER);

    expect((byId('statement-delay-input') as HTMLInputElement).value).toBe(
      '250'
    );
    expect((byId('window-close-input') as HTMLInputElement).checked).toBe(
      false
    );
  });

  test('leaves the setting to enable ZAP as it is, even if it was set', async () => {
    mockStored = {zapenable: true};
    await load(RECORDER);

    byId('save').click();

    expect(mockSet.mock.calls[0][0]).not.toHaveProperty('zapenable');
  });

  test('saves its options, but not the ones for ZAP', () => {
    (byId('statement-delay-input') as HTMLInputElement).value = '300';
    (byId('window-close-input') as HTMLInputElement).checked = false;

    byId('save').click();

    expect(mockSet).toHaveBeenCalledTimes(1);
    const saved = mockSet.mock.calls[0][0];
    expect(saved).toMatchObject({
      zapclosewindowhandle: false,
      zapstatementdelay: 300,
    });
    expect(saved).not.toHaveProperty('zapurl');
    expect(saved).not.toHaveProperty('zapkey');
    expect(saved).not.toHaveProperty('zapenable');
  });
});

describe('the full extension', () => {
  beforeEach(() => load(FULL));

  test('shows the text about giving ZAP access to the browser', () => {
    document
      .querySelectorAll('.full-only')
      .forEach((el) => expect(isShown(el)).toBe(true));
    expect(document.body.textContent).toContain('gives ZAP access');
  });

  test('shows the ZAP url and api key', () => {
    expect(isShown(byId('zapurl'))).toBe(true);
    expect(isShown(byId('zapkey'))).toBe(true);
  });

  test('shows all of the other options', () => {
    [
      'zapenable',
      'window-close-input',
      'statement-delay-input',
      'save',
    ].forEach((id) => expect(isShown(byId(id))).toBe(true));
  });

  test('is called by its own name', () => {
    expect(byId('title').textContent).toBe(FULL);
  });

  test('shows the options as they are stored', async () => {
    mockStored = {zapurl: 'http://localhost:8080/', zapkey: 'secret'};
    await load(FULL);

    expect((byId('zapurl') as HTMLInputElement).value).toBe(
      'http://localhost:8080/'
    );
    expect((byId('zapkey') as HTMLInputElement).value).toBe('secret');
  });

  test('saves all of its options', async () => {
    mockStored = {zapurl: 'http://localhost:8080/', zapkey: 'secret'};
    await load(FULL);
    (byId('statement-delay-input') as HTMLInputElement).value = '300';

    byId('save').click();

    expect(mockSet.mock.calls[0][0]).toMatchObject({
      zapurl: 'http://localhost:8080/',
      zapkey: 'secret',
      zapstatementdelay: 300,
      zapclosewindowhandle: true,
      zapenable: false,
    });
  });
});

describe('when the manifest cannot be read', () => {
  test('the page is still shown, as the full extension', async () => {
    await load(undefined);

    expect(isShown(byId('zapurl'))).toBe(true);
    expect(byId('title').textContent).toBe(FULL);
  });
});

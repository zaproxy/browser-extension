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
import Browser from 'webextension-polyfill';

jest.mock('../../source/Popup/styles.scss', () => ({}));

jest.mock('webextension-polyfill', () => ({
  __esModule: true,
  default: {
    runtime: {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      getURL: (page: string): string => `ext://id/${page}`,
    },
    tabs: {
      query: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      sendMessage: jest.fn(),
    },
    storage: {sync: {get: jest.fn(), set: jest.fn()}},
  },
}));

const mocks = Browser as unknown as {
  runtime: {sendMessage: jest.Mock};
  tabs: {
    query: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    sendMessage: jest.Mock;
  };
  storage: {sync: {get: jest.Mock; set: jest.Mock}};
};

const VIEWER_TAB = {id: 50, windowId: 1};
const CURRENT_TAB = {id: 1, windowId: 1};

let viewerOpen = false;
let recordingActive = false;

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const created = (): {url: string; active: boolean}[] =>
  mocks.tabs.create.mock.calls.map((c) => c[0]);

async function clickRecord(loginUrl = ''): Promise<void> {
  (document.getElementById('login-url-input') as HTMLInputElement).value =
    loginUrl;
  (document.getElementById('record-btn') as HTMLElement).click();
  await flush();
  await flush();
}

beforeAll(async () => {
  document.body.innerHTML = fs.readFileSync(
    path.join(__dirname, '..', '..', 'views', 'popup.html'),
    'utf8'
  );
  window.matchMedia = jest.fn().mockReturnValue({
    matches: false,
    addEventListener: jest.fn(),
  });
  window.close = jest.fn();
  // eslint-disable-next-line node/no-unsupported-features/es-syntax
  await import('../../source/Popup/index');
});

beforeEach(() => {
  jest.clearAllMocks();
  viewerOpen = false;
  recordingActive = false;
  mocks.storage.sync.get.mockImplementation(() =>
    Promise.resolve({zaprecordingactive: recordingActive})
  );
  mocks.tabs.query.mockImplementation((query: {url?: string}) => {
    if (!query.url) {
      return Promise.resolve([CURRENT_TAB]);
    }
    return Promise.resolve(viewerOpen ? [VIEWER_TAB] : []);
  });
  mocks.tabs.create.mockImplementation((options: {url: string}) =>
    Promise.resolve({id: options.url === 'script.html' ? 2 : 3})
  );
  mocks.tabs.update.mockResolvedValue({});
  mocks.tabs.sendMessage.mockResolvedValue(undefined);
});

describe('starting a recording', () => {
  test('opens the script viewer behind the current tab', async () => {
    await clickRecord();

    expect(created()).toEqual([{url: 'script.html', active: false}]);
  });

  test('does not switch to any tab', async () => {
    await clickRecord();

    expect(mocks.tabs.update).not.toHaveBeenCalled();
  });

  test('records in the tab that was current', async () => {
    await clickRecord();

    expect(mocks.tabs.sendMessage).toHaveBeenCalledWith(1, {
      type: 'zapStartRecording',
      data: '',
    });
    expect(mocks.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'resetZestScript',
    });
    expect(mocks.storage.sync.set).toHaveBeenCalledWith({
      zaprecordingactive: true,
    });
  });

  test('does not open another if the script viewer is already open', async () => {
    viewerOpen = true;

    await clickRecord();

    expect(mocks.tabs.create).not.toHaveBeenCalled();
    expect(mocks.tabs.update).not.toHaveBeenCalled();
  });

  test('still records if the script viewer cannot be opened', async () => {
    mocks.tabs.create.mockRejectedValue(new Error('No window'));
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await clickRecord();

    expect(mocks.storage.sync.set).toHaveBeenCalledWith({
      zaprecordingactive: true,
    });
    jest.restoreAllMocks();
  });

  test('with a login url, only the login page is switched to', async () => {
    await clickRecord('https://example.com/login');

    expect(created()).toEqual([
      {url: 'https://example.com/login', active: false},
      {url: 'script.html', active: false},
    ]);
    // The login tab, which is created with the id 3
    expect(mocks.tabs.update).toHaveBeenCalledTimes(1);
    expect(mocks.tabs.update).toHaveBeenCalledWith(3, {active: true});
  });

  test('with a login url, it records in the login tab', async () => {
    await clickRecord('https://example.com/login');

    expect(mocks.tabs.sendMessage).toHaveBeenCalledWith(3, {
      type: 'zapStartRecording',
      data: '',
    });
  });
});

describe('stopping a recording', () => {
  test('does not open the script viewer', async () => {
    recordingActive = true;

    await clickRecord();

    expect(mocks.tabs.create).not.toHaveBeenCalled();
    expect(mocks.storage.sync.set).toHaveBeenCalledWith({
      zaprecordingactive: false,
    });
  });
});

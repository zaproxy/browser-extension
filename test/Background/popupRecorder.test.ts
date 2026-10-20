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
      // The name of the recorder, so this is not the full extension
      getManifest: (): {name: string} => ({name: 'ZAP by Checkmarx Recorder'}),
    },
    tabs: {
      query: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({id: 2}),
      update: jest.fn(),
      sendMessage: jest.fn(),
    },
    storage: {
      sync: {
        get: jest.fn().mockResolvedValue({zaprecordingactive: false}),
        set: jest.fn(),
      },
    },
  },
}));

const mocks = Browser as unknown as {
  tabs: {create: jest.Mock};
};

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
  mocks.tabs.create.mockClear();
});

const configureButton = (): HTMLElement =>
  document.getElementById('configure-btn') as HTMLElement;

test('the recorder has the config button, and shows it', () => {
  expect(configureButton()).not.toBeNull();
  expect(configureButton().style.visibility).not.toBe('hidden');
  expect(configureButton().hidden).toBe(false);
});

test('the config button opens the options page in the recorder', () => {
  configureButton().click();

  expect(mocks.tabs.create).toHaveBeenCalledWith({
    url: 'options.html',
    active: true,
  });
});

test('the view script button is there as well', () => {
  const view = document.getElementById('view-btn') as HTMLElement;

  expect(view).not.toBeNull();
  expect(view.style.visibility).not.toBe('hidden');
});

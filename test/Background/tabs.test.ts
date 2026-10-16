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
import showOrCreateTab from '../../source/utils/tabs';

jest.mock('webextension-polyfill', () => ({
  __esModule: true,
  default: {
    runtime: {getURL: jest.fn((page: string) => `ext://id/${page}`)},
    tabs: {query: jest.fn(), update: jest.fn(), create: jest.fn()},
    windows: {update: jest.fn()},
  },
}));

const mocks = Browser as unknown as {
  tabs: {query: jest.Mock; update: jest.Mock; create: jest.Mock};
  windows: {update: jest.Mock};
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mocks.tabs.query.mockResolvedValue([]);
  mocks.tabs.update.mockImplementation((id: number) =>
    Promise.resolve({id, windowId: 5})
  );
  mocks.tabs.create.mockResolvedValue({id: 99});
  mocks.windows.update.mockResolvedValue({});
});

test('shows the tab that is already open', async () => {
  mocks.tabs.query.mockResolvedValue([{id: 3, windowId: 5}]);

  const result = await showOrCreateTab('script.html');

  expect(mocks.tabs.query).toHaveBeenCalledWith({url: 'ext://id/script.html'});
  expect(mocks.tabs.update).toHaveBeenCalledWith(3, {active: true});
  expect(mocks.windows.update).toHaveBeenCalledWith(5, {focused: true});
  expect(mocks.tabs.create).not.toHaveBeenCalled();
  expect(result).toEqual({tab: {id: 3, windowId: 5}, existed: true});
});

test('opens a new tab if there is not one', async () => {
  const result = await showOrCreateTab('script.html');

  expect(mocks.tabs.create).toHaveBeenCalledWith({
    url: 'script.html',
    active: true,
  });
  expect(result).toEqual({tab: {id: 99}, existed: false});
});

test('opens a new tab if the browser cannot look for one', async () => {
  mocks.tabs.query.mockRejectedValue(new Error('Invalid url pattern'));

  const result = await showOrCreateTab('script.html');

  expect(mocks.tabs.create).toHaveBeenCalledTimes(1);
  expect(result.existed).toBe(false);
});

test('opens a new tab if the existing one cannot be shown', async () => {
  mocks.tabs.query.mockResolvedValue([{id: 3, windowId: 5}]);
  mocks.tabs.update.mockRejectedValue(new Error('No tab with id: 3'));

  const result = await showOrCreateTab('script.html');

  expect(mocks.tabs.create).toHaveBeenCalledTimes(1);
  expect(result.existed).toBe(false);
});

test('a failure to focus the window does not open another tab', async () => {
  mocks.tabs.query.mockResolvedValue([{id: 3, windowId: 5}]);
  mocks.windows.update.mockRejectedValue(new Error('No windows'));

  const result = await showOrCreateTab('script.html');

  expect(mocks.tabs.create).not.toHaveBeenCalled();
  expect(result.existed).toBe(true);
});

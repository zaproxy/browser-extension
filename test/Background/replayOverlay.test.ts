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
import Browser from 'webextension-polyfill';
import ReplayOverlay from '../../source/ContentScript/replayOverlay';

jest.mock('webextension-polyfill', () => ({
  __esModule: true,
  default: {
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

// The shadow root is closed, so capture it to be able to look inside
let root: ShadowRoot;
const {attachShadow} = Element.prototype;

beforeEach(() => {
  document.documentElement
    .querySelectorAll('zap-replay-overlay')
    .forEach((el) => el.remove());
  jest.spyOn(Element.prototype, 'attachShadow').mockImplementation(function spy(
    this: Element
  ) {
    root = attachShadow.call(this, {mode: 'open'});
    return root;
  });
  (Browser.storage.local.get as jest.Mock).mockResolvedValue({});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function text(selector: string): string {
  return root.querySelector(selector)?.textContent ?? '';
}

function host(): HTMLElement {
  return document.querySelector('zap-replay-overlay') as HTMLElement;
}

test('shows the status on the html element, not the body', () => {
  new ReplayOverlay().show({
    title: 'ZAP Replay',
    heading: 'Step 1 of 2',
    text: 'Click',
    state: 'running',
  });

  expect(document.documentElement.contains(host())).toBe(true);
  expect(document.body.contains(host())).toBe(false);
  expect(text('.title')).toBe('ZAP Replay');
  expect(text('.heading')).toBe('Step 1 of 2');
  expect(text('.text')).toBe('Click');
  expect(host().style.display).toBe('block');
});

test('reuses the box and updates it', () => {
  const overlay = new ReplayOverlay();
  overlay.show({
    title: 'ZAP Replay',
    heading: 'a',
    text: 'b',
    state: 'running',
  });
  overlay.show({title: 'ZAP Replay', heading: 'c', text: 'd', state: 'failed'});

  expect(document.querySelectorAll('zap-replay-overlay')).toHaveLength(1);
  expect(text('.heading')).toBe('c');
  expect(
    (root.querySelector('.box') as HTMLElement).style.borderColor
  ).not.toBe('');
});

test('is recreated if the page removes it', () => {
  const overlay = new ReplayOverlay();
  overlay.show({
    title: 'ZAP Replay',
    heading: 'a',
    text: 'b',
    state: 'running',
  });
  host().remove();
  overlay.show({
    title: 'ZAP Replay',
    heading: 'a',
    text: 'b',
    state: 'running',
  });

  expect(document.querySelectorAll('zap-replay-overlay')).toHaveLength(1);
});

test('hides itself after the given time', () => {
  jest.useFakeTimers();
  new ReplayOverlay().show(
    {title: 'ZAP Replay', heading: 'a', text: 'b', state: 'ok'},
    1000
  );
  expect(host().style.display).toBe('block');

  jest.advanceTimersByTime(1000);

  expect(host().style.display).toBe('none');
});

test('a later status cancels a pending hide', () => {
  jest.useFakeTimers();
  const overlay = new ReplayOverlay();
  overlay.show(
    {title: 'ZAP Replay', heading: 'a', text: 'b', state: 'ok'},
    1000
  );
  overlay.show({
    title: 'ZAP Replay',
    heading: 'c',
    text: 'd',
    state: 'running',
  });

  jest.advanceTimersByTime(2000);

  expect(host().style.display).toBe('block');
});

test('action buttons call back once and are then disabled', () => {
  const next = jest.fn();
  const cancel = jest.fn();
  new ReplayOverlay().show(
    {title: 'ZAP Replay', heading: 'a', text: 'b', state: 'running'},
    0,
    [
      {label: 'Next', onClick: next},
      {label: 'Cancel', onClick: cancel},
    ]
  );
  const buttons = Array.from(root.querySelectorAll('button'));
  expect(buttons.map((b) => b.textContent)).toEqual(['Next', 'Cancel']);

  buttons[0].click();

  expect(next).toHaveBeenCalledTimes(1);
  expect(buttons.every((b) => b.disabled)).toBe(true);
  buttons[1].click();
  expect(cancel).not.toHaveBeenCalled();
});

test('actions are cleared by the next status', () => {
  const overlay = new ReplayOverlay();
  overlay.show(
    {title: 'ZAP Replay', heading: 'a', text: 'b', state: 'running'},
    0,
    [{label: 'Next', onClick: jest.fn()}]
  );
  overlay.show({
    title: 'ZAP Replay',
    heading: 'c',
    text: 'd',
    state: 'running',
  });

  expect(root.querySelectorAll('button')).toHaveLength(0);
});

test('restores the saved position', async () => {
  (Browser.storage.local.get as jest.Mock).mockResolvedValue({
    zapreplayoverlaypos: {left: 0.5, top: 0.25},
  });
  new ReplayOverlay().show({
    title: 'ZAP Replay',
    heading: 'a',
    text: 'b',
    state: 'running',
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  expect(host().style.left).toBe(`${0.5 * window.innerWidth}px`);
  expect(host().style.top).toBe(`${0.25 * window.innerHeight}px`);
});

test('does not throw if it cannot be created', () => {
  // The overlay logs the problem it is given, which is expected here
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(document, 'createElement').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(() =>
    new ReplayOverlay().show({
      title: 'ZAP Replay',
      heading: 'a',
      text: 'b',
      state: 'running',
    })
  ).not.toThrow();
});

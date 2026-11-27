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
// It runs in the page, where the extension APIs are not available.
jest.unmock('webextension-polyfill');

// The contract with the recorder, in the extension's world.
const SHADOW_ATTACHED_EVENT = 'zap-shadow-attached';
const SHADOW_TRACKING_START_EVENT = 'zap-shadow-tracking-start';
const SHADOW_TRACKING_STOP_EVENT = 'zap-shadow-tracking-stop';

const {attachShadow} = Element.prototype;

beforeAll(() => {
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    require('../../source/ContentScript/shadowTracker');
  });
});

afterAll(() => {
  Element.prototype.attachShadow = attachShadow;
});

beforeEach(() => {
  document.body.innerHTML = '';
  document.dispatchEvent(new CustomEvent(SHADOW_TRACKING_START_EVENT));
});

/** The targets of the notifications, from now on. */
function listenAttached(): EventTarget[] {
  const seen: EventTarget[] = [];
  document.addEventListener(SHADOW_ATTACHED_EVENT, (event) =>
    seen.push(event.target as EventTarget)
  );
  return seen;
}

function attachConnected(): EventTarget[] {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const seen = listenAttached();
  host.attachShadow({mode: 'open'});
  return seen;
}

test('should patch attachShadow', () => {
  expect(Element.prototype.attachShadow).not.toBe(attachShadow);
});

test('should keep the native signature of attachShadow', () => {
  const patched = Element.prototype.attachShadow;
  expect(Function.prototype.toString.call(patched)).toContain('[native code]');
  expect(patched.name).toBe('attachShadow');
  expect(patched.length).toBe(attachShadow.length);
});

test('should notify the shadow roots attached to connected hosts', () => {
  // Given
  const host = document.createElement('div');
  document.body.appendChild(host);
  const seen = listenAttached();
  // When
  const root = host.attachShadow({mode: 'closed'});
  // Then
  expect(root).toBeInstanceOf(ShadowRoot);
  expect(seen).toEqual([host]);
});

test('should not notify the shadow roots attached to disconnected hosts', () => {
  // Given
  const host = document.createElement('div');
  const seen = listenAttached();
  // When
  host.attachShadow({mode: 'open'});
  // Then
  expect(seen).toEqual([]);
});

test('should not notify before the tracking is started', () => {
  // Given
  jest.isolateModules(() => {
    Element.prototype.attachShadow = attachShadow;
    // eslint-disable-next-line global-require
    require('../../source/ContentScript/shadowTracker');
  });
  // When
  const seen = attachConnected();
  // Then
  expect(seen).toEqual([]);
});

test('should not notify after the tracking is stopped', () => {
  // Given
  document.dispatchEvent(new CustomEvent(SHADOW_TRACKING_STOP_EVENT));
  // When
  const seen = attachConnected();
  // Then
  expect(seen).toEqual([]);
});

test('should notify again when the tracking is restarted', () => {
  // Given
  document.dispatchEvent(new CustomEvent(SHADOW_TRACKING_STOP_EVENT));
  document.dispatchEvent(new CustomEvent(SHADOW_TRACKING_START_EVENT));
  // When
  const seen = attachConnected();
  // Then
  expect(seen).toHaveLength(1);
});

test('should still throw the errors of attachShadow', () => {
  const host = document.createElement('div');
  host.attachShadow({mode: 'open'});
  expect(() => host.attachShadow({mode: 'open'})).toThrow();
});

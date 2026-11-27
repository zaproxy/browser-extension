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
import {getPath, snapshotInputClass} from '../../source/ContentScript/util';
import {installCssEscape} from './shadowMocks';

jest.mock('webextension-polyfill');

beforeAll(installCssEscape);

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

function openRoot(html: string): ShadowRoot {
  const root = (document.getElementById('host') as HTMLElement).attachShadow({
    mode: 'open',
  });
  root.innerHTML = html;
  return root;
}

test('should record a selector that finds the element when the structure repeats', () => {
  // Given: the chain of the top level span also matches the span nested before it
  const root = openRoot(
    '<section><div><span></span></div></section><div><span></span></div>'
  );
  const spans = root.querySelectorAll('span');
  // When / Then
  spans.forEach((span) => {
    const path = getPath(span as HTMLElement, document);
    expect(path.type).toBe('cssSelector');
    expect(path.shadowPath).toEqual(['#host']);
    expect(root.querySelector(path.element)).toBe(span);
  });
});

test('should use the id of the host and of the element', () => {
  // Given
  document.body.innerHTML =
    '<div><div></div></div><section><div><div id="target"></div></div></section>';
  const host = document.getElementById('target') as HTMLElement;
  host.attachShadow({mode: 'open'}).innerHTML = '<button id="b"></button>';
  const inner = host.shadowRoot?.getElementById('b') as HTMLElement;
  // When
  const path = getPath(inner, document);
  // Then
  expect(path.shadowPath).toEqual(['#target']);
  expect(path.element).toBe('#b');
});

test('should not record a class that changes as the selector of an element in a shadow root', () => {
  // Given
  const root = openRoot('<input class="plain"><input>');
  const input = root.querySelector('input') as HTMLInputElement;
  snapshotInputClass(input);
  input.className = 'active';
  // When
  const path = getPath(input, document);
  // Then
  expect(path.element).not.toContain('plain');
  expect(path.element).not.toContain('active');
  expect(root.querySelector(path.element)).toBe(input);
});

test('should record a selector that finds an element without id or class', () => {
  // Given
  const root = openRoot('<p></p><p></p><p></p>');
  const target = root.querySelectorAll('p')[2];
  // When
  const path = getPath(target as HTMLElement, document);
  // Then
  expect(root.querySelector(path.element)).toBe(target);
});

test('should locate a slotted element in its own document, not in the root it is slotted into', () => {
  // Given
  document.body.innerHTML =
    '<div id="host"><input class="slotted"></div><input class="other">';
  const root = openRoot('<slot></slot>');
  const input = document.querySelector('.slotted') as HTMLElement;
  // When
  const path = getPath(input, root);
  // Then
  expect(path.type).toBe('className');
  expect(path.element).toBe('slotted');
  expect(path.shadowPath).toEqual([]);
});

test('should record a selector that finds an element under an SVG element with a mixed case name', () => {
  // Given
  const root = openRoot(
    '<svg><foreignObject><button></button></foreignObject></svg>'
  );
  const button = root.querySelector('button') as HTMLElement;
  // When
  const path = getPath(button, document);
  // Then
  expect(path.element).toContain('foreignObject');
  expect(root.querySelector(path.element)).toBe(button);
});

test('should record a selector that finds an element of the first top level element of the root', () => {
  // Given: the chain of the target also matches the span nested before it, and the top level
  // element has no previous siblings to anchor it
  const root = openRoot(
    '<div><div><span>B</span></div><span>T</span></div><p></p>'
  );
  const target = root.querySelectorAll('span')[1];
  // When
  const path = getPath(target as HTMLElement, document);
  // Then
  expect(root.querySelector(path.element)).toBe(target);
});

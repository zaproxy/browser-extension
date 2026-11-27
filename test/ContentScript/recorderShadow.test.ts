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
import Recorder from '../../source/ContentScript/recorder';
import {attachRoot, installClosedRoots, installCssEscape} from './shadowMocks';

jest.mock('webextension-polyfill');

const closedRoots = installClosedRoots();
let recorder: Recorder;

beforeAll(installCssEscape);

beforeEach(() => {
  document.body.innerHTML = '';
  recorder = new Recorder();
  recorder.active = true;
  // jsdom has no layout
  jest.spyOn(recorder, 'isVisible').mockReturnValue(true);
  jest.spyOn(recorder, 'sendZestScriptToZAP').mockResolvedValue(undefined);
});

function attach(host: Element, mode: ShadowRootMode, html = ''): ShadowRoot {
  return attachRoot(closedRoots, host, mode, html);
}

function byId(root: Document | ShadowRoot, id: string): HTMLElement {
  return root.getElementById(id) as HTMLElement;
}

/** The statements of the given types sent to ZAP, as JSON. */
function recorded(...elementTypes: string[]): Record<string, unknown>[] {
  return (recorder.sendZestScriptToZAP as jest.Mock).mock.calls
    .map(([statement]) => JSON.parse(statement.toJSON()))
    .filter((json) => elementTypes.includes(json.elementType));
}

function clickOn(target: EventTarget): void {
  target.dispatchEvent(
    new MouseEvent('click', {bubbles: true, composed: true, detail: 1})
  );
}

function addHost(mode: ShadowRootMode): {
  host: HTMLElement;
  root: ShadowRoot;
} {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = attach(host, mode, '<button id="inner"></button>');
  recorder.shadowHosts.add(host);
  return {host, root};
}

/** The result of `shouldRecord` for the event as seen by a listener of the host. */
function seenByHost(
  host: HTMLElement,
  dispatchOn: HTMLElement,
  init: MouseEventInit
): boolean {
  let result: boolean | undefined;
  host.addEventListener('click', (event) => {
    result = recorder.shouldRecord(host, event);
  });
  dispatchOn.dispatchEvent(
    new MouseEvent('click', {bubbles: true, composed: true, ...init})
  );
  return result as boolean;
}

describe('events seen with a shadow host as the target', () => {
  test('click on a closed root is recorded when the point is not in its content', () => {
    const {host, root} = addHost('closed');
    root.elementFromPoint = (): Element | null => null;
    expect(seenByHost(host, host, {detail: 1, clientX: 5, clientY: 5})).toBe(
      true
    );
  });

  test('click on a closed root is not recorded when the point is in its content', () => {
    const {host, root} = addHost('closed');
    root.elementFromPoint = (): Element | null => root.getElementById('inner');
    expect(seenByHost(host, host, {detail: 1, clientX: 5, clientY: 5})).toBe(
      false
    );
  });

  test('click without a position on a closed root is not recorded as on the host', () => {
    // E.g. activated with the keyboard, the (0, 0) says nothing
    const {host, root} = addHost('closed');
    root.elementFromPoint = (): Element | null => null;
    expect(seenByHost(host, host, {detail: 0, clientX: 0, clientY: 0})).toBe(
      false
    );
  });

  test('click on the host of an open root is recorded', () => {
    const {host} = addHost('open');
    expect(seenByHost(host, host, {detail: 0, clientX: 0, clientY: 0})).toBe(
      true
    );
  });

  test('click on the host of an open root, with the point in its content, is recorded', () => {
    const {host, root} = addHost('open');
    root.elementFromPoint = (): Element | null => root.getElementById('inner');
    expect(seenByHost(host, host, {detail: 1, clientX: 5, clientY: 5})).toBe(
      true
    );
  });

  test('click inside an open root is not recorded for the host', () => {
    const {host, root} = addHost('open');
    expect(
      seenByHost(host, root.getElementById('inner') as HTMLElement, {
        detail: 1,
      })
    ).toBe(false);
  });

  test('an event is recorded once', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    let first: boolean | undefined;
    let second: boolean | undefined;
    button.addEventListener('click', (event) => {
      first = recorder.shouldRecord(button, event);
      second = recorder.shouldRecord(button, event);
    });
    button.click();
    expect([first, second]).toEqual([true, false]);
  });
});

describe('slotted content', () => {
  test('a change on a slotted input is recorded with its locator in the document', () => {
    // Given
    document.body.innerHTML = '<div id="host"><input class="slotted"></div>';
    attach(byId(document, 'host'), 'open', '<slot></slot>');
    recorder.addListenersToDocument(document, -1, 0);
    const input = document.querySelector('.slotted') as HTMLInputElement;
    // When
    input.value = 'abc';
    input.dispatchEvent(new Event('change', {bubbles: true}));
    // Then
    expect(recorded('ZestClientElementSendKeys')).toEqual([
      expect.objectContaining({
        type: 'className',
        element: 'slotted',
        value: 'abc',
      }),
    ]);
  });
});

describe('closed roots whose origin of the event is not known', () => {
  let host: HTMLElement;
  let root: ShadowRoot;

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
    host = byId(document, 'host');
    root = attach(host, 'closed', '<button id="inner"></button>');
    // Not known, as with jsdom (no layout)
    expect(typeof root.elementFromPoint).not.toBe('function');
    recorder.addListenersToDocument(document, -1, 0);
  });

  test('a click on the host is recorded once, on the host', () => {
    // When
    clickOn(host);
    // Then
    expect(recorded('ZestClientElementClick')).toEqual([
      expect.objectContaining({type: 'id', element: 'host'}),
    ]);
  });

  test('a click inside the root is recorded once, inside the root', () => {
    // When
    clickOn(byId(root, 'inner'));
    // Then
    expect(recorded('ZestClientElementClick')).toEqual([
      expect.objectContaining({
        type: 'cssSelector',
        element: '#inner',
        shadowPath: ['#host'],
      }),
    ]);
  });
});

describe('shadow roots not yet tracked', () => {
  test('a click in a root added in the same task is recorded in that root', () => {
    // Given
    document.body.innerHTML = '<div id="outer"></div>';
    const outerRoot = attach(byId(document, 'outer'), 'open');
    recorder.addListenersToDocument(document, -1, 0);
    const late = document.createElement('div');
    late.id = 'late';
    const lateRoot = attach(late, 'open', '<button id="inner"></button>');
    // When: before the mutation observers are notified
    outerRoot.appendChild(late);
    clickOn(byId(lateRoot, 'inner'));
    // Then
    expect(recorded('ZestClientElementClick')).toEqual([
      expect.objectContaining({
        type: 'cssSelector',
        element: '#inner',
        shadowPath: ['#outer', '#late'],
      }),
    ]);
  });
});

describe('cached submit in a shadow root', () => {
  let root: ShadowRoot;

  function recordedTypes(): string[] {
    return recorded('ZestClientElementSendKeys', 'ZestClientElementSubmit').map(
      (json) => `${json.elementType}:${json.element}`
    );
  }

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
    root = attach(
      byId(document, 'host'),
      'open',
      '<input id="a"><input id="b">'
    );
    recorder.addListenersToDocument(document, -1, 0);
  });

  function enterThenChange(
    enterOn: HTMLInputElement,
    changeOn: HTMLInputElement
  ): void {
    enterOn.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        composed: true,
      })
    );
    changeOn.value = 'x';
    changeOn.dispatchEvent(new Event('change', {bubbles: true}));
  }

  test('the keys are sent before the submit on the same element', () => {
    // Given
    const a = byId(root, 'a') as HTMLInputElement;
    // When
    enterThenChange(a, a);
    // Then
    expect(recordedTypes()).toEqual([
      'ZestClientElementSendKeys:#a',
      'ZestClientElementSubmit:#a',
    ]);
  });

  test('the submit is sent before the keys on another element', () => {
    // Given
    const a = byId(root, 'a') as HTMLInputElement;
    const b = byId(root, 'b') as HTMLInputElement;
    // When
    enterThenChange(a, b);
    // Then
    expect(recordedTypes()).toEqual([
      'ZestClientElementSubmit:#a',
      'ZestClientElementSendKeys:#b',
    ]);
  });
});

describe('tracking of shadow hosts', () => {
  async function mutationsObserved(): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  test('hosts in the document are tracked', () => {
    // Given
    document.body.innerHTML = '<div><section><p id="host"></p></section></div>';
    const root = attach(byId(document, 'host'), 'closed');
    // When
    recorder.addListenersToDocument(document, -1, 0);
    // Then
    expect(recorder.trackedShadowRoots.has(root)).toBe(true);
  });

  test('hosts deep in an added subtree are tracked', async () => {
    // Given
    recorder.addListenersToDocument(document, -1, 0);
    const subtree = document.createElement('div');
    subtree.innerHTML = '<div><div><div><span></span></div></div></div><p></p>';
    const deep = attach(subtree.querySelector('span') as HTMLElement, 'closed');
    const other = attach(subtree.querySelector('p') as HTMLElement, 'closed');
    const top = attach(subtree, 'closed');
    // When
    document.body.appendChild(subtree);
    await mutationsObserved();
    // Then
    expect(
      [deep, other, top].map((r) => recorder.trackedShadowRoots.has(r))
    ).toEqual([true, true, true]);
  });

  test('hosts added in the same batch, one inside the other, are tracked', async () => {
    // Given
    recorder.addListenersToDocument(document, -1, 0);
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    const outerRoot = attach(outer, 'closed');
    const innerRoot = attach(inner, 'closed');
    // When
    document.body.appendChild(outer);
    outer.appendChild(inner);
    await mutationsObserved();
    // Then
    expect(recorder.trackedShadowRoots.has(outerRoot)).toBe(true);
    expect(recorder.trackedShadowRoots.has(innerRoot)).toBe(true);
  });

  test('hosts nested in shadow roots are tracked', async () => {
    // Given
    document.body.innerHTML = '<div id="host"></div>';
    const outerRoot = attach(byId(document, 'host'), 'closed');
    outerRoot.innerHTML = '<div><span></span></div>';
    const existing = attach(
      outerRoot.querySelector('span') as HTMLElement,
      'closed'
    );
    recorder.addListenersToDocument(document, -1, 0);
    const added = document.createElement('div');
    const addedRoot = attach(added, 'closed');
    // When
    outerRoot.querySelector('div')?.appendChild(added);
    await mutationsObserved();
    // Then
    expect(recorder.trackedShadowRoots.has(existing)).toBe(true);
    expect(recorder.trackedShadowRoots.has(addedRoot)).toBe(true);
  });
});

describe('nested closed roots whose origin of the event is not known', () => {
  test('a click on the inner host is recorded once, on the inner host', () => {
    // Given
    document.body.innerHTML = '<div id="outer"></div>';
    const outerRoot = attach(
      byId(document, 'outer'),
      'closed',
      '<div id="inner"></div>'
    );
    const inner = byId(outerRoot, 'inner');
    attach(inner, 'closed', '<button id="button"></button>');
    recorder.addListenersToDocument(document, -1, 0);
    // When
    clickOn(inner);
    // Then
    expect(recorded('ZestClientElementClick')).toEqual([
      expect.objectContaining({
        type: 'cssSelector',
        element: '#inner',
        shadowPath: ['#outer'],
      }),
    ]);
  });
});

describe('frames in shadow roots', () => {
  test('are not tracked, they have no frame index', () => {
    // Given
    document.body.innerHTML = '<div id="host"></div>';
    const root = attach(byId(document, 'host'), 'open');
    const frame = document.createElement('iframe');
    root.appendChild(frame);
    const added = jest.spyOn(recorder, 'addListenersToDocument');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    // When
    recorder.addListenersToDocument(document, -1, 0);
    // Then
    expect(added.mock.calls.map(([r]) => r)).toEqual([document, root]);
    expect(console.warn).toHaveBeenCalledWith(
      'ZAP Not recording in a frame in a shadow root',
      frame
    );
  });
});

describe('notification of attached shadow roots', () => {
  beforeEach(() => {
    // Not relevant, it uses the extension APIs
    jest.spyOn(recorder, 'insertFloatingPopup').mockImplementation(() => {});
  });

  test('only the host of the attached root is checked', () => {
    // Given: a tracked host with a large light DOM, whose root gets a new host
    document.body.innerHTML = `<div id="outer">${'<div></div>'.repeat(100)}</div>`;
    const outerRoot = attach(
      byId(document, 'outer'),
      'open',
      '<div id="inner"></div>'
    );
    recorder.addListenersToDocument(document, -1, 0);
    const checked = jest.spyOn(recorder, 'trackShadowHost');
    const inner = byId(outerRoot, 'inner');
    const innerRoot = attach(inner, 'closed');
    // When: as notified by the script in the page
    inner.dispatchEvent(
      new CustomEvent('zap-shadow-attached', {bubbles: true, composed: true})
    );
    // Then
    expect(recorder.trackedShadowRoots.has(innerRoot)).toBe(true);
    expect(checked.mock.calls.length).toBeLessThanOrEqual(2);
  });

  test('the notifications are started and stopped with the recording', () => {
    // Given
    const seen: string[] = [];
    ['zap-shadow-tracking-start', 'zap-shadow-tracking-stop'].forEach((type) =>
      document.addEventListener(type, () => seen.push(type))
    );
    // When
    recorder.recordUserInteractions(false);
    recorder.stopRecordingUserInteractions();
    recorder.recordUserInteractions(false);
    // Then
    expect(seen).toEqual([
      'zap-shadow-tracking-start',
      'zap-shadow-tracking-stop',
      'zap-shadow-tracking-start',
    ]);
  });

  test('the roots attached while not recording are tracked when resumed', () => {
    // Given: a host already connected when its root is attached, not notified
    document.body.innerHTML = '<div id="host"></div>';
    recorder.recordUserInteractions(false);
    recorder.stopRecordingUserInteractions();
    const root = attach(byId(document, 'host'), 'closed');
    // When
    recorder.recordUserInteractions(false);
    // Then
    expect(recorder.trackedShadowRoots.has(root)).toBe(true);
  });
});

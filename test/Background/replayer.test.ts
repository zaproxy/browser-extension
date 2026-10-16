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
import Replayer from '../../source/ContentScript/replayer';

jest.mock('webextension-polyfill', () => ({
  __esModule: true,
  default: {
    runtime: {sendMessage: jest.fn()},
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

function stmt(
  elementType: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {elementType, type: 'id', element: 'target', ...extra};
}

// jsdom does not implement scrolling
function stubScrolling(win: Window): void {
  // eslint-disable-next-line no-param-reassign
  (win as Window & typeof globalThis).Element.prototype.scrollIntoView =
    jest.fn();
}

let replayer: Replayer;

beforeAll(() => stubScrolling(window));

beforeEach(() => {
  document.body.innerHTML = '';
  // Short, so that the tests for missing elements are quick
  replayer = new Replayer(50);
});

test('click sends the events of a real click, in order', async () => {
  document.body.innerHTML = '<button id="target">Go</button>';
  const seen: string[] = [];
  const button = document.getElementById('target') as HTMLElement;
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((n) =>
    button.addEventListener(n, () => seen.push(n))
  );

  const result = await replayer.execute(stmt('ZestClientElementClick'));

  expect(result).toEqual({ok: true});
  expect(seen).toEqual([
    'pointerdown',
    'mousedown',
    'pointerup',
    'mouseup',
    'click',
  ]);
  expect(document.activeElement).toBe(button);
});

test('send keys appends and fires input and change events', async () => {
  document.body.innerHTML = '<input id="target" value="ab">';
  const input = document.getElementById('target') as HTMLInputElement;
  const seen: string[] = [];
  ['input', 'change'].forEach((n) =>
    input.addEventListener(n, () => seen.push(n))
  );

  await replayer.execute(stmt('ZestClientElementSendKeys', {value: 'cd'}));

  expect(input.value).toBe('abcd');
  expect(seen).toEqual(['input', 'change']);
});

test('clear empties the field', async () => {
  document.body.innerHTML = '<input id="target" value="abc">';

  await replayer.execute(stmt('ZestClientElementClear'));

  expect((document.getElementById('target') as HTMLInputElement).value).toBe(
    ''
  );
});

test('submit submits the form containing the element', async () => {
  document.body.innerHTML = '<form id="f"><input id="target" value="x"></form>';
  const submitted = jest.fn((e: Event) => e.preventDefault());
  (document.getElementById('f') as HTMLElement).addEventListener(
    'submit',
    submitted
  );

  const result = await replayer.execute(stmt('ZestClientElementSubmit'));

  expect(result.ok).toBe(true);
  expect(submitted).toHaveBeenCalledTimes(1);
});

test.each([
  ['id', 'target'],
  ['className', 'thing'],
  ['name', 'nm'],
  ['tagName', 'article'],
  ['cssSelector', 'div > .thing'],
  ['xpath', '//article[@name="nm"]'],
  ['linkText', 'Click me'],
])('finds elements by %s', async (type, element) => {
  document.body.innerHTML =
    '<div><article id="target" class="thing" name="nm"></article>' +
    '<a href="#x">Click me</a></div>';
  const result = await replayer.execute(
    stmt('ZestClientElementScrollTo', {type, element})
  );
  expect(result).toEqual({ok: true});
});

test('reports an element that is not found', async () => {
  const result = await replayer.execute(stmt('ZestClientElementClick'));
  expect(result).toEqual({
    ok: false,
    errorKey: 'script.error.elementNotFound',
    errorParams: {type: 'id', element: 'target'},
  });
});

test('waits for an element that appears later', async () => {
  setTimeout(() => {
    document.body.innerHTML = '<button id="target"></button>';
  }, 20);
  const result = await replayer.execute(stmt('ZestClientElementClick'));
  expect(result.ok).toBe(true);
});

test('reports unsupported locators and statements', async () => {
  document.body.innerHTML = '<div id="target"></div>';
  expect(
    await replayer.execute(stmt('ZestClientElementClick', {type: 'bad'}))
  ).toEqual({
    ok: false,
    errorKey: 'script.error.badLocator',
    errorParams: {type: 'bad'},
  });
  expect(await replayer.execute(stmt('ZestSomethingElse'))).toEqual({
    ok: false,
    errorKey: 'script.error.badStatement',
    errorParams: {type: 'ZestSomethingElse'},
  });
});

test('reports other problems as unexpected errors', async () => {
  document.body.innerHTML = '<div id="target"></div>';
  const result = await replayer.execute(
    stmt('ZestClientElementClick', {type: 'cssSelector', element: '###'})
  );
  expect(result.ok).toBe(false);
  expect(result.errorKey).toBe('script.error.unexpected');
  expect(typeof result.errorParams?.message).toBe('string');
});

test('submit needs a form', async () => {
  document.body.innerHTML = '<input id="target">';
  expect(await replayer.execute(stmt('ZestClientElementSubmit'))).toEqual({
    ok: false,
    errorKey: 'script.error.notInForm',
    errorParams: {},
  });
});

test('comments do nothing', async () => {
  expect(
    await replayer.execute({elementType: 'ZestComment', comment: 'hi'})
  ).toEqual({ok: true});
});

test('switches into a frame and back to the parent', async () => {
  document.body.innerHTML = '<iframe id="frame"></iframe>';
  const frameWindow = (document.getElementById('frame') as HTMLIFrameElement)
    .contentWindow as Window;
  stubScrolling(frameWindow);
  frameWindow.document.body.innerHTML = '<button id="inner">in</button>';
  const clicked = jest.fn();
  (
    frameWindow.document.getElementById('inner') as HTMLElement
  ).addEventListener('click', clicked);
  document.body.insertAdjacentHTML('beforeend', '<button id="outer"></button>');

  expect(
    (
      await replayer.execute({
        elementType: 'ZestClientSwitchToFrame',
        frameIndex: 0,
        parent: false,
      })
    ).ok
  ).toBe(true);
  // Now looks in the frame, not the top document
  expect(
    (await replayer.execute(stmt('ZestClientElementClick', {element: 'outer'})))
      .ok
  ).toBe(false);
  expect(
    (await replayer.execute(stmt('ZestClientElementClick', {element: 'inner'})))
      .ok
  ).toBe(true);
  expect(clicked).toHaveBeenCalledTimes(1);

  await replayer.execute({
    elementType: 'ZestClientSwitchToFrame',
    frameIndex: -1,
    parent: true,
  });
  expect(
    (await replayer.execute(stmt('ZestClientElementClick', {element: 'outer'})))
      .ok
  ).toBe(true);
});

test('reports bad frame switches', async () => {
  expect(
    await replayer.execute({
      elementType: 'ZestClientSwitchToFrame',
      frameIndex: 3,
      parent: false,
    })
  ).toEqual({
    ok: false,
    errorKey: 'script.error.frameNotFound',
    errorParams: {frame: 3},
  });
  expect(
    await replayer.execute({
      elementType: 'ZestClientSwitchToFrame',
      frameIndex: -1,
      parent: true,
    })
  ).toEqual({
    ok: false,
    errorKey: 'script.error.topWindow',
    errorParams: {},
  });
});

test('overlay problems do not fail a statement', async () => {
  // The overlay logs the problem it is given, which is expected here
  jest.spyOn(console, 'log').mockImplementation(() => {});
  document.body.innerHTML = '<button id="target"></button>';
  const original = document.createElement.bind(document);
  jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'zap-replay-overlay') {
      throw new Error('blocked');
    }
    return original(tag);
  });
  const result = await replayer.execute(stmt('ZestClientElementClick'), {
    title: 'ZAP Replay',
    heading: 'Step 1 of 1',
    text: 'Click',
  });
  jest.restoreAllMocks();
  expect(result.ok).toBe(true);
});

describe('select, checkbox and radio', () => {
  const options =
    '<select id="target"><option value="1">One</option>' +
    '<option value="2">Two</option><option value="3">Three</option></select>';

  test('a select is set by the text of the option, as recorded', async () => {
    document.body.innerHTML = options;
    const select = document.getElementById('target') as HTMLSelectElement;
    const seen: string[] = [];
    ['input', 'change'].forEach((n) =>
      select.addEventListener(n, () => seen.push(n))
    );

    const result = await replayer.execute(
      stmt('ZestClientElementSendKeys', {value: 'Three'})
    );

    expect(result.ok).toBe(true);
    expect(select.value).toBe('3');
    expect(seen).toEqual(['input', 'change']);
  });

  test('a select falls back to the value of the option', async () => {
    document.body.innerHTML = options;

    await replayer.execute(stmt('ZestClientElementSendKeys', {value: '2'}));

    expect((document.getElementById('target') as HTMLSelectElement).value).toBe(
      '2'
    );
  });

  test('options that share a value are told apart by their text', async () => {
    document.body.innerHTML =
      '<select id="target"><option value="x">First</option>' +
      '<option value="x">Second</option><option value="y">Third</option></select>';

    await replayer.execute(
      stmt('ZestClientElementSendKeys', {value: 'Second'})
    );

    expect(
      (document.getElementById('target') as HTMLSelectElement).selectedIndex
    ).toBe(1);
  });

  test('selecting twice does not append to the previous choice', async () => {
    document.body.innerHTML = options;

    await replayer.execute(stmt('ZestClientElementSendKeys', {value: 'Two'}));
    const result = await replayer.execute(
      stmt('ZestClientElementSendKeys', {value: 'One'})
    );

    expect(result.ok).toBe(true);
    expect((document.getElementById('target') as HTMLSelectElement).value).toBe(
      '1'
    );
  });

  test('reports an option that does not exist', async () => {
    document.body.innerHTML = options;

    const result = await replayer.execute(
      stmt('ZestClientElementSendKeys', {value: 'Four'})
    );

    expect(result).toEqual({
      ok: false,
      errorKey: 'script.error.optionNotFound',
      errorParams: {option: 'Four'},
    });
  });

  test.each(['checkbox', 'radio'])(
    'send keys leaves a %s alone',
    async (type) => {
      document.body.innerHTML = `<input id="target" type="${type}" value="on">`;
      const input = document.getElementById('target') as HTMLInputElement;
      const seen: string[] = [];
      ['input', 'change'].forEach((n) =>
        input.addEventListener(n, () => seen.push(n))
      );

      const result = await replayer.execute(
        stmt('ZestClientElementSendKeys', {value: 'on'})
      );

      expect(result.ok).toBe(true);
      expect(input.value).toBe('on');
      expect(input.checked).toBe(false);
      expect(seen).toEqual([]);
    }
  );

  test('clicking a checkbox still toggles it', async () => {
    document.body.innerHTML = '<input id="target" type="checkbox">';

    await replayer.execute(stmt('ZestClientElementClick'));

    expect(
      (document.getElementById('target') as HTMLInputElement).checked
    ).toBe(true);
  });
});

test('clicking an svg element works, as it has no click method', async () => {
  document.body.innerHTML =
    '<svg id="target" xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
  const clicked = jest.fn();
  (document.getElementById('target') as unknown as Element).addEventListener(
    'click',
    clicked
  );

  const result = await replayer.execute(stmt('ZestClientElementClick'));

  expect(result).toEqual({ok: true});
  expect(clicked).toHaveBeenCalledTimes(1);
});

describe('named frames', () => {
  function frameDoc(id: string): Document {
    return (document.getElementById(id) as HTMLIFrameElement).contentWindow
      ?.document as Document;
  }

  beforeEach(() => {
    document.body.innerHTML =
      '<iframe id="first" name="one"></iframe>' +
      '<iframe id="second" name="two"></iframe>';
    stubScrolling(
      (document.getElementById('first') as HTMLIFrameElement)
        .contentWindow as Window
    );
    stubScrolling(
      (document.getElementById('second') as HTMLIFrameElement)
        .contentWindow as Window
    );
    frameDoc('first').body.innerHTML = '<button id="in-first"></button>';
    frameDoc('second').body.innerHTML = '<button id="in-second"></button>';
  });

  const toFrame = (
    extra: Record<string, unknown>
  ): Record<string, unknown> => ({
    elementType: 'ZestClientSwitchToFrame',
    parent: false,
    ...extra,
  });

  test('a name is used in preference to the index', async () => {
    // The index says the first frame, the name says the second
    expect(
      (await replayer.execute(toFrame({frameIndex: 0, frameName: 'two'}))).ok
    ).toBe(true);

    expect(
      (
        await replayer.execute(
          stmt('ZestClientElementClick', {element: 'in-second'})
        )
      ).ok
    ).toBe(true);
  });

  test('a frame can also be found by its id', async () => {
    await replayer.execute(toFrame({frameIndex: 0, frameName: 'second'}));

    expect(
      (
        await replayer.execute(
          stmt('ZestClientElementClick', {element: 'in-second'})
        )
      ).ok
    ).toBe(true);
  });

  test('the index is used if there is no name', async () => {
    await replayer.execute(toFrame({frameIndex: 1, frameName: ''}));

    expect(
      (
        await replayer.execute(
          stmt('ZestClientElementClick', {element: 'in-second'})
        )
      ).ok
    ).toBe(true);
  });

  test('a name that does not exist is an error, not the index', async () => {
    expect(
      await replayer.execute(toFrame({frameIndex: 0, frameName: 'nope'}))
    ).toEqual({
      ok: false,
      errorKey: 'script.error.frameNotFound',
      errorParams: {frame: 'nope'},
    });
  });
});

describe('abort', () => {
  test('stops a statement that is waiting for its element', async () => {
    const waiting = new Replayer(5000);
    const result = waiting.execute(stmt('ZestClientElementClick'));
    setTimeout(() => waiting.abort(), 50);
    const started = Date.now();

    expect(await result).toEqual({
      ok: false,
      errorKey: 'script.error.stopped',
      errorParams: {},
    });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test('an element that appears after the abort is not clicked', async () => {
    const waiting = new Replayer(5000);
    const clicked = jest.fn();
    const result = waiting.execute(stmt('ZestClientElementClick'));
    waiting.abort();
    document.body.innerHTML = '<button id="target"></button>';
    (document.getElementById('target') as HTMLElement).addEventListener(
      'click',
      clicked
    );

    expect((await result).errorKey).toBe('script.error.stopped');
    expect(clicked).not.toHaveBeenCalled();
  });

  test('the next statement runs normally', async () => {
    replayer.abort();
    document.body.innerHTML = '<button id="target"></button>';

    expect(await replayer.execute(stmt('ZestClientElementClick'))).toEqual({
      ok: true,
    });
  });
});

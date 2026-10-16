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
import RawStatement from '../types/zestScript/RawStatement';
import {sleep} from '../utils/util';
import {
  ZEST_CLIENT_ELEMENT_CLEAR,
  ZEST_CLIENT_ELEMENT_CLICK,
  ZEST_CLIENT_ELEMENT_MOUSE_OVER,
  ZEST_CLIENT_ELEMENT_SCROLL_TO,
  ZEST_CLIENT_ELEMENT_SEND_KEYS,
  ZEST_CLIENT_ELEMENT_SUBMIT,
  ZEST_CLIENT_SWITCH_TO_FRAME,
  REPLAY_CANCEL,
  REPLAY_NEXT,
  ZEST_COMMENT,
} from '../utils/constants';
import ReplayOverlay from './replayOverlay';

/** What the box on the page shows. The text is translated by the sender. */
interface ReplayDisplay {
  title: string;
  heading: string;
  text: string;
}

interface ReplayPauseDisplay extends ReplayDisplay {
  nextLabel: string;
  cancelLabel: string;
}

interface ReplayFinishDisplay {
  title: string;
  heading: string;
  message: string;
  ok: boolean;
}

/** An error that the sender turns into a translated message. */
class ReplayError extends Error {
  readonly key: string;

  readonly params: Record<string, unknown>;

  constructor(key: string, params: Record<string, unknown> = {}) {
    super(key);
    // Keeps instanceof working when classes are compiled down to older targets
    Object.setPrototypeOf(this, ReplayError.prototype);
    this.key = key;
    this.params = params;
  }
}

interface ReplayResult {
  ok: boolean;
  errorKey?: string;
  errorParams?: Record<string, unknown>;
}

const MIN_ELEMENT_WAIT_MSEC = 3000;
const POLL_INTERVAL_MSEC = 100;
const FINISHED_SHOW_MSEC = 4000;
const FAILED_SHOW_MSEC = 10000;

function findElement(
  doc: Document,
  type: string,
  value: string
): Element | null {
  switch (type) {
    case 'id':
      return doc.getElementById(value);
    case 'className':
      return doc.getElementsByClassName(value)[0] ?? null;
    case 'name':
      return doc.getElementsByName(value)[0] ?? null;
    case 'tagName':
      return doc.getElementsByTagName(value)[0] ?? null;
    case 'cssSelector':
      return doc.querySelector(value);
    case 'linkText':
      return (
        Array.from(doc.links).find((l) => l.textContent?.trim() === value) ??
        null
      );
    case 'partialLinkText':
      // Part of the text of the link, as for linkText but not all of it. Nothing
      // is found for no text, rather than the first link, as everything has that.
      return (
        (value !== '' &&
          Array.from(doc.links).find((l) =>
            (l.textContent ?? '').includes(value)
          )) ||
        null
      );
    case 'xpath':
      return doc.evaluate(
        value,
        doc,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue as Element | null;
    default:
      throw new ReplayError('script.error.badLocator', {type});
  }
}

function fire(el: Element, eventName: string, init: EventInit = {}): void {
  // Use the element's own realm so this also works for elements in frames
  const win = el.ownerDocument.defaultView as Window & typeof globalThis;
  el.dispatchEvent(new win.Event(eventName, {bubbles: true, ...init}));
}

function fireMouse(el: Element, eventName: string, bubbles = true): void {
  const win = el.ownerDocument.defaultView as Window & typeof globalThis;
  const rect = el.getBoundingClientRect();
  const init = {
    bubbles,
    cancelable: bubbles,
    composed: true,
    view: win,
    button: 0,
    buttons: eventName.endsWith('down') ? 1 : 0,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
  const event =
    eventName.startsWith('pointer') && typeof win.PointerEvent === 'function'
      ? new win.PointerEvent(eventName, {
          ...init,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
        })
      : new win.MouseEvent(eventName, init);
  el.dispatchEvent(event);
}

/** Sends the events of a mouse moving onto an element, as real ones are. */
function hover(el: Element): void {
  fireMouse(el, 'pointerover');
  fireMouse(el, 'pointerenter', false);
  fireMouse(el, 'mouseover');
  fireMouse(el, 'mouseenter', false);
  fireMouse(el, 'mousemove');
}

function isDisabled(el: Element): boolean {
  return el.matches(':disabled');
}

/** Sends the events a real click would, as some pages rely on all of them. */
function click(el: HTMLElement): void {
  fireMouse(el, 'pointerdown');
  fireMouse(el, 'mousedown');
  // Synthetic events do not move the focus, as a real mouse down would
  el.focus();
  fireMouse(el, 'pointerup');
  fireMouse(el, 'mouseup');
  if (typeof el.click === 'function') {
    el.click();
  } else {
    // SVG elements do not have a click method
    fireMouse(el, 'click');
  }
}

function setValue(el: Element, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(el),
    'value'
  )?.set;
  if (setter) {
    // Bypasses framework value trackers, so that React etc. see the change
    setter.call(el, value);
  } else {
    (el as HTMLInputElement).value = value;
  }
  fire(el, 'input');
  fire(el, 'change');
}

function selectOption(select: HTMLSelectElement, wanted: string): void {
  // The recorder records the text of the selected option
  const options = Array.from(select.options);
  const option =
    options.find((o) => o.text === wanted) ??
    options.find((o) => o.value === wanted);
  if (!option) {
    throw new ReplayError('script.error.optionNotFound', {option: wanted});
  }
  // Not the value, as several options can have the same one
  select.selectedIndex = option.index;
  fire(select, 'input');
  fire(select, 'change');
}

function sendKeys(el: HTMLElement, keys: string): void {
  if (el.tagName === 'SELECT') {
    selectOption(el as HTMLSelectElement, keys);
    return;
  }
  const {type} = el as HTMLInputElement;
  if (el.tagName === 'INPUT' && (type === 'checkbox' || type === 'radio')) {
    // The click that changes these is recorded as a separate statement, and
    // typing into them must not change their value
    return;
  }
  el.focus();
  setValue(el, ((el as HTMLInputElement).value ?? '') + keys);
}

/**
 * Replays individual Zest statements in this page. Frame switches are tracked
 * here, and reset to the top window when the page is reloaded.
 */
class Replayer {
  private win: Window = window;

  private parents: Window[] = [];

  private overlay = new ReplayOverlay();

  private minElementWaitMsec: number;

  private aborted = false;

  constructor(minElementWaitMsec = MIN_ELEMENT_WAIT_MSEC) {
    this.minElementWaitMsec = minElementWaitMsec;
  }

  async execute(
    statement: RawStatement,
    display?: ReplayDisplay
  ): Promise<ReplayResult> {
    this.aborted = false;
    if (display) {
      this.overlay.show({...display, state: 'running'});
    }
    try {
      await this.run(statement);
      return {ok: true};
    } catch (e) {
      if (e instanceof ReplayError) {
        return {ok: false, errorKey: e.key, errorParams: e.params};
      }
      return {
        ok: false,
        errorKey: 'script.error.unexpected',
        errorParams: {message: e instanceof Error ? e.message : String(e)},
      };
    }
  }

  /** Stops the statement being run, if any, as the script has been stopped. */
  abort(): void {
    this.aborted = true;
  }

  private checkNotAborted(): void {
    if (this.aborted) {
      throw new ReplayError('script.error.stopped');
    }
  }

  /** Shows the next statement, with buttons to run it or to cancel. */
  pause(display: ReplayPauseDisplay): void {
    this.overlay.show({...display, state: 'running'}, 0, [
      {
        label: display.nextLabel,
        onClick: (): void => {
          Browser.runtime.sendMessage({type: REPLAY_NEXT});
        },
      },
      {
        label: display.cancelLabel,
        onClick: (): void => {
          Browser.runtime.sendMessage({type: REPLAY_CANCEL});
        },
      },
    ]);
  }

  finish(display: ReplayFinishDisplay): void {
    this.overlay.show(
      {
        title: display.title,
        heading: display.heading,
        text: display.message,
        state: display.ok ? 'ok' : 'failed',
      },
      display.ok ? FINISHED_SHOW_MSEC : FAILED_SHOW_MSEC
    );
  }

  /**
   * Waits for the element to be found and, if needed, to be enabled, as
   * clicking or typing in a disabled element does nothing.
   */
  private async waitForElement(
    statement: RawStatement,
    needsEnabled: boolean
  ): Promise<Element> {
    const type = String(statement.type);
    const value = String(statement.element);
    const timeout = Math.max(
      Number(statement.waitForMsec) || 0,
      this.minElementWaitMsec
    );
    const end = Date.now() + timeout;
    for (;;) {
      this.checkNotAborted();
      const el = findElement(this.win.document, type, value);
      if (el && !(needsEnabled && isDisabled(el))) {
        return el;
      }
      if (Date.now() >= end) {
        throw new ReplayError(
          el ? 'script.error.elementDisabled' : 'script.error.elementNotFound',
          {type, element: value}
        );
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(POLL_INTERVAL_MSEC);
    }
  }

  private findNamedFrame(name: string): Window | null {
    const frames = Array.from(
      this.win.document.querySelectorAll('iframe, frame')
    ) as (HTMLIFrameElement | HTMLFrameElement)[];
    const match = frames.find(
      (f) => f.getAttribute('name') === name || f.id === name
    );
    return match?.contentWindow ?? null;
  }

  private switchToFrame(statement: RawStatement): void {
    if (statement.parent === true) {
      const parent = this.parents.pop();
      if (!parent) {
        throw new ReplayError('script.error.topWindow');
      }
      this.win = parent;
      return;
    }
    // As in ZAP, a name is used in preference to the index
    const name = String(statement.frameName ?? '');
    const wanted = name !== '' ? name : Number(statement.frameIndex);
    const frame =
      name !== '' ? this.findNamedFrame(name) : this.win.frames[Number(wanted)];
    if (!frame) {
      throw new ReplayError('script.error.frameNotFound', {frame: wanted});
    }
    try {
      // Cross origin frames throw when accessed
      if (!frame.document) {
        throw new Error('no document');
      }
    } catch {
      throw new ReplayError('script.error.frameCrossOrigin', {frame: wanted});
    }
    this.parents.push(this.win);
    this.win = frame;
  }

  private async run(statement: RawStatement): Promise<void> {
    const type = String(statement.elementType);
    if (type === ZEST_CLIENT_SWITCH_TO_FRAME) {
      this.switchToFrame(statement);
      return;
    }
    if (type === ZEST_COMMENT) {
      return;
    }
    const needsEnabled =
      type === ZEST_CLIENT_ELEMENT_CLICK ||
      type === ZEST_CLIENT_ELEMENT_SEND_KEYS ||
      type === ZEST_CLIENT_ELEMENT_CLEAR;
    const el = (await this.waitForElement(
      statement,
      needsEnabled
    )) as HTMLElement;
    // The script may have been stopped while waiting
    this.checkNotAborted();
    switch (type) {
      case ZEST_CLIENT_ELEMENT_CLICK:
        click(el);
        break;
      case ZEST_CLIENT_ELEMENT_SCROLL_TO:
        el.scrollIntoView({block: 'center'});
        break;
      case ZEST_CLIENT_ELEMENT_MOUSE_OVER:
        hover(el);
        break;
      case ZEST_CLIENT_ELEMENT_SEND_KEYS:
        sendKeys(el, String(statement.value ?? ''));
        break;
      case ZEST_CLIENT_ELEMENT_CLEAR:
        el.focus();
        setValue(el, '');
        break;
      case ZEST_CLIENT_ELEMENT_SUBMIT: {
        const form = el.tagName === 'FORM' ? el : (el as HTMLInputElement).form;
        if (!form) {
          throw new ReplayError('script.error.notInForm');
        }
        (form as HTMLFormElement).requestSubmit();
        break;
      }
      default:
        throw new ReplayError('script.error.badStatement', {type});
    }
  }
}

export default Replayer;
export {ReplayError};
export type {
  ReplayDisplay,
  ReplayFinishDisplay,
  ReplayPauseDisplay,
  ReplayResult,
};

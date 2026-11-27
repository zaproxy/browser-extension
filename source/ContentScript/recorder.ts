/*
 * Zed Attack Proxy (ZAP) and its related source files.
 *
 * ZAP is an HTTP/HTTPS proxy for assessing web application security.
 *
 * Copyright 2023 The ZAP Development Team
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
import debounce from 'lodash/debounce';
import Browser from 'webextension-polyfill';
import {
  ElementLocator,
  ZestStatement,
  ZestStatementComment,
  ZestStatementElementClear,
  ZestStatementElementClick,
  ZestStatementElementScrollTo,
  ZestStatementElementSendKeys,
  ZestStatementElementSubmit,
  ZestStatementLaunchBrowser,
  ZestStatementSwitchToFrame,
} from '../types/zestScript/ZestStatement';
import {ZestScriptMessage} from '../types/zestScript/ZestScript';
import {
  getPath,
  getShadowRoot,
  isShadowRoot,
  markClassAsDynamic,
  snapshotInputClass,
} from './util';
import {describeShadowElement, downloadJson} from '../utils/util';
import {
  GET_ZEST_SCRIPT,
  STOP_RECORDING,
  ZAP_FLOATING_DIV,
  ZAP_FLOATING_DIV_ELEMENTS,
  ZEST_SCRIPT,
} from '../utils/constants';
import {
  SHADOW_ATTACHED_EVENT,
  SHADOW_TRACKING_START_EVENT,
  SHADOW_TRACKING_STOP_EVENT,
} from '../utils/shadowEvents';

const STOP_RECORDING_ID = 'ZAP-stop-recording-button';
const STOP_RECORDING_TEXT = 'Stop and Download Recording';

/** The locator as shown in the notifications, as in the Script Viewer. */
function describeLocator(locator: ElementLocator): string {
  return describeShadowElement(locator.element, locator.shadowPath);
}

/** The level and frame of a document or shadow root. */
type Position = {level: number; frame: number};

class Recorder {
  readonly timeAdjustmentMillis: number = 3000;

  readonly minimumWaitTimeInMillis: number = 5000;

  previousDOMState: string;

  curLevel = -1;

  curFrame = 0;

  active = false;

  haveListenersBeenAdded = false;

  // The roots with listeners and their hosts.
  trackedShadowRoots = new WeakSet<ShadowRoot>();

  shadowHosts = new WeakSet<Element>();

  // The events already recorded, as an event might be seen by the listeners of several roots.
  private handledEvents = new WeakSet<Event>();

  // The events seen on a host whose origin was not known, and how to handle them if on the host.
  private deferredEvents = new WeakMap<Event, () => void>();

  // The events known to have originated on the host itself.
  private hostEvents = new WeakSet<Event>();

  // The level and frame of the documents and shadow roots with listeners.
  private rootFrames = new WeakMap<Node, Position>();

  // The documents with listeners, and their level and frame, notified of the shadow roots attached
  // while recording.
  private trackedDocuments = new Map<Document, Position>();

  floatingWindowInserted = false;

  isNotificationRaised = false;

  // Enter keydown events often occur before the input change events, so we reorder them if needed
  cachedSubmit?: ZestStatementElementSubmit;

  // We can get duplicate events for the enter key, this allows us to dedup them
  cachedTimeStamp = -1;

  lastStatementTime: number;

  lastUserInteractionTime = 0;

  lastMouseDownTarget: EventTarget | null = null;

  readonly USER_INTERACTION_WINDOW_MS = 500;

  pendingSyntheticClickTarget: Element | null = null;

  pendingSyntheticClickTimer: ReturnType<typeof setTimeout> | null = null;

  private focusedInput: {element: Element; value: string} | null = null;

  // Value of each input when it gained focus / was last recorded
  private baselineValues = new WeakMap<Element, string>();

  // Inputs the user has edited via keyboard or paste with no 'change' event seen yet
  private editedInputs = new WeakSet<Element>();

  async sendZestScriptToZAP(
    zestStatement: ZestStatement,
    params: {sendCache: boolean; notify: boolean}
  ): Promise<number> {
    if (params.sendCache) {
      this.handleCachedSubmit();
    }
    // console.log('ZAP Sending statement', zestStatement);
    if (params.notify) {
      this.notify(zestStatement);
    }
    return Browser.runtime.sendMessage({
      type: ZEST_SCRIPT,
      data: zestStatement.toJSON(),
    });
  }

  getWaited(): number {
    if (this.lastStatementTime === undefined || this.lastStatementTime === 0) {
      this.lastStatementTime = Date.now();
    }
    // Adjust start time
    const lastStmtTime = this.lastStatementTime - this.timeAdjustmentMillis;
    // Round to nearest minimum (in millis)
    const waited =
      Math.ceil((Date.now() - lastStmtTime) / this.minimumWaitTimeInMillis) *
      this.minimumWaitTimeInMillis;
    this.lastStatementTime = Date.now();
    return waited;
  }

  sendScrollToToZap(elementLocator: ElementLocator, waitForMsec: number): void {
    this.sendZestScriptToZAP(
      new ZestStatementElementScrollTo(elementLocator, waitForMsec),
      {sendCache: false, notify: false}
    );
  }

  handleCachedSubmit(): void {
    if (this.cachedSubmit) {
      this.sendScrollToToZap(
        this.cachedSubmit.elementLocator,
        this.getWaited()
      );
      // console.log('ZAP Sending cached submit', this.cachedSubmit);
      this.sendZestScriptToZAP(this.cachedSubmit, {
        sendCache: false,
        notify: true,
      });
      delete this.cachedSubmit;
      this.cachedTimeStamp = -1;
    }
  }

  handleFrameSwitches(level: number, frameIndex: number): void {
    if (this.curLevel === level && this.curFrame === frameIndex) {
      return;
    }
    if (this.curLevel > level) {
      while (this.curLevel > level) {
        this.sendZestScriptToZAP(new ZestStatementSwitchToFrame(-1), {
          sendCache: true,
          notify: true,
        });
        this.curLevel -= 1;
      }
      this.curFrame = frameIndex;
    } else {
      this.curLevel += 1;
      this.curFrame = frameIndex;
      this.sendZestScriptToZAP(new ZestStatementSwitchToFrame(frameIndex), {
        sendCache: true,
        notify: true,
      });
    }
    if (this.curLevel !== level) {
      console.log('ZAP Error in switching frames');
    }
  }

  handleClick(
    params: {level: number; frame: number; element: Document | ShadowRoot},
    event: Event
  ): void {
    const handleLater = (): void => this.handleClick(params, event);
    if (!this.shouldRecord(event.target as HTMLElement, event, handleLater)) {
      return;
    }
    const {level, frame, element} = params;
    const clickTarget = event.target as Element;
    this.handleFrameSwitches(level, frame);
    console.log(event, 'ZAP clicked');

    if ((event as MouseEvent).detail === 0) {
      const timeSinceInteraction = Date.now() - this.lastUserInteractionTime;
      const mouseDownWasOnTarget =
        this.lastMouseDownTarget !== null &&
        clickTarget.contains(this.lastMouseDownTarget as Node);
      if (
        timeSinceInteraction >= this.USER_INTERACTION_WINDOW_MS ||
        !mouseDownWasOnTarget
      ) {
        // Pure programmatic click: no recent user interaction on this target.
        if (this.cachedSubmit) {
          this.handleCachedSubmit();
        }
        return;
      }
      // Synthetic click with recent user interaction on this target.
      // Defer recording: if the real click arrives before the timer fires the
      // site fired an extra click but didn't suppress the real one, so we
      // discard the synthetic and record the real click instead.
      const elementLocator = getPath(event.target as HTMLElement, element);
      if (this.pendingSyntheticClickTimer !== null) {
        clearTimeout(this.pendingSyntheticClickTimer);
      }
      this.pendingSyntheticClickTarget = clickTarget;
      this.pendingSyntheticClickTimer = setTimeout(() => {
        // No real click arrived — site suppressed it; record the synthetic.
        this.pendingSyntheticClickTarget = null;
        this.pendingSyntheticClickTimer = null;
        const waited = this.getWaited();
        this.sendScrollToToZap(elementLocator, waited);
        this.sendZestScriptToZAP(
          new ZestStatementElementClick(elementLocator, waited),
          {sendCache: true, notify: true}
        );
      }, 0);
      return;
    }

    // Real user click (detail > 0).
    // If a synthetic was pending for this exact target, the site fired an
    // extra click but did not suppress the real one — discard the synthetic.
    if (
      this.pendingSyntheticClickTarget !== null &&
      this.pendingSyntheticClickTarget === clickTarget
    ) {
      if (this.pendingSyntheticClickTimer !== null) {
        clearTimeout(this.pendingSyntheticClickTimer);
      }
      this.pendingSyntheticClickTarget = null;
      this.pendingSyntheticClickTimer = null;
    }

    const waited = this.getWaited();
    const elementLocator = getPath(event.target as HTMLElement, element);
    this.sendScrollToToZap(elementLocator, waited);
    this.sendZestScriptToZAP(
      new ZestStatementElementClick(elementLocator, waited),
      {sendCache: true, notify: true}
    );
  }

  handleUserInteraction(event: Event): void {
    this.lastUserInteractionTime = Date.now();
    this.lastMouseDownTarget = event.target;
  }

  handleScroll(params: {level: number; frame: number}, event: Event): void {
    if (!this.shouldRecord(event.target as HTMLElement, event)) return;
    const {level, frame} = params;
    this.handleFrameSwitches(level, frame);
    console.log(event, 'ZAP scrolling.. ');
    // scroll the nearest ancestor with scrolling ability
  }

  handleMouseOver(
    params: {level: number; frame: number; element: Document | ShadowRoot},
    event: Event
  ): void {
    if (!this.shouldRecord(event.target as HTMLElement, event)) return;
    const {level, frame, element} = params;
    const currentDOMState = isShadowRoot(element)
      ? element.innerHTML
      : element.documentElement.outerHTML;
    if (currentDOMState === this.previousDOMState) {
      return;
    }
    this.previousDOMState = currentDOMState;
    this.handleFrameSwitches(level, frame);
    console.log(event, 'ZAP MouseOver');
    // send mouseover event
  }

  private isTrackedInputType(
    target: HTMLElement
  ): target is HTMLInputElement | HTMLTextAreaElement {
    return (
      (target instanceof HTMLInputElement &&
        target.type !== 'checkbox' &&
        target.type !== 'radio') ||
      target instanceof HTMLTextAreaElement
    );
  }

  handleChange(
    params: {level: number; frame: number; element: Document | ShadowRoot},
    event: Event
  ): void {
    if (!this.shouldRecord(event.target as HTMLElement, event)) return;
    const {level, frame, element} = params;
    const waited: number = this.getWaited();
    this.handleFrameSwitches(level, frame);
    console.log(event, 'ZAP change', (event.target as HTMLInputElement).value);
    const elementLocator = getPath(event.target as HTMLElement, element);
    // Send the keys before a cached submit statement on the same element
    if (
      this.cachedSubmit &&
      !this.cachedSubmit.elementLocator.equals(elementLocator)
    ) {
      // The cached submit was not on the same element, so send it
      this.handleCachedSubmit();
    }
    const select = event.target as HTMLSelectElement;
    const keys =
      select.tagName === 'SELECT'
        ? ((select.selectedOptions[0] as HTMLOptionElement | undefined)?.text ??
          '')
        : (event.target as HTMLInputElement).value;
    this.sendScrollToToZap(elementLocator, waited);
    const target = event.target as HTMLElement;
    const hadPreExistingValue =
      this.focusedInput?.element === target ||
      (this.isTrackedInputType(target) && !!target.defaultValue);
    this.focusedInput = null;
    this.editedInputs.delete(target);
    if (this.isTrackedInputType(target)) {
      this.baselineValues.set(target, target.value);
    }
    if (hadPreExistingValue) {
      this.sendZestScriptToZAP(new ZestStatementElementClear(elementLocator), {
        sendCache: false,
        notify: false,
      });
    }
    this.sendZestScriptToZAP(
      new ZestStatementElementSendKeys(elementLocator, keys, waited),
      {sendCache: false, notify: true}
    );
    // Now send the cached submit, if there still is one
    this.handleCachedSubmit();
  }

  handleKeyEdit(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (!this.isTrackedInputType(target)) return;
    const isEditKey =
      event.key.length === 1 ||
      event.key === 'Backspace' ||
      event.key === 'Delete';
    if (isEditKey) this.editedInputs.add(target);
  }

  handleFocusIn(event: Event): void {
    const target = event.target as HTMLElement;
    if (this.isTrackedInputType(target)) {
      this.baselineValues.set(target, target.value);
      this.editedInputs.delete(target);
    }
  }

  // Some sites (e.g. jQuery Inputmask) set the value from script and never fire
  // a native 'change' event, so fall back to comparing the value on blur.
  handleFocusOut(
    params: {level: number; frame: number; element: Document | ShadowRoot},
    event: Event
  ): void {
    const target = event.target as HTMLElement;
    if (!this.isTrackedInputType(target)) return;
    if (!this.editedInputs.has(target)) return;
    this.editedInputs.delete(target);
    if (this.baselineValues.get(target) === target.value) return;
    this.handleChange(params, event);
  }

  handleKeypress(
    params: {level: number; frame: number; element: Document | ShadowRoot},
    event: KeyboardEvent
  ): void {
    if (!this.shouldRecord(event.target as HTMLElement, event)) return;
    const {element} = params;
    if (event.key === 'Enter') {
      if (this.cachedSubmit && this.cachedTimeStamp === event.timeStamp) {
        // console.log('ZAP Ignoring dup Enter event', this.cachedSubmit);
        return;
      }
      this.handleCachedSubmit();
      const elementLocator = getPath(event.target as HTMLElement, element);
      // console.log('ZAP Enter key pressed', elementLocator, event.timeStamp);
      // Cache the statement as it often occurs before the change event occurs
      this.cachedSubmit = new ZestStatementElementSubmit(
        elementLocator,
        this.getWaited()
      );
      this.cachedTimeStamp = event.timeStamp;
      // console.log('ZAP Caching submit', this.cachedSubmit);
    }
  }

  handleResize(): void {
    if (!this.active) return;
    const width =
      window.innerWidth ||
      document.documentElement.clientWidth ||
      document.body.clientWidth;
    const height =
      window.innerHeight ||
      document.documentElement.clientHeight ||
      document.body.clientHeight;
    // send window resize event
    console.log('ZAP Window Resize : ', width, height);
  }

  addListenerToInputField(
    elements: Set<HTMLElement>,
    inputField: HTMLElement,
    level: number,
    frame: number,
    element: Document | ShadowRoot
  ): void {
    if (!elements.has(inputField)) {
      elements.add(inputField);
      inputField.addEventListener(
        'keydown',
        this.handleKeypress.bind(this, {level, frame, element})
      );
    }
  }

  handleFrameLoad(params: {
    element: HTMLIFrameElement | HTMLFrameElement;
    level: number;
  }): void {
    const frame = params.element;
    let doc;
    try {
      doc = frame.contentDocument || frame.contentWindow?.document;
    } catch {
      // Ignore cross-origin permission exceptions.
      return;
    }
    if (doc != null) {
      this.addListenersToDocument(doc, params.level, this.indexOfFrame(frame));
    }
  }

  processFrame(frame: Element, level: number): void {
    if (isShadowRoot(frame.getRootNode())) {
      // Not in the frames of the window, there is no index to switch to it.
      console.warn('ZAP Not recording in a frame in a shadow root', frame);
      return;
    }
    const htmlElement = frame as HTMLIFrameElement | HTMLFrameElement;
    let frameDocument;
    try {
      frameDocument = htmlElement.contentWindow?.document;
    } catch {
      // Ignore cross-origin permission exceptions.
      return;
    }
    if (
      frameDocument != null &&
      frameDocument.readyState === 'complete' &&
      // Allow blank iframes (no src); also Chrome/Edge report completed with different src
      (!htmlElement.src || frameDocument.documentURI === htmlElement.src)
    ) {
      this.addListenersToDocument(
        frameDocument,
        level,
        this.indexOfFrame(frame)
      );
    } else {
      frame.addEventListener(
        'load',
        this.handleFrameLoad.bind(this, {
          element: htmlElement,
          level,
        })
      );
    }
    const domMutated: MutationCallback = (mutationsList: MutationRecord[]) => {
      mutationsList.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'src'
        ) {
          this.processFrame(mutation.target as Element, level);
        }
      });
    };

    const observer = new MutationObserver(domMutated);
    observer.observe(frame, {
      attributes: true,
    });
  }

  processFrames(element: Document | ShadowRoot | Element, level: number): void {
    element
      .querySelectorAll('frame, iframe')
      .forEach((frame) => this.processFrame(frame, level + 1));
  }

  indexOfFrame(element: Element): number {
    for (let i = 0; i < window.frames.length; i += 1) {
      try {
        if (window.frames[i].frameElement === element) {
          return i;
        }
      } catch {
        // Ignore cross-origin permission exceptions.
      }
    }
    return -1;
  }

  /**
   * Starts tracking the shadow root of the given host, if any, with the same level and frame as the
   * host.
   */
  trackShadowHost(host: Element, level: number, frame: number): void {
    const root = getShadowRoot(host);
    if (!root) return;
    this.shadowHosts.add(host);
    if (this.trackedShadowRoots.has(root)) return;
    this.trackedShadowRoots.add(root);
    // The events that originated inside the root.
    const insideEvents = new WeakSet<Event>();
    root.addEventListener('click', (event: Event) => insideEvents.add(event), {
      capture: true,
    });
    // Seen after the listeners of the root, even if the event does not bubble.
    host.addEventListener('click', (event: Event) => {
      const handle = this.deferredEvents.get(event);
      if (!handle) return;
      this.deferredEvents.delete(event);
      if (insideEvents.has(event)) return;
      this.hostEvents.add(event);
      handle();
    });
    this.addListenersToDocument(root, level, frame);
  }

  /** Tracks the shadow roots of the given element and its descendants. */
  trackShadowHosts(
    container: Document | ShadowRoot | Element,
    level: number,
    frame: number
  ): void {
    if (container.nodeType === Node.ELEMENT_NODE) {
      this.trackShadowHost(container as Element, level, frame);
    }
    const doc = container.ownerDocument ?? (container as Document);
    // Cheaper than querying all elements
    const walker = doc.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      this.trackShadowHost(node as Element, level, frame);
    }
  }

  /** Tracks the shadow roots of the given elements, once for those added inside the others. */
  trackAddedShadowHosts(
    added: Set<Element>,
    level: number,
    frame: number
  ): void {
    added.forEach((el) => {
      for (let p = el.parentNode; p; p = p.parentNode) {
        if (added.has(p as Element)) return;
      }
      this.trackShadowHosts(el, level, frame);
    });
  }

  addListenersToDocument(
    element: Document | ShadowRoot,
    level: number,
    frame: number
  ): void {
    // A list of all of the text elements that we have added event listeners to
    const textElements = new Set<HTMLElement>();

    this.rootFrames.set(element, {level, frame});

    element.addEventListener(
      'click',
      this.handleClick.bind(this, {level, frame, element}),
      {
        capture: true,
      }
    );
    element.addEventListener(
      'scroll',
      debounce(this.handleScroll.bind(this, {level, frame, element}), 1000)
    );
    // Do not track mouse over events for now, they are not recorded.
    // element.addEventListener(
    //   'mouseover',
    //   this.handleMouseOver.bind(this, {level, frame, element})
    // );
    element.addEventListener(
      'change',
      this.handleChange.bind(this, {level, frame, element})
    );
    element.addEventListener(
      'keydown',
      this.handleKeyEdit.bind(this) as EventListener,
      {capture: true}
    );
    element.addEventListener(
      'paste',
      (event: Event) => {
        const target = event.target as HTMLElement;
        if (this.isTrackedInputType(target)) this.editedInputs.add(target);
      },
      {capture: true}
    );
    element.addEventListener('focusin', this.handleFocusIn.bind(this), {
      capture: true,
    });
    element.addEventListener(
      'focusout',
      this.handleFocusOut.bind(this, {level, frame, element}),
      {capture: true}
    );
    element.addEventListener(
      'mousedown',
      (event: Event) => {
        this.handleUserInteraction(event);
        const target = event.target as HTMLElement;
        if (this.isTrackedInputType(target)) {
          const {value} = target;
          this.focusedInput = value ? {element: target, value} : null;
        }
      },
      {capture: true}
    );

    // Hosts of shadow roots created after this point (the others are tracked below or when added).
    // Only the host, its descendants are already tracked and the outer roots see it retargeted.
    element.addEventListener(SHADOW_ATTACHED_EVENT, (event: Event) => {
      if ((event.target as Node | null)?.nodeType === Node.ELEMENT_NODE) {
        this.trackShadowHost(event.target as Element, level, frame);
      }
    });
    if (!isShadowRoot(element)) {
      this.trackedDocuments.set(element, {level, frame});
      // Before the scan below, the roots attached in between are notified.
      element.dispatchEvent(new CustomEvent(SHADOW_TRACKING_START_EVENT));
    }

    this.processFrames(element, level);
    this.trackShadowHosts(element, level, frame);

    // Add listeners to all of the text fields
    element.querySelectorAll('input').forEach((input) => {
      snapshotInputClass(input);
      this.addListenerToInputField(textElements, input, level, frame, element);
    });
    // Observer callback function to handle DOM mutations to detect wanted elements
    const domMutated: MutationCallback = (mutationsList: MutationRecord[]) => {
      const added = new Set<Element>();
      mutationsList.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // Use node type instead of instanceof as it does not work reliably
          if (
            mutation.target.nodeType === Node.ELEMENT_NODE ||
            // The top level children of a shadow root.
            mutation.target.nodeType === Node.DOCUMENT_FRAGMENT_NODE
          ) {
            // Look for added input elements
            const inputs = (mutation.target as Element).querySelectorAll(
              'input'
            );
            for (let j = 0; j < inputs.length; j += 1) {
              const isNewInput = !textElements.has(inputs[j] as HTMLElement);
              snapshotInputClass(inputs[j]);
              this.addListenerToInputField(
                textElements,
                inputs[j],
                level,
                frame,
                element
              );
              // If a newly added input already has a value, its state class was
              // likely set on the detached node before insertion and won't be
              // caught by comparing against the snapshot.
              if (isNewInput && (inputs[j] as HTMLInputElement).value) {
                markClassAsDynamic(inputs[j]);
              }
            }

            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as Element;
                added.add(el);
                const tag = el.tagName;
                if (tag === 'IFRAME' || tag === 'FRAME') {
                  this.processFrame(el, level + 1);
                } else {
                  this.processFrames(el, level);
                }
              }
            });
          }
        }
      });
      this.trackAddedShadowHosts(added, level, frame);
    };

    const observer = new MutationObserver(domMutated);
    observer.observe(element, {
      attributes: false,
      childList: true,
      subtree: true,
    });
  }

  isVisible(el: HTMLElement): boolean {
    const style = window.getComputedStyle(el);

    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
    ) {
      return false;
    }

    // Check layout dimensions
    if (el.offsetWidth <= 0 && el.offsetHeight <= 0) {
      return false;
    }

    const rect = el.getBoundingClientRect();

    // Check rendered size
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    // The element is rendered and visible in layout (may still be off-screen)
    return true;
  }

  /**
   * Whether the event should be recorded, the handler is called later if the event was seen on a
   * host and was not known if it originated on the host itself.
   */
  shouldRecord(
    element: HTMLElement,
    event: Event,
    handler?: () => void
  ): boolean {
    if (!this.active) return this.active;
    if (element.className === ZAP_FLOATING_DIV_ELEMENTS) return false;
    this.trackPendingShadowHost(element);
    // The events are also seen, retargeted, by the listeners of the outer roots; the ones of the
    // shadow root handle them.
    const inside = this.originatesInsideShadow(element, event);
    if (inside === undefined && handler) {
      this.deferredEvents.set(event, handler);
    }
    if (inside !== false) return false;
    if (!this.isVisible(element)) return false;
    // The same event might reach several listeners (e.g. slotted content), record it once.
    if (this.handledEvents.has(event)) return false;
    this.handledEvents.add(event);
    return true;
  }

  /**
   * Tracks the shadow root of the given element if not yet tracked, e.g. the host was added in the
   * same task, before the mutation observers are notified. The listeners added are still called
   * for the event being dispatched.
   */
  private trackPendingShadowHost(element: Element): void {
    if (this.shadowHosts.has(element)) return;
    const position = this.rootFrames.get(element.getRootNode());
    if (position && getShadowRoot(element)) {
      this.trackShadowHosts(element, position.level, position.frame);
    }
  }

  /**
   * Whether the event, seen with the host as its target, originated in the shadow root of the host
   * (and not on the host itself), or undefined if not known.
   */
  private originatesInsideShadow(
    target: HTMLElement,
    event: Event
  ): boolean | undefined {
    if (!this.shadowHosts.has(target) || this.hostEvents.has(event)) {
      return false;
    }
    // Reveals the origin in open roots.
    const origin = event.composedPath()[0];
    if (origin && origin !== target) return true;
    // The origin is known for open roots, it is the host itself.
    if (target.shadowRoot) return false;
    const root = getShadowRoot(target);
    if (!root) return false;
    // Mouse events activated otherwise (e.g. keyboard) have no meaningful position (detail 0).
    if (
      'clientX' in event &&
      (event as MouseEvent).detail > 0 &&
      typeof root.elementFromPoint === 'function'
    ) {
      const {clientX, clientY} = event as MouseEvent;
      const hit = root.elementFromPoint(clientX, clientY);
      return !!hit && hit !== target;
    }
    // Not known (e.g. closed root and a keyboard event), the listeners of the root tell.
    return undefined;
  }

  getBrowserName(): string {
    let browserName: string;
    const {userAgent} = navigator;
    if (userAgent.includes('Chrome')) {
      browserName = 'chrome';
    } else {
      browserName = 'firefox';
    }
    return browserName;
  }

  initializationScript(loginUrl = '', startTime = 0): void {
    console.log(`ZAP initializationScript ${loginUrl}`);
    Browser.storage.sync.set({
      initScript: false,
      loginUrl: '',
      startTime: 0,
      downloadScript: true,
    });
    this.lastStatementTime = startTime;
    const stopRecordingButton = document.getElementById(STOP_RECORDING_ID);
    if (stopRecordingButton) {
      // Can happen if recording restarted in browser launched from ZAP recorder
      stopRecordingButton.textContent = STOP_RECORDING_TEXT;
    }

    this.sendZestScriptToZAP(
      new ZestStatementComment(
        `Recorded by ${Browser.runtime.getManifest().name} ` +
          `${Browser.runtime.getManifest().version} on ${navigator.userAgent}`
      ),
      {sendCache: true, notify: true}
    );
    this.sendZestScriptToZAP(
      new ZestStatementLaunchBrowser(
        this.getBrowserName(),
        loginUrl !== '' ? loginUrl : window.location.href
      ),
      {sendCache: true, notify: true}
    );
    this.handleResize();
  }

  recordUserInteractions(
    initScript = true,
    loginUrl = '',
    startTime = 0
  ): void {
    console.log(`ZAP user interactions ${initScript} ${loginUrl}`);
    if (initScript) {
      this.initializationScript(loginUrl, startTime);
    }
    this.active = true;
    this.previousDOMState = document.documentElement.outerHTML;
    if (this.haveListenersBeenAdded) {
      this.resumeShadowTracking();
      this.insertFloatingPopup();
      return;
    }
    this.haveListenersBeenAdded = true;
    window.addEventListener('resize', debounce(this.handleResize, 100));
    try {
      this.addListenersToDocument(document, -1, 0);
    } catch (err) {
      // Sometimes throw DOMException: Blocked a frame with current origin from accessing a cross-origin frame.
      console.log(err);
    }
    this.insertFloatingPopup();
  }

  /**
   * Restarts the notifications of attached shadow roots and tracks the ones attached while not
   * recording.
   */
  private resumeShadowTracking(): void {
    this.trackedDocuments.forEach((position, doc) => {
      if (!doc.defaultView) {
        // The frame was removed or navigated.
        this.trackedDocuments.delete(doc);
        return;
      }
      doc.dispatchEvent(new CustomEvent(SHADOW_TRACKING_START_EVENT));
      this.trackShadowHosts(doc, position.level, position.frame);
    });
  }

  stopRecordingUserInteractions(): void {
    console.log('ZAP Stopping Recording User Interactions ...');
    this.handleCachedSubmit();
    Browser.storage.sync.set({zaprecordingactive: false});
    this.active = false;
    this.trackedDocuments.forEach((_, doc) =>
      doc.dispatchEvent(new CustomEvent(SHADOW_TRACKING_STOP_EVENT))
    );
    const floatingDiv = document.getElementById(ZAP_FLOATING_DIV);
    if (floatingDiv) {
      floatingDiv.style.display = 'none';
    }
  }

  pad(i: number): string {
    return `${i}`.padStart(2, `0`);
  }

  getDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${this.pad(now.getMonth() + 1)}-${this.pad(
      now.getDate()
    )}-${this.pad(now.getHours())}-${this.pad(now.getMinutes())}-${this.pad(
      now.getSeconds()
    )}`;
  }

  insertFloatingPopup(): void {
    if (this.floatingWindowInserted) {
      const floatingDiv = document.getElementById(ZAP_FLOATING_DIV);
      if (floatingDiv) {
        floatingDiv.style.display = 'flex';
        return;
      }
    }

    const fa = document.createElement('style');
    fa.textContent =
      "@font-face { font-family: 'Roboto';font-style: normal;font-weight: 400;" +
      `src: url("${Browser.runtime.getURL(
        'assets/fonts/Roboto-Regular.ttf'
      )}"); };`;

    document.head.appendChild(fa);

    const floatingDiv = document.createElement('div');
    floatingDiv.style.all = 'initial';
    floatingDiv.className = ZAP_FLOATING_DIV_ELEMENTS;
    floatingDiv.id = ZAP_FLOATING_DIV;
    floatingDiv.style.position = 'fixed';
    floatingDiv.style.top = '100%';
    floatingDiv.style.left = '50%';
    floatingDiv.style.width = '400px';
    floatingDiv.style.height = '100px';
    floatingDiv.style.transform = 'translate(-50%, -105%)';
    floatingDiv.style.backgroundColor = '#f9f9f9';
    floatingDiv.style.border = '2px solid #e74c3c';
    floatingDiv.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
    floatingDiv.style.zIndex = '999999';
    floatingDiv.style.textAlign = 'center';
    floatingDiv.style.borderRadius = '5px';
    floatingDiv.style.fontFamily = 'Roboto';
    floatingDiv.style.display = 'flex';
    floatingDiv.style.flexDirection = 'column';
    floatingDiv.style.justifyContent = 'center';
    floatingDiv.style.alignItems = 'center';

    const textElement = document.createElement('p');
    textElement.style.all = 'initial';
    textElement.className = ZAP_FLOATING_DIV_ELEMENTS;
    textElement.style.margin = '0';
    textElement.style.zIndex = '999999';
    textElement.style.fontSize = '16px';
    textElement.style.color = '#333';
    textElement.style.fontFamily = 'Roboto';
    textElement.textContent = 'ZAP Browser Extension is Recording...';

    const buttonElement = document.createElement('button');
    buttonElement.id = STOP_RECORDING_ID;
    buttonElement.style.all = 'initial';
    buttonElement.className = ZAP_FLOATING_DIV_ELEMENTS;
    buttonElement.style.marginTop = '10px';
    buttonElement.style.padding = '8px 15px';
    buttonElement.style.background = '#e74c3c';
    buttonElement.style.color = 'white';
    buttonElement.style.zIndex = '999999';
    buttonElement.style.border = 'none';
    buttonElement.style.borderRadius = '3px';
    buttonElement.style.cursor = 'pointer';
    buttonElement.style.fontFamily = 'Roboto';
    buttonElement.textContent = 'Stop Recording';
    Browser.storage.sync
      .get({
        downloadScript: false,
      })
      .then((items) => {
        if (items.downloadScript) {
          buttonElement.textContent = STOP_RECORDING_TEXT;
        }
      });

    buttonElement.addEventListener('click', () => {
      this.stopRecordingUserInteractions();
      Browser.runtime.sendMessage({type: STOP_RECORDING});
      Browser.storage.sync
        .get({
          downloadScript: false,
        })
        .then((items) => {
          if (items.downloadScript) {
            Browser.runtime
              .sendMessage({type: GET_ZEST_SCRIPT})
              .then((items2) => {
                const msg = items2 as ZestScriptMessage;
                downloadJson(
                  msg.script,
                  `zap-rec-${
                    window.location.hostname
                  }${this.getDateString()}.zst`
                );
              });

            Browser.storage.sync.set({downloadScript: false});
          }
        });
    });

    floatingDiv.appendChild(textElement);
    floatingDiv.appendChild(buttonElement);

    if (document.body instanceof HTMLFrameSetElement) {
      document.body.after(floatingDiv);
    } else {
      document.body.appendChild(floatingDiv);
    }
    this.floatingWindowInserted = true;

    let isDragging = false;
    let initialMouseX: number;
    let initialMouseY: number;
    let initialDivX: number;
    let initialDivY: number;

    // Mouse down event listener
    floatingDiv.addEventListener('mousedown', (e) => {
      isDragging = true;
      initialMouseX = e.clientX;
      initialMouseY = e.clientY;
      initialDivX = floatingDiv.offsetLeft;
      initialDivY = floatingDiv.offsetTop;
    });

    // Mouse move event listener
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const offsetX = e.clientX - initialMouseX;
      const offsetY = e.clientY - initialMouseY;

      floatingDiv.style.left = `${initialDivX + offsetX}px`;
      floatingDiv.style.top = `${initialDivY + offsetY}px`;
    });

    // Mouse up event listener
    window.addEventListener('mouseup', () => {
      if (!isDragging || floatingDiv.style.left.includes('%')) {
        isDragging = false;
        return;
      }
      const width =
        window.innerWidth ||
        document.documentElement.clientWidth ||
        document.body.clientWidth;

      const height =
        window.innerHeight ||
        document.documentElement.clientHeight ||
        document.body.clientHeight;

      const leftPercent = (parseInt(floatingDiv.style.left) / width) * 100;
      const topPercent = (parseInt(floatingDiv.style.top) / height) * 100;

      floatingDiv.style.left = `${leftPercent}%`;
      floatingDiv.style.top = `${topPercent}%`;
      isDragging = false;
    });
  }

  async notify(stmt: ZestStatement): Promise<void> {
    const notifyMessage = {
      title: '',
      message: '',
    };

    if (stmt instanceof ZestStatementElementClick) {
      notifyMessage.title = 'Click';
      notifyMessage.message = describeLocator(stmt.elementLocator);
    } else if (stmt instanceof ZestStatementElementScrollTo) {
      notifyMessage.title = 'Scroll To';
      notifyMessage.message = describeLocator(stmt.elementLocator);
    } else if (stmt instanceof ZestStatementElementSendKeys) {
      notifyMessage.title = 'Send Keys';
      notifyMessage.message = `${describeLocator(stmt.elementLocator)}: ${stmt.keys}`;
    } else if (stmt instanceof ZestStatementElementSubmit) {
      notifyMessage.title = 'Submit';
      notifyMessage.message = describeLocator(stmt.elementLocator);
    } else if (stmt instanceof ZestStatementLaunchBrowser) {
      notifyMessage.title = 'Launch Browser';
      notifyMessage.message = stmt.browserType;
    } else if (stmt instanceof ZestStatementSwitchToFrame) {
      notifyMessage.title = 'Switch To Frame';
      notifyMessage.message = stmt.frameIndex.toString();
    }

    // wait for previous notification to be removed
    if (this.isNotificationRaised) {
      await this.waitForNotificationToClear();
    }
    const floatingDiv = document.getElementById(ZAP_FLOATING_DIV);
    if (!floatingDiv) {
      console.log('ZAP Floating Div Not Found !');
      return;
    }

    this.isNotificationRaised = true;
    const messageElement = document.createElement('p');
    messageElement.className = ZAP_FLOATING_DIV_ELEMENTS;
    messageElement.textContent = `${notifyMessage.title}: ${notifyMessage.message}`;
    messageElement.style.all = 'initial';
    messageElement.style.fontSize = '20px';
    messageElement.style.zIndex = '999999';
    messageElement.style.fontFamily = 'Roboto';

    const existingChildElements = Array.from(floatingDiv.children || []);

    floatingDiv.innerHTML = '';

    floatingDiv.appendChild(messageElement);

    setTimeout(() => {
      floatingDiv.removeChild(messageElement);
      existingChildElements.forEach((child) => floatingDiv.appendChild(child));
      this.isNotificationRaised = false;
    }, 1000);
  }

  waitForNotificationToClear(): Promise<number> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.isNotificationRaised) {
          clearInterval(checkInterval);
          resolve(1);
        }
      }, 100);
    });
  }
}

export default Recorder;

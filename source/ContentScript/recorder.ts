/*
 * AccuKnox DAST Browser Extension and its related source files.
 *
 * DAST is an HTTP/HTTPS proxy for assessing web application security.
 *
 * Copyright 2023 The AccuKnox DAST Development Team
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
  ZestStatement,
  ZestStatementComment,
  ZestStatementElementClick,
  ZestStatementElementSendKeys,
  ZestStatementElementSubmit,
  ZestStatementLaunchBrowser,
  ZestStatementSwitchToFrame,
} from '../types/zestScript/ZestStatement';
import {ZestScriptMessage} from '../types/zestScript/ZestScript';
import {getPath} from './util';
import {downloadJson} from '../utils/util';
import {
  GET_ZEST_SCRIPT,
  STOP_RECORDING,
  DAST_FLOATING_DIV,
  DAST_FLOATING_DIV_ELEMENTS,
  ZEST_SCRIPT,
} from '../utils/constants';

const STOP_RECORDING_ID = 'DAST-stop-recording-button';
const STOP_RECORDING_TEXT = 'Stop and Download Recording';

class Recorder {
  readonly timeAdjustmentMillis: number = 3000;

  readonly minimumWaitTimeInMillis: number = 5000;

  previousDOMState: string;

  curLevel = -1;

  curFrame = 0;

  active = false;

  haveListenersBeenAdded = false;

  floatingWindowInserted = false;

  isNotificationRaised = false;

  // Enter keydown events often occur before the input change events, so we reorder them if needed
  cachedSubmit?: ZestStatementElementSubmit;

  // We can get duplicate events for the enter key, this allows us to dedup them
  cachedTimeStamp = -1;

  // Hold the most recent click so a SendKeys on the same element can drop it
  // (typing implies focus, the click is redundant).
  cachedClick?: ZestStatementElementClick;

  // Dedup duplicate click events — any click on the same element as the last
  // recorded click is dropped, regardless of how long ago it happened.
  lastClickLocator = '';

  lastStatementTime: number;

  async sendZestScriptToDAST(
    zestStatement: ZestStatement,
    params: {sendCache: boolean; notify: boolean}
  ): Promise<number> {
    if (params.sendCache) {
      this.flushCachedClick();
      this.handleCachedSubmit();
    }
    // console.log('DAST Sending statement', zestStatement);
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

  handleCachedSubmit(): void {
    if (this.cachedSubmit) {
      // console.log('DAST Sending cached submit', this.cachedSubmit);
      this.sendZestScriptToDAST(this.cachedSubmit, {
        sendCache: false,
        notify: true,
      });
      delete this.cachedSubmit;
      this.cachedTimeStamp = -1;
    }
  }

  flushCachedClick(): void {
    if (this.cachedClick) {
      const click = this.cachedClick;
      delete this.cachedClick;
      this.sendZestScriptToDAST(click, {sendCache: false, notify: true});
    }
  }

  handleFrameSwitches(level: number, frameIndex: number): void {
    if (this.curLevel === level && this.curFrame === frameIndex) {
      return;
    }
    this.lastClickLocator = '';
    if (this.curLevel > level) {
      while (this.curLevel > level) {
        this.sendZestScriptToDAST(new ZestStatementSwitchToFrame(-1), {
          sendCache: true,
          notify: true,
        });
        this.curLevel -= 1;
      }
      this.curFrame = frameIndex;
    } else {
      this.curLevel += 1;
      this.curFrame = frameIndex;
      this.sendZestScriptToDAST(new ZestStatementSwitchToFrame(frameIndex), {
        sendCache: true,
        notify: true,
      });
    }
    if (this.curLevel !== level) {
      console.log('DAST Error in switching frames');
    }
  }

  handleClick(
    params: {level: number; frame: number; element: Document},
    event: Event
  ): void {
    if (!this.shouldRecord(event.target as HTMLElement)) return;
    const waited: number = this.getWaited();
    const {level, frame, element} = params;
    this.handleFrameSwitches(level, frame);
    console.log(event, 'DAST clicked');
    const elementLocator = getPath(event.target as HTMLElement, element);

    if ((event as MouseEvent).detail === 0) {
      // Not a user click.
      if (this.cachedSubmit) {
        this.handleCachedSubmit();
      }
      return;
    }

    if (this.lastClickLocator === elementLocator.element) {
      return;
    }
    this.lastClickLocator = elementLocator.element;

    // Flush any prior cached click (the one that follows is on a different
    // element, otherwise the dedup above would have returned), then cache
    // this click so a SendKeys on the same element can drop it.
    this.flushCachedClick();
    if (this.cachedSubmit) {
      this.handleCachedSubmit();
    }
    this.cachedClick = new ZestStatementElementClick(elementLocator, waited);
    // click on target element
  }

  handleMouseOver(
    params: {level: number; frame: number; element: Document},
    event: Event
  ): void {
    if (!this.shouldRecord(event.target as HTMLElement)) return;
    const {level, frame, element} = params;
    const currentDOMState = element.documentElement.outerHTML;
    if (currentDOMState === this.previousDOMState) {
      return;
    }
    this.previousDOMState = currentDOMState;
    this.handleFrameSwitches(level, frame);
    console.log(event, 'DAST MouseOver');
    // send mouseover event
  }

  handleChange(
    params: {level: number; frame: number; element: Document},
    event: Event
  ): void {
    if (!this.shouldRecord(event.target as HTMLElement)) return;
    const {level, frame, element} = params;
    const waited: number = this.getWaited();
    this.handleFrameSwitches(level, frame);
    console.log(event, 'DAST change', (event.target as HTMLInputElement).value);
    const elementLocator = getPath(event.target as HTMLElement, element);
    // If the most recent click was on this same element, drop it: the focus
    // implied by the click is already implicit in the SendKeys.
    if (
      this.cachedClick &&
      this.cachedClick.elementLocator.element === elementLocator.element
    ) {
      delete this.cachedClick;
    } else {
      this.flushCachedClick();
    }
    // Send the keys before a cached submit statement on the same element
    if (
      this.cachedSubmit &&
      this.cachedSubmit.elementLocator.element !== elementLocator.element
    ) {
      // The cached submit was not on the same element, so send it
      this.handleCachedSubmit();
    }
    this.sendZestScriptToDAST(
      new ZestStatementElementSendKeys(
        elementLocator,
        (event.target as HTMLInputElement).value,
        waited
      ),
      {sendCache: false, notify: true}
    );
    // Now send the cached submit, if there still is one
    this.handleCachedSubmit();
  }

  handleKeypress(
    params: {level: number; frame: number; element: Document},
    event: KeyboardEvent
  ): void {
    if (!this.shouldRecord(event.target as HTMLElement)) return;
    const {element} = params;
    if (event.key === 'Enter') {
      if (this.cachedSubmit && this.cachedTimeStamp === event.timeStamp) {
        // console.log('DAST Ignoring dup Enter event', this.cachedSubmit);
        return;
      }
      this.flushCachedClick();
      this.handleCachedSubmit();
      const elementLocator = getPath(event.target as HTMLElement, element);
      // console.log('DAST Enter key pressed', elementLocator, event.timeStamp);
      // Cache the statement as it often occurs before the change event occurs
      this.cachedSubmit = new ZestStatementElementSubmit(
        elementLocator,
        this.getWaited()
      );
      this.cachedTimeStamp = event.timeStamp;
      // console.log('DAST Caching submit', this.cachedSubmit);
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
    console.log('DAST Window Resize : ', width, height);
  }

  addListenerToInputField(
    elements: Set<HTMLElement>,
    inputField: HTMLElement,
    level: number,
    frame: number,
    element: Document
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
    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (doc != null) {
      this.addListenersToDocument(doc, params.level, this.indexOfFrame(frame));
    }
  }

  processFrame(frame: Element, level: number): void {
    const htmlElement = frame as HTMLIFrameElement | HTMLFrameElement;
    const frameDocument = htmlElement.contentWindow?.document;
    if (
      frameDocument != null &&
      frameDocument.readyState === 'complete' &&
      // Chrome/Edge report completed with different src
      frameDocument.documentURI === htmlElement.src
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

  indexOfFrame(element: Element): number {
    for (let i = 0; i < window.frames.length; i += 1) {
      if (window.frames[i].frameElement === element) {
        return i;
      }
    }
    return -1;
  }

  addListenersToDocument(
    element: Document,
    level: number,
    frame: number
  ): void {
    // A list of all of the text elements that we have added event listeners to
    const textElements = new Set<HTMLElement>();

    element.addEventListener(
      'click',
      this.handleClick.bind(this, {level, frame, element}),
      {
        capture: true,
      }
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

    // Add listeners to all the frames
    const frames = element.querySelectorAll('frame, iframe');
    frames.forEach((_frame) => this.processFrame(_frame, level + 1));

    // Add listeners to all of the text fields
    element.querySelectorAll('input').forEach((input) => {
      this.addListenerToInputField(textElements, input, level, frame, element);
    });
    // Observer callback function to handle DOM mutations to detect added text fields
    const domMutated: MutationCallback = (mutationsList: MutationRecord[]) => {
      mutationsList.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // Use node type instead of instanceof as it does not work reliably
          if (mutation.target.nodeType === Node.ELEMENT_NODE) {
            // Look for added input elements
            const inputs = (mutation.target as Element).getElementsByTagName(
              'input'
            );
            for (let j = 0; j < inputs.length; j += 1) {
              this.addListenerToInputField(
                textElements,
                inputs[j],
                level,
                frame,
                element
              );
            }
          }
        }
      });
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

  shouldRecord(element: HTMLElement): boolean {
    if (!this.active) return this.active;
    if (element.className === DAST_FLOATING_DIV_ELEMENTS) return false;
    return this.isVisible(element);
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
    console.log(`DAST initializationScript ${loginUrl}`);
    Browser.storage.sync.set({
      initScript: false,
      loginUrl: '',
      startTime: 0,
      downloadScript: true,
    });
    this.lastStatementTime = startTime;
    const stopRecordingButton = document.getElementById(STOP_RECORDING_ID);
    if (stopRecordingButton) {
      // Can happen if recording restarted in browser launched from DAST recorder
      stopRecordingButton.textContent = STOP_RECORDING_TEXT;
    }

    this.sendZestScriptToDAST(
      new ZestStatementComment(
        `Recorded by ${Browser.runtime.getManifest().name} ` +
          `${Browser.runtime.getManifest().version} on ${navigator.userAgent}`
      ),
      {sendCache: true, notify: true}
    );
    this.sendZestScriptToDAST(
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
    console.log(`DAST user interactions ${initScript} ${loginUrl}`);
    if (initScript) {
      this.initializationScript(loginUrl, startTime);
    }
    this.active = true;
    this.lastClickLocator = '';
    this.previousDOMState = document.documentElement.outerHTML;
    if (this.haveListenersBeenAdded) {
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

  stopRecordingUserInteractions(): void {
    console.log('DAST Stopping Recording User Interactions ...');
    this.flushCachedClick();
    this.handleCachedSubmit();
    Browser.storage.sync.set({dastrecordingactive: false});
    this.active = false;
    const floatingDiv = document.getElementById(DAST_FLOATING_DIV);
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
      const floatingDiv = document.getElementById(DAST_FLOATING_DIV);
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
    floatingDiv.className = DAST_FLOATING_DIV_ELEMENTS;
    floatingDiv.id = DAST_FLOATING_DIV;
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
    textElement.className = DAST_FLOATING_DIV_ELEMENTS;
    textElement.style.margin = '0';
    textElement.style.zIndex = '999999';
    textElement.style.fontSize = '16px';
    textElement.style.color = '#333';
    textElement.style.fontFamily = 'Roboto';
    textElement.textContent = 'DAST Browser Extension is Recording...';

    const buttonElement = document.createElement('button');
    buttonElement.id = STOP_RECORDING_ID;
    buttonElement.style.all = 'initial';
    buttonElement.className = DAST_FLOATING_DIV_ELEMENTS;
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
                  `dast-rec-${
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
      notifyMessage.message = stmt.elementLocator.element;
    } else if (stmt instanceof ZestStatementElementSendKeys) {
      notifyMessage.title = 'Send Keys';
      notifyMessage.message = `${stmt.elementLocator.element}: ${stmt.keys}`;
    } else if (stmt instanceof ZestStatementElementSubmit) {
      notifyMessage.title = 'Submit';
      notifyMessage.message = `${stmt.elementLocator.element}`;
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
    const floatingDiv = document.getElementById(DAST_FLOATING_DIV);
    if (!floatingDiv) {
      console.log('DAST Floating Div Not Found !');
      return;
    }

    this.isNotificationRaised = true;
    const messageElement = document.createElement('p');
    messageElement.className = DAST_FLOATING_DIV_ELEMENTS;
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

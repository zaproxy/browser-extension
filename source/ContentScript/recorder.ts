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
  ZestStatement,
  ZestStatementComment,
  ZestStatementElementClick,
  ZestStatementElementScrollTo,
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
  ZAP_FLOATING_DIV,
  ZAP_FLOATING_DIV_ELEMENTS,
  ZEST_SCRIPT,
} from '../utils/constants';

const STOP_RECORDING_ID = 'ZAP-stop-recording-button';
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

  lastStatementTime: number;

  async sendZestScriptToZAP(
    zestStatement: ZestStatement,
    sendCache = true
  ): Promise<number> {
    if (sendCache) {
      this.handleCachedSubmit();
    }
    // console.log('ZAP Sending statement', zestStatement);
    this.notify(zestStatement);
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
      this.sendZestScriptToZAP(
        new ZestStatementElementScrollTo(
          this.cachedSubmit.elementLocator,
          this.getWaited()
        ),
        false
      );
      // console.log('ZAP Sending cached submit', this.cachedSubmit);
      this.sendZestScriptToZAP(this.cachedSubmit, false);
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
        this.sendZestScriptToZAP(new ZestStatementSwitchToFrame(-1));
        this.curLevel -= 1;
      }
      this.curFrame = frameIndex;
    } else {
      this.curLevel += 1;
      this.curFrame = frameIndex;
      this.sendZestScriptToZAP(new ZestStatementSwitchToFrame(frameIndex));
    }
    if (this.curLevel !== level) {
      console.log('ZAP Error in switching frames');
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
    console.log(event, 'ZAP clicked');
    const elementLocator = getPath(event.target as HTMLElement, element);
    this.sendZestScriptToZAP(
      new ZestStatementElementScrollTo(elementLocator, waited),
      false
    );
    this.sendZestScriptToZAP(
      new ZestStatementElementClick(elementLocator, waited)
    );
    // click on target element
  }

  handleScroll(params: {level: number; frame: number}, event: Event): void {
    if (!this.shouldRecord(event.target as HTMLElement)) return;
    const {level, frame} = params;
    this.handleFrameSwitches(level, frame);
    console.log(event, 'ZAP scrolling.. ');
    // scroll the nearest ancestor with scrolling ability
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
    console.log(event, 'ZAP MouseOver');
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
    console.log(event, 'ZAP change', (event.target as HTMLInputElement).value);
    const elementLocator = getPath(event.target as HTMLElement, element);
    // Send the keys before a cached submit statement on the same element
    if (
      this.cachedSubmit &&
      this.cachedSubmit.elementLocator.element !== elementLocator.element
    ) {
      // The cached submit was not on the same element, so send it
      this.handleCachedSubmit();
    }
    this.sendZestScriptToZAP(
      new ZestStatementElementScrollTo(elementLocator, waited),
      false
    );
    this.sendZestScriptToZAP(
      new ZestStatementElementSendKeys(
        elementLocator,
        (event.target as HTMLInputElement).value,
        waited
      ),
      false
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

  shouldRecord(element: HTMLElement): boolean {
    if (!this.active) return this.active;
    if (element.className === ZAP_FLOATING_DIV_ELEMENTS) return false;
    return true;
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
      )
    );
    this.sendZestScriptToZAP(
      new ZestStatementLaunchBrowser(
        this.getBrowserName(),
        loginUrl !== '' ? loginUrl : window.location.href
      )
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
    console.log('ZAP Stopping Recording User Interactions ...');
    this.handleCachedSubmit();
    Browser.storage.sync.set({zaprecordingactive: false});
    this.active = false;
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
      notifyMessage.message = stmt.elementLocator.element;
    } else if (stmt instanceof ZestStatementElementScrollTo) {
      notifyMessage.title = 'Scroll To';
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

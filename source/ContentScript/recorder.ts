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
  ZestStatementElementClick,
  ZestStatementElementSendKeys,
  ZestStatementLaunchBrowser,
  ZestStatementSwichToFrame,
} from '../types/zestScript/ZestStatement';
import {getPath} from './util';

class Recorder {
  previousDOMState: string;

  curLevel = -1;

  curFrame = 0;

  active = false;

  haveListenersBeenAdded = false;

  async sendZestScriptToZAP(zestStatement: ZestStatement): Promise<number> {
    return Browser.runtime.sendMessage({
      type: 'zestScript',
      data: zestStatement.toJSON(),
    });
  }

  handleFrameSwitches(level: number, frameIndex: number): void {
    if (this.curLevel === level && this.curFrame === frameIndex) {
      return;
    }
    if (this.curLevel > level) {
      while (this.curLevel > level) {
        this.sendZestScriptToZAP(new ZestStatementSwichToFrame(-1));
        this.curLevel -= 1;
      }
      this.curFrame = frameIndex;
    } else {
      this.curLevel += 1;
      this.curFrame = frameIndex;
      this.sendZestScriptToZAP(new ZestStatementSwichToFrame(frameIndex));
    }
    if (this.curLevel !== level) {
      console.log('Error in switching frames');
    }
  }

  handleClick(
    params: {level: number; frame: number; element: Document},
    event: Event
  ): void {
    if (!this.active) return;
    const {level, frame, element} = params;
    this.handleFrameSwitches(level, frame);
    console.log(event, 'clicked');
    const elementLocator = getPath(event.target as HTMLElement, element);
    this.sendZestScriptToZAP(new ZestStatementElementClick(elementLocator));
    // click on target element
  }

  handleScroll(params: {level: number; frame: number}, event: Event): void {
    if (!this.active) return;
    const {level, frame} = params;
    this.handleFrameSwitches(level, frame);
    console.log(event, 'scrolling.. ');
    // scroll the nearest ancestor with scrolling ability
  }

  handleMouseOver(
    params: {level: number; frame: number; element: Document},
    event: Event
  ): void {
    if (!this.active) return;
    const {level, frame, element} = params;
    const currentDOMState = element.documentElement.outerHTML;
    if (currentDOMState === this.previousDOMState) {
      return;
    }
    this.previousDOMState = currentDOMState;
    this.handleFrameSwitches(level, frame);
    console.log(event, 'MouseOver');
    // send mouseover event
  }

  handleChange(
    params: {level: number; frame: number; element: Document},
    event: Event
  ): void {
    if (!this.active) return;
    const {level, frame, element} = params;
    this.handleFrameSwitches(level, frame);
    console.log(event, 'change', (event.target as HTMLInputElement).value);
    const elementLocator = getPath(event.target as HTMLElement, element);
    this.sendZestScriptToZAP(
      new ZestStatementElementSendKeys(
        elementLocator,
        (event.target as HTMLInputElement).value
      )
    );
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
    console.log('Window Resize : ', width, height);
  }

  addListenersToDocument(
    element: Document,
    level: number,
    frame: number
  ): void {
    element.addEventListener(
      'click',
      this.handleClick.bind(this, {level, frame, element})
    );
    element.addEventListener(
      'scroll',
      debounce(this.handleScroll.bind(this, {level, frame, element}), 1000)
    );
    element.addEventListener(
      'mouseover',
      this.handleMouseOver.bind(this, {level, frame, element})
    );
    element.addEventListener(
      'change',
      this.handleChange.bind(this, {level, frame, element})
    );

    // Add listeners to all the frames
    const frames = element.querySelectorAll('frame, iframe');
    let i = 0;
    frames.forEach((_frame) => {
      const frameDocument = (_frame as HTMLIFrameElement | HTMLObjectElement)
        .contentWindow?.document;
      if (frameDocument != null) {
        this.addListenersToDocument(frameDocument, level + 1, i);
        i += 1;
      }
    });
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

  initializationScript(): void {
    // send window resize event to ensure same size
    const browserType = this.getBrowserName();
    const url = window.location.href;
    this.sendZestScriptToZAP(new ZestStatementLaunchBrowser(browserType, url));
    this.handleResize();
  }

  recordUserInteractions(): void {
    console.log('user interactions');
    this.active = true;
    this.previousDOMState = document.documentElement.outerHTML;
    if (this.haveListenersBeenAdded) return;
    this.haveListenersBeenAdded = true;
    window.addEventListener('resize', debounce(this.handleResize, 100));
    this.addListenersToDocument(document, -1, 0);
  }

  stopRecordingUserInteractions(): void {
    console.log('Stopping Recording User Interactions ...');
    this.active = false;
  }
}

export default Recorder;

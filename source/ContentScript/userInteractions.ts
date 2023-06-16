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
} from '../types/zestScript/ZestStatement';
import {getPath} from './util';

let previousDOMState: string;
let curLevel = -1;
let curFrame = 0;
let active = true;

async function sendZestScriptToZAP(
  zestStatement: ZestStatement
): Promise<number> {
  return Browser.runtime.sendMessage({
    type: 'zestScript',
    data: zestStatement.toJSON(),
  });
}

function handleFrameSwitches(level: number, frame: number): void {
  if (curLevel === level && curFrame === frame) {
    // do nothing
  } else if (curLevel > level) {
    while (curLevel > level) {
      curLevel -= 1;
      console.log('Switched to level: ', curLevel, 'Frame:', curFrame);
      // switch to parent frame
    }
    curFrame = frame;
    console.log('Switched to level: ', curLevel, 'Frame:', curFrame);
    // switch to frame
  } else {
    curLevel += 1;
    curFrame = frame;
    console.log('Switched to level: ', curLevel, 'Frame:', curFrame);
    // switch to frame number 'frame'
  }
}

function handleClick(
  this: {level: number; frame: number; element: Document},
  event: Event
): void {
  if (!active) return;
  const {level, frame, element} = this;
  handleFrameSwitches(level, frame);
  console.log(event, 'clicked');
  const elementLocator = getPath(event.target as HTMLElement, element);
  sendZestScriptToZAP(new ZestStatementElementClick(elementLocator));
  // click on target element
}

function handleScroll(
  this: {level: number; frame: number},
  event: Event
): void {
  if (!active) return;
  const {level, frame} = this;
  handleFrameSwitches(level, frame);
  console.log(event, 'scrolling.. ');
  // scroll the nearest ancestor with scrolling ability
}

function handleMouseOver(
  this: {level: number; frame: number; element: Document},
  event: Event
): void {
  if (!active) return;
  const {level, frame, element} = this;
  const currentDOMState = element.documentElement.outerHTML;
  if (currentDOMState === previousDOMState) {
    return;
  }
  previousDOMState = currentDOMState;
  handleFrameSwitches(level, frame);
  console.log(event, 'MouseOver');
  // send mouseover event
}

function handleChange(
  this: {level: number; frame: number; element: Document},
  event: Event
): void {
  if (!active) return;
  const {level, frame, element} = this;
  handleFrameSwitches(level, frame);
  console.log(event, 'change', (event.target as HTMLInputElement).value);
  const elementLocator = getPath(event.target as HTMLElement, element);
  sendZestScriptToZAP(
    new ZestStatementElementSendKeys(
      elementLocator,
      (event.target as HTMLInputElement).value
    )
  );
  // send keys to the element
}

function handleResize(): void {
  if (!active) return;
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

function addListenersToDocument(
  element: Document,
  level: number,
  frame: number
): void {
  element.addEventListener('click', handleClick.bind({level, frame, element}));
  element.addEventListener(
    'scroll',
    debounce(handleScroll.bind({level, frame, element}), 1000)
  );
  element.addEventListener(
    'mouseover',
    handleMouseOver.bind({level, frame, element})
  );
  element.addEventListener(
    'change',
    handleChange.bind({level, frame, element})
  );

  // Add listeners to all the frames
  const frames = element.querySelectorAll('frame, iframe');
  let i = 0;
  frames.forEach((_frame) => {
    const frameDocument = (_frame as HTMLIFrameElement | HTMLObjectElement)
      .contentWindow?.document;
    if (frameDocument != null) {
      addListenersToDocument(frameDocument, level + 1, i);
      i += 1;
    }
  });
}

function getBrowserName(): string {
  let browserName: string;
  const {userAgent} = navigator;
  if (userAgent.includes('Chrome')) {
    browserName = 'chrome';
  } else {
    browserName = 'firefox';
  }
  return browserName;
}

function initializationScript(): void {
  // send window resize event to ensure same size
  const browserType = getBrowserName();
  const url = window.location.href;
  sendZestScriptToZAP(new ZestStatementLaunchBrowser(browserType, url));
  handleResize();
  // TODO: goto URL specified
}

function recordUserInteractions(): void {
  console.log('user interactions');
  active = true;
  previousDOMState = document.documentElement.outerHTML;
  window.addEventListener('resize', debounce(handleResize, 100));
  addListenersToDocument(document, -1, 0);
}

function stopRecordingUserInteractions(): void {
  console.log('Stopping Recording User Interactions ...');
  active = false;
}

export {
  recordUserInteractions,
  stopRecordingUserInteractions,
  initializationScript,
};

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
let previousDOMState: string;
let curLevel = -1;
let curFrame = 0;

function handleFrameSwitches(level: number, frame: number): void {
  if (curLevel === level && curFrame === frame) {
    // do nothing
  } else if (curLevel > level) {
    while (curLevel > level) {
      // switch to parent frame
      console.log('Switch to parent Frame', 'Frame:', frame, 'level:', level);
      curLevel -= 1;
    }
    curFrame = frame;
    console.log('Frame switches', 'Frame:', frame, 'level:', level);
  } else {
    // switch to frame number 'frame'
    curLevel += 1;
    curFrame = frame;
    console.log('Frame switches', 'Frame:', frame, 'level:', level);
  }
}

function handleClick(this: {level: number; frame: number}, event: Event): void {
  const {level, frame} = this;
  handleFrameSwitches(level, frame);
  console.log(event);
  // click on target element
}

function handleScroll(
  this: {level: number; frame: number},
  event: Event
): void {
  const {level, frame} = this;
  handleFrameSwitches(level, frame);
  console.log(event, 'scrolling..');
  // scroll the nearest ancestor with scrolling ability
}

function handleMouseOver(
  this: {level: number; frame: number},
  event: Event
): void {
  const {level, frame} = this;
  const currentDOMState = document.documentElement.outerHTML;
  if (currentDOMState === previousDOMState) {
    return;
  }
  previousDOMState = currentDOMState;
  handleFrameSwitches(level, frame);
  console.log(event, 'MouseOver');
  // send mouseover event
}

function handleChange(
  this: {level: number; frame: number},
  event: Event
): void {
  const {level, frame} = this;
  handleFrameSwitches(level, frame);
  console.log(event, 'change', (event.target as HTMLInputElement).value);
  // send keys to the element
}

function addListenersToDocument(
  element: Document,
  level: number,
  frame: number
): void {
  element.addEventListener('click', handleClick.bind({level, frame}));
  element.addEventListener('scroll', handleScroll.bind({level, frame}));
  element.addEventListener('mouseover', handleMouseOver.bind({level, frame}));
  element.addEventListener('change', handleChange.bind({level, frame}));

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

function removeListenersFromDocument(element: Document): void {
  element.removeEventListener('click', handleClick);
  element.removeEventListener('scroll', handleScroll);
  element.removeEventListener('mouseover', handleMouseOver);
  element.removeEventListener('change', handleChange);

  const frames = element.querySelectorAll('frame, iframe');
  frames.forEach((frame) => {
    const frameDocument = (frame as HTMLIFrameElement | HTMLObjectElement)
      .contentWindow?.document;
    if (frameDocument != null) {
      removeListenersFromDocument(frameDocument);
    }
  });
}

function recordUserInteractions(): void {
  console.log('user interactions');
  previousDOMState = document.documentElement.outerHTML;
  addListenersToDocument(document, -1, 0);
}

function stopRecordingUserInteractions(): void {
  console.log('Stopping recording user interactions ...');
  previousDOMState = document.documentElement.outerHTML;
  removeListenersFromDocument(document);
}

export {recordUserInteractions, stopRecordingUserInteractions};

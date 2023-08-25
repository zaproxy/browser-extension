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
import {
  DEFAULT_WINDOW_HANDLE,
  ZEST_CLIENT_ELEMENT_CLEAR,
  ZEST_CLIENT_ELEMENT_CLICK,
  ZEST_CLIENT_ELEMENT_MOUSE_OVER,
  ZEST_CLIENT_ELEMENT_SEND_KEYS,
  ZEST_CLIENT_LAUNCH,
  ZEST_CLIENT_SWITCH_TO_FRAME,
  ZEST_CLIENT_WINDOW_CLOSE,
} from '../../utils/constants';

class ElementLocator {
  type: string;

  element: string;

  constructor(type: string, element: string) {
    this.type = type;
    this.element = element;
  }

  toJSON(): {type: string; element: string} {
    return {
      type: this.type,
      element: this.element,
    };
  }
}

abstract class ZestStatement {
  index: number;

  elementType: string;

  constructor(elementType: string) {
    this.elementType = elementType;
    this.index = -1;
  }

  abstract toJSON(): string;
}

class ZestStatementLaunchBrowser extends ZestStatement {
  windowHandle: string;

  browserType: string;

  url: string;

  constructor(
    browserType: string,
    url: string,
    windowHandle = DEFAULT_WINDOW_HANDLE
  ) {
    super(ZEST_CLIENT_LAUNCH);
    this.windowHandle = windowHandle;
    this.browserType = browserType;
    this.url = url;
  }

  toJSON(): string {
    return JSON.stringify({
      windowHandle: this.windowHandle,
      browserType: this.browserType,
      url: this.url,
      capabilities: '',
      headless: false,
      index: this.index,
      enabled: true,
      elementType: this.elementType,
    });
  }
}

abstract class ZestStatementElement extends ZestStatement {
  elementLocator: ElementLocator;

  windowHandle: string;

  constructor(elementType: string, elementLocator: ElementLocator) {
    super(elementType);
    this.elementLocator = elementLocator;
  }
}

class ZestStatementElementClick extends ZestStatementElement {
  constructor(
    elementLocator: ElementLocator,
    windowHandle = DEFAULT_WINDOW_HANDLE
  ) {
    super(ZEST_CLIENT_ELEMENT_CLICK, elementLocator);
    this.windowHandle = windowHandle;
  }

  toJSON(): string {
    return JSON.stringify({
      windowHandle: this.windowHandle,
      ...this.elementLocator.toJSON(),
      index: this.index,
      enabled: true,
      elementType: this.elementType,
    });
  }
}

class ZestStatementElementSendKeys extends ZestStatementElement {
  keys: string;

  constructor(
    elementLocator: ElementLocator,
    keys: string,
    windowHandle = DEFAULT_WINDOW_HANDLE
  ) {
    super(ZEST_CLIENT_ELEMENT_SEND_KEYS, elementLocator);
    this.keys = keys;
    this.windowHandle = windowHandle;
  }

  toJSON(): string {
    return JSON.stringify({
      value: this.keys,
      windowHandle: this.windowHandle,
      ...this.elementLocator.toJSON(),
      index: this.index,
      enabled: true,
      elementType: this.elementType,
    });
  }
}

class ZestStatementElementClear extends ZestStatementElement {
  constructor(
    elementLocator: ElementLocator,
    windowHandle = DEFAULT_WINDOW_HANDLE
  ) {
    super(ZEST_CLIENT_ELEMENT_CLEAR, elementLocator);
    this.windowHandle = windowHandle;
  }

  toJSON(): string {
    return JSON.stringify({
      windowHandle: this.windowHandle,
      ...this.elementLocator.toJSON(),
      index: this.index,
      enabled: true,
      elementType: this.elementType,
    });
  }
}

class ZestStatementWindowClose extends ZestStatement {
  sleepInSeconds: number;

  windowHandle: string;

  constructor(sleepInSeconds: number, windowHandle = DEFAULT_WINDOW_HANDLE) {
    super(ZEST_CLIENT_WINDOW_CLOSE);
    this.sleepInSeconds = sleepInSeconds;
    this.windowHandle = windowHandle;
  }

  toJSON(): string {
    return JSON.stringify({
      windowHandle: this.windowHandle,
      index: this.index,
      sleepInSeconds: this.sleepInSeconds,
      enabled: true,
      elementType: this.elementType,
    });
  }
}

class ZestStatementSwitchToFrame extends ZestStatement {
  frameIndex: number;

  frameName: string;

  windowHandle: string;

  constructor(
    frameIndex: number,
    frameName = '',
    windowHandle = DEFAULT_WINDOW_HANDLE
  ) {
    super(ZEST_CLIENT_SWITCH_TO_FRAME);
    this.frameIndex = frameIndex;
    this.frameName = frameName;
    this.windowHandle = windowHandle;
  }

  toJSON(): string {
    return JSON.stringify({
      windowHandle: this.windowHandle,
      frameIndex: this.frameIndex,
      frameName: this.frameName,
      parent: this.frameIndex === -1,
      index: this.index,
      enabled: true,
      elementType: this.elementType,
    });
  }
}

class ZestStatementElementMouseOver extends ZestStatementElement {
  constructor(elementLocator: ElementLocator) {
    super(ZEST_CLIENT_ELEMENT_MOUSE_OVER, elementLocator);
  }

  toJSON(): string {
    return JSON.stringify({
      elementType: this.elementType,
    });
  }
}

export {
  ElementLocator,
  ZestStatement,
  ZestStatementLaunchBrowser,
  ZestStatementElementMouseOver,
  ZestStatementElementClick,
  ZestStatementSwitchToFrame,
  ZestStatementElementSendKeys,
  ZestStatementElementClear,
  ZestStatementWindowClose,
};

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
    windowHandle = 'windowHandle1'
  ) {
    super('ZestClientLaunch');
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
  constructor(elementLocator: ElementLocator, windowHandle = 'windowHandle1') {
    super('ZestClientElementClick', elementLocator);
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
    windowHandle = 'windowHandle1'
  ) {
    super('ZestClientElementSendKeys', elementLocator);
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
  constructor(elementLocator: ElementLocator, windowHandle = 'windowHandle1') {
    super('ZestClientElementClear', elementLocator);
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

  constructor(sleepInSeconds: number, windowHandle = 'windowHandle1') {
    super('ZestClientWindowClose');
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

class ZestStatementSwichToFrame extends ZestStatement {
  frameIndex: number;

  constructor(frameIndex: number) {
    super('ZestSwitchToFrame');
    this.frameIndex = frameIndex;
  }

  toJSON(): string {
    return JSON.stringify({
      elementType: this.elementType,
      frameIndex: this.frameIndex,
    });
  }
}

class ZestStatementElementMouseOver extends ZestStatementElement {
  constructor(elementLocator: ElementLocator) {
    super('ZestMouseOverElement', elementLocator);
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
  ZestStatementSwichToFrame,
  ZestStatementElementSendKeys,
  ZestStatementElementClear,
  ZestStatementWindowClose,
};

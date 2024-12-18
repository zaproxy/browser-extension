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
class ReportedObject {
  public timestamp: number;

  public type: string;

  public tagName: string;

  public id: string;

  public nodeName: string;

  public url: string;

  public xpath: string;

  public href: string | null;

  public text: string | null;

  public constructor(
    type: string,
    tagName: string,
    id: string,
    nodeName: string,
    text: string | null,
    url: string
  ) {
    this.timestamp = Date.now();
    this.type = type;
    this.tagName = tagName;
    this.id = id;
    this.nodeName = nodeName;
    this.text = text;
    this.url = url;
  }

  public toString(): string {
    return JSON.stringify(this);
  }

  public toShortString(): string {
    return JSON.stringify(this, function replacer(k: string, v: string) {
      if (k === 'xpath') {
        // Dont return the xpath value - it can change too often in many cases
        return undefined;
      }
      return v;
    });
  }

  // Use this for tests
  public toNonTimestampString(): string {
    return JSON.stringify(this, function replacer(k: string, v: string) {
      if (k === 'timestamp') {
        return undefined;
      }
      return v;
    });
  }
}

class ReportedStorage extends ReportedObject {
  public toShortString(): string {
    return JSON.stringify(this, function replacer(k: string, v: string) {
      if (
        k === 'xpath' ||
        k === 'href' ||
        k === 'timestamp' ||
        (k === 'url' && !(this.type === 'cookies'))
      ) {
        // Storage events are not time or URL specific
        return undefined;
      }
      return v;
    });
  }
}

class ReportedElement extends ReportedObject {
  public tagType: string | null;

  public formId: number | null;

  public constructor(element: Element, url: string) {
    super(
      'nodeAdded',
      element.tagName,
      element.id,
      element.nodeName,
      element.textContent,
      url
    );
    if (element.tagName === 'A') {
      // This gets the full URL rather than a relative one
      const a: HTMLAnchorElement = element as HTMLAnchorElement;
      this.href = a.toString();
    } else if (element.tagName === 'FORM') {
      this.formId = Array.prototype.slice.call(document.forms).indexOf(element);
    } else if (element.tagName === 'INPUT') {
      // Capture extra useful info for input elements
      const input: HTMLInputElement = element as HTMLInputElement;
      this.tagType = input.type;
      this.text = input.value;
      const {form} = input;
      if (form) {
        // This will not work if form tags are not used
        this.formId = Array.prototype.slice.call(document.forms).indexOf(form);
      }
    } else if (element.hasAttribute('href')) {
      this.href = element.getAttribute('href');
    }
  }

  public toShortString(): string {
    return JSON.stringify(this, function replacer(k: string, v: string) {
      if (k === 'timestamp') {
        // No point reporting the same element lots of times
        return undefined;
      }
      return v;
    });
  }
}

class ReportedEvent {
  public timestamp: number;

  public eventName: string;

  public url: string;

  public count: number;

  public constructor(eventName: string) {
    this.timestamp = Date.now();
    this.eventName = eventName;
    this.url = window.location.href;
    this.count = 1;
  }

  public toString(): string {
    return JSON.stringify(this);
  }
}

export {ReportedElement, ReportedObject, ReportedStorage, ReportedEvent};

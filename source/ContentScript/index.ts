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
import Browser, {Runtime} from 'webextension-polyfill';
import {
  ReportedElement,
  ReportedObject,
  ReportedStorage,
  ReportedEvent,
  InteractableState,
} from '../types/ReportedModel';
import Recorder from './recorder';
import {
  hasPointerStyle,
  getInteractableState,
  hasInteractableTagAncestor,
  INTERACTABLE_TAG_NAMES,
} from './util';
import {
  IS_FULL_EXTENSION,
  LOCAL_STORAGE,
  LOCAL_ZAP_ENABLE,
  LOCAL_ZAP_RECORD,
  REPORT_EVENT,
  REPORT_OBJECT,
  SESSION_STORAGE,
  URL_ZAP_ENABLE,
  URL_ZAP_RECORD,
  ZAP_START_RECORDING,
  ZAP_STOP_RECORDING,
} from '../utils/constants';

const reportedObjects = new Set<string>();

const reportedEvents: {[key: string]: ReportedEvent} = {};

const elementInteractableState = new WeakMap<Element, InteractableState>();

let trackedElementRefs: WeakRef<Element>[] = [];

const recorder = new Recorder();

function reportStorage(
  name: string,
  storage: Storage,
  fn: (re: ReportedStorage) => void
): void {
  if (IS_FULL_EXTENSION) {
    const url = window.location.href;
    for (const key of Object.keys(storage)) {
      fn(new ReportedStorage(name, '', key, '', storage.getItem(key), url));
    }
  }
}

async function sendEventToZAP(obj: ReportedEvent): Promise<number> {
  if (IS_FULL_EXTENSION) {
    return Browser.runtime.sendMessage({
      type: REPORT_EVENT,
      data: obj.toString(),
    });
  }
  return -1;
}

async function sendObjectToZAP(obj: ReportedObject): Promise<number> {
  if (IS_FULL_EXTENSION) {
    return Browser.runtime.sendMessage({
      type: REPORT_OBJECT,
      data: obj.toString(),
    });
  }
  return -1;
}

function reportObject(repObj: ReportedObject): void {
  const repObjStr = repObj.toShortString();
  if (!reportedObjects.has(repObjStr)) {
    sendObjectToZAP(repObj);
    reportedObjects.add(repObjStr);
  }
}

function reportAllStorage(): void {
  reportStorage(LOCAL_STORAGE, localStorage, reportObject);
  reportStorage(SESSION_STORAGE, sessionStorage, reportObject);
}

function withZapEnableSetting(fn: () => void): void {
  Browser.storage.sync.get({zapenable: false}).then((items) => {
    console.log(`ZAP withZapEnableSetting ${items.zapenable}`);
    if (items.zapenable) {
      fn();
    }
  });
}

function withZapRecordingActive(fn: () => void): void {
  Browser.storage.sync.get({zaprecordingactive: false}).then((items) => {
    console.log(`ZAP withZapRecordingActive ${items.zaprecordingactive}`);
    if (items.zaprecordingactive) {
      fn();
    }
  });
}

function reportPageUnloaded(): void {
  withZapEnableSetting(() => {
    Browser.runtime.sendMessage({
      type: REPORT_EVENT,
      data: new ReportedEvent('pageUnload').toString(),
    });
    for (const value of Object.values(reportedEvents)) {
      sendEventToZAP(value);
    }
    reportAllStorage();
  });
}

function reportEvent(event: ReportedEvent): void {
  let existingEvent: ReportedEvent;
  existingEvent = reportedEvents[event.eventName];
  if (!existingEvent) {
    existingEvent = new ReportedEvent(event.eventName);
    reportedEvents[event.eventName] = event;
    sendEventToZAP(existingEvent);
  } else if (existingEvent.url !== window.location.href) {
    // The fragment has changed - report the old one and start a new count
    sendEventToZAP(existingEvent);
    existingEvent = new ReportedEvent(event.eventName);
    reportedEvents[event.eventName] = event;
    sendEventToZAP(existingEvent);
  } else {
    // eslint-disable-next-line no-plusplus
    existingEvent.count++;
  }
}

function trackInteractableElement(re: ReportedElement, element: Element): void {
  const state = getInteractableState(element);
  re.interactable = state;

  if (!elementInteractableState.has(element)) {
    elementInteractableState.set(element, state);
    trackedElementRefs.push(new WeakRef(element));
  }
}

function reportPageForms(
  doc: Document,
  fn: (re: ReportedObject) => void
): void {
  const url = window.location.href;
  Array.prototype.forEach.call(doc.forms, (form: HTMLFormElement) => {
    const re = new ReportedElement(form, url);
    trackInteractableElement(re, form);
    fn(re);
  });
}

function reportPageLinks(
  doc: Document,
  fn: (re: ReportedObject) => void
): void {
  const url = window.location.href;
  Array.prototype.forEach.call(
    doc.links,
    (link: HTMLAnchorElement | HTMLAreaElement) => {
      const re = new ReportedElement(link, url);
      trackInteractableElement(re, link);
      fn(re);
    }
  );
}

function reportElements(
  collection: HTMLCollection,
  fn: (re: ReportedObject) => void
): void {
  const url = window.location.href;
  Array.prototype.forEach.call(collection, (element: Element) => {
    const re = new ReportedElement(element, url);
    trackInteractableElement(re, element);
    fn(re);
  });
}

function reportNodeElements(
  node: Node,
  tagName: string,
  fn: (re: ReportedObject) => void
): void {
  if (node.nodeType === Node.ELEMENT_NODE) {
    reportElements((node as Element).getElementsByTagName(tagName), fn);
  }
}

function reportPointerElements(
  source: Element | Document,
  fn: (re: ReportedObject) => void
): void {
  source.querySelectorAll('*').forEach((element) => {
    const {tagName} = element;
    const url = window.location.href;
    if (
      !INTERACTABLE_TAG_NAMES.has(tagName) &&
      element instanceof Element &&
      !hasInteractableTagAncestor(element)
    ) {
      if (hasPointerStyle(element)) {
        const re = new ReportedElement(element, url);
        trackInteractableElement(re, element);
        fn(re);
      }
    }
  });
}

function reportPageLoaded(
  doc: Document,
  fn: (re: ReportedObject) => void
): void {
  Browser.runtime.sendMessage({
    type: REPORT_EVENT,
    data: new ReportedEvent('pageLoad').toString(),
  });

  reportPageLinks(doc, fn);
  reportPageForms(doc, fn);
  reportElements(doc.getElementsByTagName('input'), fn);
  reportElements(doc.getElementsByTagName('textarea'), fn);
  reportElements(doc.getElementsByTagName('select'), fn);
  reportElements(doc.getElementsByTagName('button'), fn);
  reportPointerElements(doc, fn);
  reportStorage(LOCAL_STORAGE, localStorage, fn);
  reportStorage(SESSION_STORAGE, sessionStorage, fn);
}

const domMutated = function domMutation(
  mutationList: MutationRecord[],
  _obs: MutationObserver
): void {
  withZapEnableSetting(() => {
    reportEvent(new ReportedEvent('domMutation'));
    reportPageLinks(document, reportObject);
    reportPageForms(document, reportObject);
    reportPointerElements(document, reportObject);
    for (const mutation of mutationList) {
      if (mutation.type === 'childList') {
        reportNodeElements(mutation.target, 'input', reportObject);
        reportNodeElements(mutation.target, 'textarea', reportObject);
        reportNodeElements(mutation.target, 'select', reportObject);
        reportNodeElements(mutation.target, 'button', reportObject);
        if (mutation.target.nodeType === Node.ELEMENT_NODE) {
          reportPointerElements(mutation.target as Element, reportObject);
        }
      }
    }
  });
};

function isConfigurationRequest(): boolean {
  return window.location.href.startsWith('https://zap/zapCallBackUrl/');
}

function onLoadEventListener(): void {
  if (isConfigurationRequest()) {
    return;
  }

  withZapEnableSetting(() => {
    reportPageLoaded(document, reportObject);
  });
}

function enableExtension(): void {
  window.addEventListener('load', onLoadEventListener, false);
  window.onbeforeunload = reportPageUnloaded;

  const observer = new MutationObserver(domMutated);
  observer.observe(document, {
    attributes: false,
    childList: true,
    subtree: true,
  });

  const attributeObserver = new MutationObserver(() => {
    withZapEnableSetting(async () => {
      const pendingAnimations = document.getAnimations().map((a) => a.finished);
      if (pendingAnimations.length > 0) {
        await Promise.race([
          Promise.all(pendingAnimations),
          new Promise<void>((resolve) => {
            setTimeout(resolve, 2000);
          }),
        ]);
      }

      const alive: WeakRef<Element>[] = [];
      for (const ref of trackedElementRefs) {
        const el = ref.deref();
        if (el) {
          alive.push(ref);
          const newState = getInteractableState(el);
          const prevState = elementInteractableState.get(el);
          if (
            prevState !== undefined &&
            (prevState.visible !== newState.visible ||
              prevState.enabled !== newState.enabled ||
              prevState.pointer !== newState.pointer)
          ) {
            elementInteractableState.set(el, newState);
            const re = new ReportedElement(
              el,
              window.location.href,
              'nodeChanged'
            );
            re.interactable = newState;
            sendObjectToZAP(re);
          }
        }
      }
      trackedElementRefs = alive;
    });
  });
  attributeObserver.observe(document, {
    attributes: true,
    attributeFilter: [
      'aria-disabled',
      'aria-hidden',
      'class',
      'disabled',
      'hidden',
      'href',
      'style',
    ],
    subtree: true,
  });

  setInterval(() => {
    // Have to poll to pickup storage changes in a timely fashion
    reportAllStorage();
  }, 500);

  // This is needed for more traditional apps
  reportPageLoaded(document, reportObject);
}

function configureExtension(): void {
  if (isConfigurationRequest()) {
    // The Browser has been launched from ZAP - use this URL for configuration
    const params = new URLSearchParams(window.location.search);
    const enable =
      localStorage.getItem(LOCAL_ZAP_ENABLE) === 'true' ||
      params.has(URL_ZAP_ENABLE);
    const record =
      localStorage.getItem(LOCAL_ZAP_RECORD) === 'true' ||
      params.has(URL_ZAP_RECORD);

    console.log('ZAP Configure', enable, record);
    Browser.storage.sync.set({
      zapurl: window.location.href.split('?')[0],
      zapenable: enable,
      zaprecordingactive: record,
    });
  }
}

function injectScript(): Promise<boolean> {
  return new Promise((resolve) => {
    configureExtension();
    withZapRecordingActive(() => {
      Browser.storage.sync
        .get({initScript: false, loginUrl: '', startTime: 0})
        .then((items) => {
          console.log(
            `ZAP injectScript items ${items.initScript} ${items.loginUrl}`
          );
          recorder.recordUserInteractions(
            items.initScript === true,
            items.loginUrl as string,
            items.startTime as number
          );
        });
    });
    withZapEnableSetting(() => {
      enableExtension();
      resolve(true);
    });
    resolve(false);
  });
}

injectScript();

/* eslint-disable  @typescript-eslint/no-explicit-any */
Browser.runtime.onMessage.addListener(
  (
    message: any,
    _sender: Runtime.MessageSender,
    _sendResponse: (response?: any) => void
  ) => {
    if (message.type === ZAP_START_RECORDING) {
      configureExtension();
      recorder.recordUserInteractions();
    } else if (message.type === ZAP_STOP_RECORDING) {
      recorder.stopRecordingUserInteractions();
    }

    // Returning `true` keeps the message channel open for async responses
    return true;
  }
);

export {
  reportPageLinks,
  reportPageLoaded,
  reportPageForms,
  reportNodeElements,
  reportStorage,
  ReportedElement,
  ReportedObject,
  ReportedStorage,
  ReportedEvent,
  injectScript,
  enableExtension,
};

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
import {ElementLocator} from '../types/zestScript/ZestStatement';
import {ZAP_FLOATING_DIV} from '../utils/constants';
import {InteractableState} from '../types/ReportedModel';

const dynamicClassElements = new WeakSet<Element>();
const inputClassSnapshots = new WeakMap<Element, string>();

function markClassAsDynamic(element: Element): void {
  dynamicClassElements.add(element);
}

function snapshotInputClass(element: Element): void {
  if (!inputClassSnapshots.has(element)) {
    inputClassSnapshots.set(element, element.getAttribute('class') ?? '');
  }
}

function hasClassChangedSinceSnapshot(element: Element): boolean {
  if (!inputClassSnapshots.has(element)) return false;
  return (
    inputClassSnapshots.get(element) !== (element.getAttribute('class') ?? '')
  );
}

function isElementPathUnique(path: string, documentElement: Document): boolean {
  const elements = documentElement.querySelectorAll(path);
  return elements.length === 1;
}

function isElementXPathUnique(
  xpath: string,
  documentElement: Document
): boolean {
  const result = documentElement.evaluate(
    xpath,
    documentElement,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null
  );
  return result.snapshotLength === 1;
}

function getCSSSelector(
  element: HTMLElement,
  documentElement: Document
): string {
  let selector = element.tagName.toLowerCase();
  if (selector === 'html') {
    selector = 'body';
  } else if (element === documentElement.body) {
    selector = 'body';
  } else if (element.parentNode) {
    const parentSelector = getCSSSelector(
      element.parentNode as HTMLElement,
      documentElement
    );
    selector = `${parentSelector} > ${selector}`;
  }
  return selector;
}

function isZapDiv(node: ChildNode): boolean {
  if (node instanceof Element) {
    return (node as Element).getAttribute('id') === ZAP_FLOATING_DIV;
  }
  return false;
}

function safeXPathString(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  const parts = value
    .split("'")
    .map((part) => `'${part}'`)
    .join(`, "'", `);
  return `concat(${parts})`;
}

function getXPath(element: HTMLElement, documentElement: Document): string {
  if (!element.tagName) {
    return '';
  }

  let selector = element.tagName.toLowerCase();

  if (element.id && isElementXPathUnique(selector, documentElement)) {
    selector += `[@id=${safeXPathString(element.id)}]`;
  } else {
    let index = 1;
    let sibling = element.previousSibling;
    let isUnique = true;
    while (sibling) {
      if (
        sibling.nodeType === Node.ELEMENT_NODE &&
        sibling.nodeName === element.nodeName &&
        !isZapDiv(sibling)
      ) {
        index += 1;
        isUnique = false;
      }
      sibling = sibling.previousSibling;
    }

    if (isUnique) {
      sibling = element.nextSibling;
      while (sibling) {
        if (
          sibling.nodeType === Node.ELEMENT_NODE &&
          sibling.nodeName === element.nodeName
        ) {
          isUnique = false;
          break;
        }
        sibling = sibling.nextSibling;
      }
    }

    if (index !== 1 || !isUnique) {
      selector += `[${index}]`;
    }
  }

  if (element.parentNode) {
    const parentSelector = getXPath(
      element.parentNode as HTMLElement,
      documentElement
    );
    selector = `${parentSelector}/${selector}`;
  }
  return selector;
}

function getPath(
  element: HTMLElement,
  documentElement: Document
): ElementLocator {
  const path: ElementLocator = new ElementLocator('', '');
  if (element.id) {
    path.type = 'id';
    path.element = element.id;
  } else if (
    !dynamicClassElements.has(element) &&
    !hasClassChangedSinceSnapshot(element) &&
    element.classList.length === 1 &&
    element.classList.item(0) != null &&
    isElementPathUnique(`.${element.classList.item(0)}`, documentElement)
  ) {
    path.type = 'className';
    path.element = `${element.classList.item(0)}`;
  } else {
    const selector = getCSSSelector(element, documentElement);
    if (selector && isElementPathUnique(selector, documentElement)) {
      path.type = 'cssSelector';
      path.element = selector;
    } else {
      const xpath = getXPath(element, documentElement);
      if (xpath) {
        path.type = 'xpath';
        path.element = xpath;
      }
    }
  }

  return path;
}

function hasPointerStyle(el: Element): boolean {
  const compStyles = window.getComputedStyle(el, 'hover');
  return compStyles.getPropertyValue('cursor') === 'pointer';
}

function isHiddenByParent(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node) {
    const nodeStyle = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (
      nodeStyle?.display === 'none' ||
      nodeStyle?.opacity === '0' ||
      (nodeStyle as CSSStyleDeclaration & {contentVisibility?: string})
        ?.contentVisibility === 'hidden'
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function getInteractableState(el: Element): InteractableState {
  if (!(el instanceof HTMLElement)) {
    return {visible: false, enabled: false, pointer: false};
  }

  const enabled =
    !(el as HTMLElement & {disabled?: boolean}).disabled &&
    el.getAttribute('aria-disabled') !== 'true';

  const s = window.getComputedStyle(el);
  const visible =
    el.getAttribute('aria-hidden') !== 'true' &&
    s.display !== 'none' &&
    s.visibility !== 'hidden' &&
    s.visibility !== 'collapse' &&
    s.opacity !== '0' &&
    (el.offsetWidth > 0 || el.offsetHeight > 0) &&
    !isHiddenByParent(el);
  const pointer = hasPointerStyle(el);

  return {visible, enabled, pointer};
}

export {
  getPath,
  hasPointerStyle,
  getInteractableState,
  markClassAsDynamic,
  safeXPathString,
  snapshotInputClass,
};

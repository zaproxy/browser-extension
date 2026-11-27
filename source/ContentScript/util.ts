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

type Root = Document | ShadowRoot;

// Do not use instanceof, it does not work with nodes of other frames.
function isDocument(node: Node): node is Document {
  return node.nodeType === Node.DOCUMENT_NODE;
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in node;
}

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

function isElementPathUnique(path: string, documentElement: Root): boolean {
  try {
    return documentElement.querySelectorAll(path).length === 1;
  } catch {
    // Not a valid selector (e.g. a class name with special characters).
    return false;
  }
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

function getFormAbsoluteXPath(
  form: HTMLElement,
  documentElement: Document
): string {
  const {name} = form as HTMLFormElement;
  if (name) {
    const nameXPath = `//form[@name=${safeXPathString(name)}]`;
    if (isElementXPathUnique(nameXPath, documentElement)) {
      return nameXPath;
    }
  }

  const forms = documentElement.getElementsByTagName('form');
  let index = 1;
  for (let i = 0; i < forms.length; i += 1) {
    if (forms[i] === form) {
      index = i + 1;
      break;
    }
  }
  return `//form[${index}]`;
}

function isStableClass(element: Element): boolean {
  return (
    !dynamicClassElements.has(element) && !hasClassChangedSinceSnapshot(element)
  );
}

function isUniqueClassName(
  element: HTMLElement,
  documentElement: Document
): boolean {
  return (
    element.classList.length === 1 &&
    element.classList.item(0) != null &&
    isStableClass(element) &&
    isElementPathUnique(`.${element.classList.item(0)}`, documentElement)
  );
}

function buildFullXPath(
  element: HTMLElement,
  documentElement: Document
): string {
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
    const parentSelector = buildFullXPath(
      element.parentNode as HTMLElement,
      documentElement
    );
    selector = `${parentSelector}/${selector}`;
  }
  return selector;
}

function getXPath(element: HTMLElement, documentElement: Document): string {
  if (!element.tagName) {
    return '';
  }

  const tag = element.tagName;

  if (tag === 'A') {
    const text = element.textContent;
    if (text) {
      const textXPath = `//a[text()=${safeXPathString(text)}]`;
      if (isElementXPathUnique(textXPath, documentElement)) {
        return textXPath;
      }
    }
  }

  return buildFullXPath(element, documentElement);
}

function getLocator(
  element: HTMLElement,
  documentElement: Document
): ElementLocator {
  const path: ElementLocator = new ElementLocator('', '');

  if (element.tagName === 'FORM') {
    path.type = 'xpath';
    path.element = getFormAbsoluteXPath(element, documentElement);
    return path;
  }

  const labelable = element as HTMLInputElement;
  if (labelable.labels?.length) {
    const firstLabel = labelable.labels[0] as HTMLLabelElement;
    const text = firstLabel.textContent;
    if (text) {
      const tag = element.tagName.toLowerCase();
      const labelXPath = `//${tag}[@id=//label[text()=${safeXPathString(text)}]/@for]`;
      if (isElementXPathUnique(labelXPath, documentElement)) {
        path.type = 'xpath';
        path.element = labelXPath;
        return path;
      }
    }
  }

  if (element.id) {
    path.type = 'id';
    path.element = element.id;
  } else if (isUniqueClassName(element, documentElement)) {
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

/** Gets a selector, by id or class, that is unique in the root, if there is one. */
function getUniqueRootSelector(element: Element, root: Root): string | null {
  if (element.id) {
    const idSelector = `#${CSS.escape(element.id)}`;
    if (isElementPathUnique(idSelector, root)) {
      return idSelector;
    }
  }
  if (element.classList.length === 1 && isStableClass(element)) {
    const classSelector = `.${CSS.escape(element.classList.item(0) as string)}`;
    if (isElementPathUnique(classSelector, root)) {
      return classSelector;
    }
  }
  return null;
}

function isFirstMatch(selector: string, element: Element, root: Root): boolean {
  try {
    // The first match is the one used when replaying.
    return root.querySelector(selector) === element;
  } catch {
    return false;
  }
}

/** The type selector of the element, the case matters for non HTML elements (e.g. SVG). */
function getTypeSelector(element: Element): string {
  return CSS.escape(element.localName);
}

function getNthOfType(element: Element): string {
  let index = 1;
  let sibling = element.previousElementSibling;
  while (sibling) {
    if (
      sibling.localName === element.localName &&
      sibling.namespaceURI === element.namespaceURI
    ) {
      index += 1;
    }
    sibling = sibling.previousElementSibling;
  }
  return `${getTypeSelector(element)}:nth-of-type(${index})`;
}

/**
 * Gets a CSS selector of the element, relative to the given root (document or shadow root), that
 * finds it as the first match.
 */
function getRootCssSelector(element: Element, root: Root): string {
  const unique = getUniqueRootSelector(element, root);
  if (unique) {
    return unique;
  }
  const parts: string[] = [];
  const anchored: string[] = [];
  let current: Element | null = element;
  while (current) {
    parts.unshift(getNthOfType(current));
    current = current.parentNode === root ? null : current.parentElement;
    const anchor: string | null = current
      ? getUniqueRootSelector(current, root)
      : null;
    if (anchor) {
      anchored.push(`${anchor} > ${parts.join(' > ')}`);
    }
  }
  const full = parts.join(' > ');
  // The chain alone is not anchored to the root, it might match other elements first.
  const candidates = [full, ...anchored];
  if (isShadowRoot(root)) {
    // The top level elements of a shadow root are the only ones without a parent element.
    candidates.push([`${parts[0]}:not(* > *)`, ...parts.slice(1)].join(' > '));
  }
  const selector = candidates.find((candidate) =>
    isFirstMatch(candidate, element, root)
  );
  if (!selector) {
    console.warn('ZAP Failed to find a selector for the element', element);
    return full;
  }
  return selector;
}

/**
 * Gets the locator of the given element, if it's in a shadow root the locator is a CSS selector
 * relative to that root and the CSS selectors of the (open or closed) hosts are in the shadow path.
 */
function getPath(
  element: HTMLElement,
  documentElement: Document | ShadowRoot
): ElementLocator {
  const root = element.getRootNode();
  if (isDocument(root)) {
    // The element might be slotted into the given shadow root, locate it in its own document.
    return getLocator(element, root);
  }
  if (!isShadowRoot(root)) {
    // Not connected.
    return getLocator(
      element,
      isDocument(documentElement) ? documentElement : element.ownerDocument
    );
  }

  const hosts: string[] = [];
  let current: Node = root;
  while (isShadowRoot(current)) {
    const {host} = current;
    const hostRoot = host.getRootNode() as Root;
    hosts.unshift(getRootCssSelector(host, hostRoot));
    current = hostRoot;
  }
  return new ElementLocator(
    'cssSelector',
    getRootCssSelector(element, root),
    hosts
  );
}

/**
 * Gets the shadow root of the given element, including closed ones (extension APIs only).
 */
function getShadowRoot(element: Element): ShadowRoot | null {
  // Firefox.
  if ('openOrClosedShadowRoot' in element) {
    return (
      (element as Element & {openOrClosedShadowRoot: ShadowRoot | null})
        .openOrClosedShadowRoot ?? null
    );
  }
  // Chrome and Edge.
  const dom = (
    globalThis as unknown as {
      chrome?: {
        dom?: {openOrClosedShadowRoot?: (e: Element) => ShadowRoot};
      };
    }
  ).chrome?.dom;
  if (dom?.openOrClosedShadowRoot) {
    return dom.openOrClosedShadowRoot(element) ?? null;
  }
  return element.shadowRoot;
}

const INTERACTABLE_TAG_NAMES = new Set([
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'BUTTON',
  'A',
]);

function hasInteractableTagAncestor(el: Element): boolean {
  let parent = el.parentElement;
  let depth = 0;
  // Do not traverse the whole tree.
  while (parent && depth < 15) {
    if (INTERACTABLE_TAG_NAMES.has(parent.tagName)) {
      return true;
    }
    parent = parent.parentElement;
    depth += 1;
  }
  return false;
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
  getShadowRoot,
  isShadowRoot,
  hasPointerStyle,
  getInteractableState,
  hasInteractableTagAncestor,
  INTERACTABLE_TAG_NAMES,
  markClassAsDynamic,
  safeXPathString,
  snapshotInputClass,
};

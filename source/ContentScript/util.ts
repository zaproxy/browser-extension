import {ElementLocator} from '../types/zestScript/ZestStatement';

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

function getXPath(element: HTMLElement, documentElement: Document): string {
  if (!element.tagName) {
    return '';
  }

  let selector = element.tagName.toLowerCase();

  if (element.id && isElementXPathUnique(selector, documentElement)) {
    selector += `[@id="${element.id}"]`;
  } else {
    let index = 1;
    let sibling = element.previousSibling;
    let isUnique = true;
    while (sibling) {
      if (
        sibling.nodeType === Node.ELEMENT_NODE &&
        sibling.nodeName === element.nodeName
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
      if (xpath && isElementXPathUnique(xpath, documentElement)) {
        path.type = 'xpath';
        path.element = xpath;
      }
    }
  }

  return path;
}

export {getPath};

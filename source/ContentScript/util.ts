type ElementPath = {
    type : string, 
    path : string
}

function getPath(element: HTMLElement , documentElement: Document) : ElementPath {
    let path : ElementPath = { type : "", path : ""};
    console.log("inside getPath", element)
    // Try to identify the element using ID
    if (element.id) {
      path.type = "id"
      path.path = element.id;
    }
  
    // If ID is not present, try to identify the element using class
    if (path.type === "" && element.classList.length === 1 && element.classList.item(0) != null) {
      if(isElementPathUnique("." + element.classList.item(0), documentElement)){
          path.type = "className"
          path.path = "" + element.classList.item(0);
      }
    }
  
    // If class is not present, try to identify the element using CSS selector
    if (path.type === "") {
      let selector = getCSSSelector(element, documentElement);
      if (selector && isElementPathUnique(selector, documentElement)) {
        path.type = "cssSelector";
        path.path = selector;
      }
    }
  
    // If CSS selector is not present, try to identify the element using XPath
    if (path.type === "") {
      let xpath = getXPath(element,documentElement);
      if (xpath && isElementXPathUnique(xpath, documentElement)) {
        path.type = "xpath";
        path.path = xpath;
      }
    }

    return path;
}


function getCSSSelector(element: HTMLElement, documentElement: Document): string {
  let selector = element.tagName.toLowerCase();
  if(selector == 'html'){
    selector = "body";
  }
  else if (element === documentElement.body) {
    selector = "body";
  } else if (element.parentNode) {
    let parentSelector = getCSSSelector(element.parentNode as HTMLElement, documentElement);
    selector = parentSelector + " > " + selector;
  }
  return selector;
}


function getXPath(element: HTMLElement, documentElement: Document): string {
  if (!(element instanceof Element)) {
    return "";
  }

  let selector = element.tagName.toLowerCase();

  if (element.id && isElementXPathUnique(selector, documentElement)) {
    selector += '[@id="' + element.id + '"]';
  } else {
    let index = 1;
    let sibling = element.previousSibling;
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === element.nodeName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }
    selector += "[" + index + "]";
  }

  if (element.parentNode) {
    let parentSelector = getXPath(element.parentNode as HTMLElement, documentElement);
    selector = parentSelector + "/" + selector;
  }
  return selector;
}

function isElementPathUnique(path : string, documentElement: Document) {
  const elements = documentElement.querySelectorAll(path);
  return elements.length === 1;
}

function isElementXPathUnique(xpath : string, documentElement: Document) {
  const result = documentElement.evaluate(xpath, documentElement, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  return result.snapshotLength === 1;
}

export {getPath}; 
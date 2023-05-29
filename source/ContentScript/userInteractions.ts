let previousDOMState: string;
let curLevel = -1;
let curFrame = 0;

function recordUserInteractions() {
  console.log("user interactions");
  previousDOMState = document.documentElement.outerHTML;
  addListenersToDocument(document, -1, 0);
}

function stopRecordingUserInteractions() {
  console.log("Stopping recording user interactions ...");
  previousDOMState = document.documentElement.outerHTML;
  removeListenersFromDocument(document);
}

function addListenersToDocument(element: Document, level: number, frame: number) {
  element.addEventListener("click", handleClick);
  element.addEventListener("scroll", handleScroll);
  element.addEventListener("mouseover", handleMouseOver);
  element.addEventListener("change", handleChange);

  // Add listeners to all the frames
  const frames = element.querySelectorAll("frame, iframe");
  let i = 0;
  frames.forEach(frame => {
    const frameDocument = (frame as HTMLIFrameElement | HTMLObjectElement).contentWindow?.document;
    if (frameDocument != null) {
      addListenersToDocument(frameDocument, level + 1, i);
      i += 1;
    }
  });
}

function removeListenersFromDocument(element: Document) {
  element.removeEventListener("click", handleClick);
  element.removeEventListener("scroll", handleScroll);
  element.removeEventListener("mouseover", handleMouseOver);
  element.removeEventListener("change", handleChange);

  const frames = element.querySelectorAll("frame, iframe");
  frames.forEach(frame => {
    const frameDocument = (frame as HTMLIFrameElement | HTMLObjectElement).contentWindow?.document;
    if (frameDocument != null) {
      removeListenersFromDocument(frameDocument);
    }
  });
}

function handleClick(event: Event) {
  handleFrameSwitches(curLevel, curFrame);
  console.log(event);
  // click on target element
}

function handleScroll(event: Event) {
  handleFrameSwitches(curLevel, curFrame);
  console.log(event, "scrolling..");
  // scroll the nearest ancestor with scrolling ability
}

function handleMouseOver(event: Event) {
  const currentDOMState = document.documentElement.outerHTML;
  if (currentDOMState === previousDOMState) {
    return;
  }
  previousDOMState = currentDOMState;
  handleFrameSwitches(curLevel, curFrame);
  console.log(event, "MouseOver");
  // send mouseover event
}

function handleChange(event: Event) {
  handleFrameSwitches(curLevel, curFrame);
  console.log(event, "change", (event.target as HTMLInputElement).value);
  // send keys to the element
}

function handleFrameSwitches(level: number, frame: number) {
  if (curLevel === level && curFrame === frame) {
    // do nothing
    return;
  } else if (curLevel > level) {
    while (curLevel > level) {
      // switch to parent frame
      console.log("Switch to parent Frame", "Frame:", frame, "level:", level);
      curLevel -= 1;
    }
    curFrame = frame;
    console.log("Frame switches", "Frame:", frame, "level:", level);
  } else {
    // switch to frame number 'frame'
    curLevel += 1;
    curFrame = frame;
    console.log("Frame switches", "Frame:", frame, "level:", level);
  }
}

export { recordUserInteractions, stopRecordingUserInteractions };

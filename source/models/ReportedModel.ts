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
      text: string | null
    ) {
      this.timestamp = Date.now();
      this.type = type;
      this.tagName = tagName;
      this.id = id;
      this.nodeName = nodeName;
      this.text = text;
      this.url = window.location.href;
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
        if (k === 'xpath' || k === 'url' || k === 'href' || k === 'timestamp') {
          // Storage events are not time or URL specific
          return undefined;
        }
        return v;
      });
    }
  }
  
  class ReportedElement extends ReportedObject {
    public constructor(element: Element) {
      super(
        'nodeAdded',
        element.tagName,
        element.id,
        element.nodeName,
        element.textContent
      );
      if (element.tagName === 'A') {
        // This gets the full URL rather than a relative one
        const a: HTMLAnchorElement = element as HTMLAnchorElement;
        this.href = a.toString();
      } else if (element.hasAttribute('href')) {
        this.href = element.getAttribute('href');
      }
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

  export {
    ReportedElement,
    ReportedObject,
    ReportedStorage,
    ReportedEvent
  };
  
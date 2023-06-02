class ElementLocator {
  type: string;

  path: string;

  constructor(type: string, path: string) {
    this.type = type;
    this.path = path;
  }

  toJSON(): {type: string; path: string} {
    return {
      type: this.type,
      path: this.path,
    };
  }
}

class ZestStatement {
  index: number; 
  elementType: string;

  constructor(elementType: string) {
    this.elementType = elementType;
  }

  toJSON(): {elementType: string; elementLocator?: {type: string; path: string}} {
    return {
      elementType: this.elementType,
    };
  }
}

class ZestStatementElement extends ZestStatement{

  elementLocator?: ElementLocator;
  windowHandle: string;

  constructor(elementType: string, elementLocator?: ElementLocator) {
    super(elementType);
    this.elementLocator = elementLocator;
  }
}

/*
    {
      "windowHandle": "stu",
      "type": "cssselector",
      "element": "html",
      "index": 4,
      "enabled": true,
      "elementType": "ZestClientElementClick"
    }
*/

class ZestStatementElementClick extends ZestStatementElement {
  constructor(elementLocator: ElementLocator) {
    super('zestClickElement', elementLocator);
  }
  toJSON(): any {
    return {
      windowHandle: this.windowHandle,
      ...this.elementLocator?.toJSON(),
      index: this.index,
      enabled: true, 
      elementType: this.elementType,
    };
  }
}

/*
    {
      "value": "djf",
      "windowHandle": "stu",
      "type": "cssselector",
      "element": "html",
      "index": 5,
      "enabled": true,
      "elementType": "ZestClientElementSendKeys"
    }
*/

class ZestStatementElementSendKeys extends ZestStatementElement {
  keys: string;

  constructor(elementLocator: ElementLocator, keys: string) {
    super('zestSendKeys', elementLocator);
    this.keys = keys;
  }

  toJSON(): any{
    return {
      value: this.keys, 
      windowHandle: this.windowHandle,
      elementLocator: this.elementLocator?.toJSON(),
      index: this.index,
      enabled: true,
      elementType: this.elementType,
    };
  }
}


class ZestStatementSwichToFrame extends ZestStatement {
  frameIndex: number;

  constructor(frameIndex: number) {
    super('zestSwitchToFrame');
    this.frameIndex = frameIndex;
  }

  toJSON(): {elementType: string; frameIndex: number} {
    return {
      elementType: this.elementType,
      frameIndex: this.frameIndex,
    };
  }
}


class ZestStatementElementMouseOver extends ZestStatementElement {
  constructor(elementLocator: ElementLocator) {
    super('zestMouseOverElement', elementLocator);
  }
}

export {
  ElementLocator,
  ZestStatementElementMouseOver,
  ZestStatementElementClick,
  ZestStatementSwichToFrame,
  ZestStatementElementSendKeys
};

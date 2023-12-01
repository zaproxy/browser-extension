/**
 * @jest-environment jsdom
 */
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
import {TextEncoder, TextDecoder} from 'util';
import * as src from '../../source/ContentScript/index';
import {ZestScript} from '../../source/types/zestScript/ZestScript';
import {getPath} from '../../source/ContentScript/util';
import {
  ElementLocator,
  ZestStatementElementClick,
  ZestStatementElementSendKeys,
  ZestStatementSwitchToFrame,
} from '../../source/types/zestScript/ZestStatement';

jest.mock('webextension-polyfill');

// These lines must appear before the JSDOM import
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;

// eslint-disable-next-line import/order,import/first
import {JSDOM} from 'jsdom';

test('ReportedObject toString as expected', () => {
  // Given / When
  const ro: src.ReportedObject = new src.ReportedObject(
    'a',
    'b',
    'c',
    'd',
    'e',
    'http://localhost/'
  );

  // Then
  expect(ro.toNonTimestampString()).toBe(
    '{"type":"a","tagName":"b","id":"c","nodeName":"d","url":"http://localhost/","text":"e"}'
  );
});

test('ReportedElement P toString as expected', () => {
  // Given / When
  const el: Element = document.createElement('p');
  const ro: src.ReportedElement = new src.ReportedElement(
    el,
    'http://localhost/'
  );

  // Then
  expect(ro.toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"P","id":"","nodeName":"P","url":"http://localhost/","text":""}'
  );
});

test('ReportedElement A toString as expected', () => {
  // Given / When
  const a: Element = document.createElement('a');
  const linkText = document.createTextNode('Title');
  a.appendChild(linkText);
  a.setAttribute('href', 'https://example.com');
  const ro: src.ReportedElement = new src.ReportedElement(
    a,
    'http://localhost/'
  );

  // Then
  expect(ro.toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"A","id":"","nodeName":"A","url":"http://localhost/","href":"https://example.com/","text":"Title"}'
  );
});

test('Report no document links', () => {
  // Given
  const dom: JSDOM = new JSDOM(
    '<!DOCTYPE html><body><p id="main">No links</p></body>'
  );
  const mockFn = jest.fn();

  // When
  src.reportPageLinks(dom.window.document, mockFn);

  // Then
  expect(mockFn.mock.calls.length).toBe(0);
});

test('Report standard page links', () => {
  // Given
  const dom: JSDOM = new JSDOM(
    '<!DOCTYPE html><body><a href="https://www.example.com/1">link1</a><a href="https://www.example.com/2">link2</a></body>'
  );
  const mockFn = jest.fn();

  // When
  src.reportPageLinks(dom.window.document, mockFn);

  // Then
  expect(mockFn.mock.calls.length).toBe(2);
  expect(mockFn.mock.calls[0][0].toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"A","id":"","nodeName":"A","url":"http://localhost/","href":"https://www.example.com/1","text":"link1"}'
  );
  expect(mockFn.mock.calls[1][0].toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"A","id":"","nodeName":"A","url":"http://localhost/","href":"https://www.example.com/2","text":"link2"}'
  );
});

test('Report area page links', () => {
  // Given
  const dom: JSDOM = new JSDOM(
    '<!DOCTYPE html><body><map><area href="https://www.example.com/1"><area href="https://www.example.com/2"></map></body>'
  );
  const mockFn = jest.fn();

  // When
  src.reportPageLinks(dom.window.document, mockFn);

  // Then
  expect(mockFn.mock.calls.length).toBe(2);
  expect(mockFn.mock.calls[0][0].toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"AREA","id":"","nodeName":"AREA","url":"http://localhost/","href":"https://www.example.com/1","text":""}'
  );
  expect(mockFn.mock.calls[1][0].toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"AREA","id":"","nodeName":"AREA","url":"http://localhost/","href":"https://www.example.com/2","text":""}'
  );
});

test('Report no document forms', () => {
  // Given
  const dom: JSDOM = new JSDOM(
    '<!DOCTYPE html><body><p id="main">No links</p></body>'
  );
  const mockFn = jest.fn();

  // When
  src.reportPageForms(dom.window.document, mockFn);

  // Then
  expect(mockFn.mock.calls.length).toBe(0);
});

test('Report page forms', () => {
  // Given
  const dom: JSDOM = new JSDOM(
    '<!DOCTYPE html><body><form id="form1">Content1</form><form id="form2">Content2</form></body>'
  );
  const mockFn = jest.fn();

  // When
  src.reportPageForms(dom.window.document, mockFn);

  // Then
  expect(mockFn.mock.calls.length).toBe(2);
  expect(mockFn.mock.calls[0][0].toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"FORM","id":"form1","nodeName":"FORM","url":"http://localhost/","text":"Content1"}'
  );
  expect(mockFn.mock.calls[1][0].toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"FORM","id":"form2","nodeName":"FORM","url":"http://localhost/","text":"Content2"}'
  );
});

test('Report node elements', () => {
  // Given
  const form: Element = document.createElement('form');
  const i1: Element = document.createElement('input');
  i1.setAttribute('id', 'input1');
  const i2: Element = document.createElement('input');
  i2.setAttribute('id', 'input2');
  // This should not be reported as we're just looking for input elements'
  const b1: Element = document.createElement('button');
  b1.setAttribute('id', 'button');

  form.appendChild(i1);
  form.appendChild(b1);
  form.appendChild(i2);

  // node.id = '';
  const mockFn = jest.fn();

  // When
  src.reportNodeElements(form, 'input', mockFn);

  // Then
  expect(mockFn.mock.calls.length).toBe(2);
  expect(mockFn.mock.calls[0][0].toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"INPUT","id":"input1","nodeName":"INPUT","url":"http://localhost/","text":"","tagType":"text","formId":-1}'
  );
  expect(mockFn.mock.calls[1][0].toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"INPUT","id":"input2","nodeName":"INPUT","url":"http://localhost/","text":"","tagType":"text","formId":-1}'
  );
});

test('Report storage', () => {
  // Given
  // localStorage is mocked by Jest
  localStorage.setItem('item1', 'value1');
  localStorage.setItem('item2', 'value2');
  localStorage.setItem('item3', 'value3');
  const mockFn = jest.fn();

  // When
  src.reportStorage('localStorage', localStorage, mockFn);

  // Then
  expect(mockFn.mock.calls.length).toBe(3);
  expect(mockFn.mock.calls[0][0].toNonTimestampString()).toBe(
    '{"type":"localStorage","tagName":"","id":"item1","nodeName":"","url":"http://localhost/","text":"value1"}'
  );
  expect(mockFn.mock.calls[1][0].toNonTimestampString()).toBe(
    '{"type":"localStorage","tagName":"","id":"item2","nodeName":"","url":"http://localhost/","text":"value2"}'
  );
  expect(mockFn.mock.calls[2][0].toNonTimestampString()).toBe(
    '{"type":"localStorage","tagName":"","id":"item3","nodeName":"","url":"http://localhost/","text":"value3"}'
  );

  // Tidy
  localStorage.removeItem('item1');
  localStorage.removeItem('item2');
  localStorage.removeItem('item3');
});

test('Reported page loaded', () => {
  // Given
  const dom: JSDOM = new JSDOM(
    '<!DOCTYPE html><body>' +
      '<a href="https://www.example.com/1">link1</a>' +
      '<form id="form1">FormContent</form>' +
      '<button id="button1">Button</button>' +
      '<input id="input1" value="default"/>' +
      '<area href="https://www.example.com/1">' +
      '<input id="submit" type="submit" value="Submit"/>'
  );
  const mockFn = jest.fn();
  localStorage.setItem('lsKey', 'value1');
  sessionStorage.setItem('ssKey', 'value2');

  // When
  src.reportPageLoaded(dom.window.document, mockFn);

  // Then
  expect(mockFn.mock.calls.length).toBe(8);
  expect(mockFn.mock.calls[0][0].toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"A","id":"","nodeName":"A","url":"http://localhost/","href":"https://www.example.com/1","text":"link1"}'
  );
  expect(mockFn.mock.calls[1][0].toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"AREA","id":"","nodeName":"AREA","url":"http://localhost/","href":"https://www.example.com/1","text":""}'
  );
  expect(mockFn.mock.calls[2][0].toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"FORM","id":"form1","nodeName":"FORM","url":"http://localhost/","text":"FormContent"}'
  );
  expect(mockFn.mock.calls[3][0].toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"INPUT","id":"input1","nodeName":"INPUT","url":"http://localhost/","text":"default","tagType":"text"}'
  );
  expect(mockFn.mock.calls[4][0].toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"INPUT","id":"submit","nodeName":"INPUT","url":"http://localhost/","text":"Submit","tagType":"submit"}'
  );
  expect(mockFn.mock.calls[5][0].toNonTimestampString()).toBe(
    '{"type":"nodeAdded","tagName":"BUTTON","id":"button1","nodeName":"BUTTON","url":"http://localhost/","text":"Button"}'
  );
  expect(mockFn.mock.calls[6][0].toNonTimestampString()).toBe(
    '{"type":"localStorage","tagName":"","id":"lsKey","nodeName":"","url":"http://localhost/","text":"value1"}'
  );
  expect(mockFn.mock.calls[7][0].toNonTimestampString()).toBe(
    '{"type":"sessionStorage","tagName":"","id":"ssKey","nodeName":"","url":"http://localhost/","text":"value2"}'
  );

  // Tidy
  localStorage.removeItem('lsKey');
  sessionStorage.removeItem('ssKey');
});

test('Should Disable The Extension', async () => {
  // Given / When
  const actualOutcome = await src.injectScript();
  // Then
  expect(actualOutcome).toBe(false);
});

test('should generate valid script', () => {
  const script = new ZestScript('recordedScript');
  const expectedOutcome = `{
  "about": "This is a Zest script. For more details about Zest visit https://github.com/zaproxy/zest/",
  "zestVersion": "0.3",
  "title": "recordedScript",
  "description": "",
  "prefix": "",
  "type": "StandAlone",
  "parameters": {
    "tokenStart": "{{",
    "tokenEnd": "}}",
    "tokens": {},
    "elementType": "ZestVariables"
  },
  "statements": [],
  "authentication": [],
  "index": 0,
  "enabled": true,
  "elementType": "ZestScript"
}`;
  expect(script.toJSON()).toBe(expectedOutcome);
});

test('should generate valid click statement', () => {
  const elementLocator = new ElementLocator('id', 'test');
  const zestStatementElementClick = new ZestStatementElementClick(
    elementLocator
  );

  expect(zestStatementElementClick.toJSON()).toBe(
    '{"windowHandle":"windowHandle1","type":"id","element":"test","index":-1,"enabled":true,"elementType":"ZestClientElementClick"}'
  );
});

test('should generate valid send keys statement', () => {
  const elementLocator = new ElementLocator('id', 'test');
  const zestStatementElementSendKeys = new ZestStatementElementSendKeys(
    elementLocator,
    'testvalue'
  );

  expect(zestStatementElementSendKeys.toJSON()).toBe(
    '{"value":"testvalue","windowHandle":"windowHandle1","type":"id","element":"test","index":-1,"enabled":true,"elementType":"ZestClientElementSendKeys"}'
  );
});

test('should add zest statement to zest script', () => {
  const script = new ZestScript('recordedScript');
  const elementLocator = new ElementLocator('id', 'test');
  const zestStatementElementClick = new ZestStatementElementClick(
    elementLocator
  );
  script.addStatement(zestStatementElementClick.toJSON());
  const expectedOutcome = `{
  "about": "This is a Zest script. For more details about Zest visit https://github.com/zaproxy/zest/",
  "zestVersion": "0.3",
  "title": "recordedScript",
  "description": "",
  "prefix": "",
  "type": "StandAlone",
  "parameters": {
    "tokenStart": "{{",
    "tokenEnd": "}}",
    "tokens": {},
    "elementType": "ZestVariables"
  },
  "statements": [
    {
      "windowHandle": "windowHandle1",
      "type": "id",
      "element": "test",
      "index": 1,
      "enabled": true,
      "elementType": "ZestClientElementClick"
    }
  ],
  "authentication": [],
  "index": 0,
  "enabled": true,
  "elementType": "ZestScript"
}`;
  expect(script.toJSON()).toBe(expectedOutcome);
});

test('should reset zest script', () => {
  const script = new ZestScript('recordedScript');
  const elementLocator = new ElementLocator('id', 'test');
  const zestStatementElementClick = new ZestStatementElementClick(
    elementLocator
  );
  script.addStatement(zestStatementElementClick.toJSON());
  script.reset();
  const expectedOutcome = `{
  "about": "This is a Zest script. For more details about Zest visit https://github.com/zaproxy/zest/",
  "zestVersion": "0.3",
  "title": "recordedScript",
  "description": "",
  "prefix": "",
  "type": "StandAlone",
  "parameters": {
    "tokenStart": "{{",
    "tokenEnd": "}}",
    "tokens": {},
    "elementType": "ZestVariables"
  },
  "statements": [],
  "authentication": [],
  "index": 0,
  "enabled": true,
  "elementType": "ZestScript"
}`;
  expect(script.toJSON()).toBe(expectedOutcome);
});

test('should return correct path for element with id', () => {
  // Given
  const dom: JSDOM = new JSDOM(
    '<!DOCTYPE html><body><div id="myElement"></div></body>'
  );
  const element = dom.window.document.getElementById('myElement');

  // When
  const path = getPath(element as HTMLElement, dom.window.document);

  // Then
  expect(path.type).toBe('id');
  expect(path.element).toBe('myElement');
});

test('should return correct path for element with unique class', () => {
  // Given
  const dom: JSDOM = new JSDOM(
    '<!DOCTYPE html><body><div class="myClass"></div></body>'
  );
  const element = dom.window.document.querySelector('.myClass');

  // When
  const path = getPath(element as HTMLElement, dom.window.document);

  // Then
  expect(path.type).toBe('className');
  expect(path.element).toBe('myClass');
});

test('should return correct path for element with CSS selector', () => {
  // Given
  const dom: JSDOM = new JSDOM(
    '<!DOCTYPE html><body><div><span><button></button></span></div></body>'
  );
  const element = dom.window.document.getElementsByTagName('button')[0];

  // When
  const path = getPath(element as HTMLElement, dom.window.document);

  // Then
  expect(path.type).toBe('cssSelector');
  expect(path.element).toBe('body > div > span > button');
});

test('should return correct path for element with XPath', () => {
  // Given
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><div><button class="btn">Test</button><button class="btn">Another Test</button></div></body></html>'
  );
  const element = dom.window.document.getElementsByClassName('btn');

  // When
  const path1 = getPath(element[0] as HTMLElement, dom.window.document);
  const path2 = getPath(element[1] as HTMLElement, dom.window.document);

  // Then
  expect(path1.type).toBe('xpath');
  expect(path1.element).toBe('/html/body/div/button[1]');
  expect(path2.type).toBe('xpath');
  expect(path2.element).toBe('/html/body/div/button[2]');
});

test('should generate valid frame switch statement', () => {
  const zestStatementSwitchToFrame = new ZestStatementSwitchToFrame(
    0,
    'testvalue'
  );

  expect(zestStatementSwitchToFrame.toJSON()).toBe(
    '{"windowHandle":"windowHandle1","frameIndex":0,"frameName":"testvalue","parent":false,"index":-1,"enabled":true,"elementType":"ZestClientSwitchToFrame"}'
  );
});

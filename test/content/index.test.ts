/**
 * @jest-environment jsdom
 */

import { ReportedObject, ReportedElement, reportPageLinks } from "../../src/content/index";
// These lines must appear before the JSDOM import
import { TextEncoder, TextDecoder } from 'util'
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder
import { JSDOM } from "jsdom";

test('ReportedObject toString as expected', () => {
	let ro: ReportedObject = new ReportedObject("a", "b", "c", "d");
	expect(ro.toString()).toBe('{"tagName":"a","id":"b","nodeName":"c","text":"d","url":"http://localhost/"}');
});

test('ReportedElement P toString as expected', () => {
	let el: Element = document.createElement("p");
	let ro: ReportedElement = new ReportedElement(el);
	expect(ro.toString()).toBe('{"tagName":"P","id":"","nodeName":"P","text":"","url":"http://localhost/"}');
});

test('ReportedElement A toString as expected', () => {
	let a: Element = document.createElement("a");
	let linkText = document.createTextNode("Title");
	a.appendChild(linkText);
	a.setAttribute('href', 'https://example.com');

	let ro: ReportedElement = new ReportedElement(a);
	expect(ro.toString()).toBe(
		'{"tagName":"A","id":"","nodeName":"A","text":"Title","url":"http://localhost/","href":"https://example.com/"}');
});

test('Report no document links', () => {
	let dom: JSDOM = new JSDOM('<!DOCTYPE html><body><p id="main">No links</p></body>');
	let mockFn = jest.fn();

	reportPageLinks(dom.window.document, mockFn);

	expect(mockFn.mock.calls.length).toBe(0);
});

test('Report standard document links', () => {
	let dom: JSDOM = new JSDOM(
		'<!DOCTYPE html><body><a href="https://www.example.com/1">link1</a><a href="https://www.example.com/2">link2</a></body>');
	let mockFn = jest.fn();

	reportPageLinks(dom.window.document, mockFn);

	expect(mockFn.mock.calls.length).toBe(2);
	expect(mockFn.mock.calls[0][0].toString()).toBe(
		'{"tagName":"A","id":"","nodeName":"A","text":"link1","url":"http://localhost/","href":"https://www.example.com/1"}');
	expect(mockFn.mock.calls[1][0].toString()).toBe(
		'{"tagName":"A","id":"","nodeName":"A","text":"link2","url":"http://localhost/","href":"https://www.example.com/2"}');
});

test('Report area document links', () => {
	let dom: JSDOM = new JSDOM(
		'<!DOCTYPE html><body><map><area href="https://www.example.com/1"><area href="https://www.example.com/2"></map></body>');
	let mockFn = jest.fn();

	reportPageLinks(dom.window.document, mockFn);

	expect(mockFn.mock.calls.length).toBe(2);
	expect(mockFn.mock.calls[0][0].toString()).toBe(
		'{"tagName":"AREA","id":"","nodeName":"AREA","text":"","url":"http://localhost/","href":"https://www.example.com/1"}');
	expect(mockFn.mock.calls[1][0].toString()).toBe(
		'{"tagName":"AREA","id":"","nodeName":"AREA","text":"","url":"http://localhost/","href":"https://www.example.com/2"}');
});

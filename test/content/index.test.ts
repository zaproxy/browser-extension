/**
 * @jest-environment jsdom
 */

import * as src from "../../src/content/index";
// These lines must appear before the JSDOM import
import { TextEncoder, TextDecoder } from 'util'
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder
import { JSDOM } from "jsdom";

test('ReportedObject toString as expected', () => {
	// Given / When
	const ro: src.ReportedObject = new src.ReportedObject("a", "b", "c", "d");

	// Then
	expect(ro.toNonTimestampString()).toBe('{"tagName":"a","id":"b","nodeName":"c","text":"d","url":"http://localhost/"}');
});

test('ReportedElement P toString as expected', () => {
	// Given / When
	const el: Element = document.createElement("p");
	const ro: src.ReportedElement = new src.ReportedElement(el);

	// Then
	expect(ro.toNonTimestampString()).toBe('{"tagName":"P","id":"","nodeName":"P","text":"","url":"http://localhost/"}');
});

test('ReportedElement A toString as expected', () => {
	// Given / When
	const a: Element = document.createElement("a");
	const linkText = document.createTextNode("Title");
	a.appendChild(linkText);
	a.setAttribute('href', 'https://example.com');
	const ro: src.ReportedElement = new src.ReportedElement(a);

	// Then
	expect(ro.toNonTimestampString()).toBe(
		'{"tagName":"A","id":"","nodeName":"A","text":"Title","url":"http://localhost/","href":"https://example.com/"}');
});

test('Report no document links', () => {
	// Given
	const dom: JSDOM = new JSDOM('<!DOCTYPE html><body><p id="main">No links</p></body>');
	const mockFn = jest.fn();

	// When
	src.reportPageLinks(dom.window.document, mockFn);

	// Then
	expect(mockFn.mock.calls.length).toBe(0);
});

test('Report standard page links', () => {
	// Given
	const dom: JSDOM = new JSDOM(
		'<!DOCTYPE html><body><a href="https://www.example.com/1">link1</a><a href="https://www.example.com/2">link2</a></body>');
	const mockFn = jest.fn();

	// When
	src.reportPageLinks(dom.window.document, mockFn);

	// Then
	expect(mockFn.mock.calls.length).toBe(2);
	expect(mockFn.mock.calls[0][0].toNonTimestampString()).toBe(
		'{"tagName":"A","id":"","nodeName":"A","text":"link1","url":"http://localhost/","href":"https://www.example.com/1"}');
	expect(mockFn.mock.calls[1][0].toNonTimestampString()).toBe(
		'{"tagName":"A","id":"","nodeName":"A","text":"link2","url":"http://localhost/","href":"https://www.example.com/2"}');
});

test('Report area page links', () => {
	// Given
	const dom: JSDOM = new JSDOM(
		'<!DOCTYPE html><body><map><area href="https://www.example.com/1"><area href="https://www.example.com/2"></map></body>');
	const mockFn = jest.fn();

	// When
	src.reportPageLinks(dom.window.document, mockFn);

	// Then
	expect(mockFn.mock.calls.length).toBe(2);
	expect(mockFn.mock.calls[0][0].toNonTimestampString()).toBe(
		'{"tagName":"AREA","id":"","nodeName":"AREA","text":"","url":"http://localhost/","href":"https://www.example.com/1"}');
	expect(mockFn.mock.calls[1][0].toNonTimestampString()).toBe(
		'{"tagName":"AREA","id":"","nodeName":"AREA","text":"","url":"http://localhost/","href":"https://www.example.com/2"}');
});

test('Report no document forms', () => {
	// Given
	const dom: JSDOM = new JSDOM('<!DOCTYPE html><body><p id="main">No links</p></body>');
	const mockFn = jest.fn();

	// When
	src.reportPageForms(dom.window.document, mockFn);

	// Then
	expect(mockFn.mock.calls.length).toBe(0);
});

test('Report page forms', () => {
	// Given
	const dom: JSDOM = new JSDOM(
		'<!DOCTYPE html><body><form id="form1">Content1</form><form id="form2">Content2</form></body>');
	const mockFn = jest.fn();

	// When
	src.reportPageForms(dom.window.document, mockFn);

	// Then
	expect(mockFn.mock.calls.length).toBe(2);
	expect(mockFn.mock.calls[0][0].toNonTimestampString()).toBe(
		'{"tagName":"FORM","id":"form1","nodeName":"FORM","text":"Content1","url":"http://localhost/"}');
	expect(mockFn.mock.calls[1][0].toNonTimestampString()).toBe(
		'{"tagName":"FORM","id":"form2","nodeName":"FORM","text":"Content2","url":"http://localhost/"}');
});

test('Report node elements', () => {
	// Given
	const form: Element = document.createElement("form");
	const i1: Element = document.createElement("input");
	i1.setAttribute('id', 'input1');
	const i2: Element = document.createElement("input");
	i2.setAttribute('id', 'input2');
	// This should not be reported as we're just looking for input elements'
	const b1: Element = document.createElement("button");
	b1.setAttribute('id', 'button');
	
	form.appendChild(i1);
	form.appendChild(b1);
	form.appendChild(i2);
	
	// node.id = '';
	const mockFn = jest.fn();

	// When
	src.reportNodeElements(form, "input", mockFn);

	// Then
	expect(mockFn.mock.calls.length).toBe(2);
	expect(mockFn.mock.calls[0][0].toNonTimestampString()).toBe(
		'{"tagName":"INPUT","id":"input1","nodeName":"INPUT","text":"","url":"http://localhost/"}');
	expect(mockFn.mock.calls[1][0].toNonTimestampString()).toBe(
		'{"tagName":"INPUT","id":"input2","nodeName":"INPUT","text":"","url":"http://localhost/"}');
});

test('Report storage', () => {
	// Given
	// localStorage is mocked by Jest
	localStorage.setItem("item1", "value1");
	localStorage.setItem("item2", "value2");
	localStorage.setItem("item3", "value3");
	const mockFn = jest.fn();

	// When
	src.reportStorage("localStorage", localStorage, mockFn);

	// Then
	expect(mockFn.mock.calls.length).toBe(3);
	expect(mockFn.mock.calls[0][0].toNonTimestampString()).toBe(
		'{"tagName":"localStorage","id":"item1","nodeName":"","text":"value1","url":"http://localhost/"}');
	expect(mockFn.mock.calls[1][0].toNonTimestampString()).toBe(
		'{"tagName":"localStorage","id":"item2","nodeName":"","text":"value2","url":"http://localhost/"}');
	expect(mockFn.mock.calls[2][0].toNonTimestampString()).toBe(
		'{"tagName":"localStorage","id":"item3","nodeName":"","text":"value3","url":"http://localhost/"}');
		
	// Tidy
	localStorage.removeItem("item1");
	localStorage.removeItem("item2");
	localStorage.removeItem("item3");
});

test('Reported page loaded', () => {
	// Given
	const dom: JSDOM = new JSDOM(
		'<!DOCTYPE html><body>' +
		'<a href="https://www.example.com/1">link1</a>' +
		'<form id="form1">FormContent</form>' +
		'<button id="button1"></button>' +
		'<input id="input1"></input>' +
		'<area href="https://www.example.com/1">'
		);
	const mockFn = jest.fn();
	localStorage.setItem("lsKey", "value1");
	sessionStorage.setItem("ssKey", "value2");

	// When
	src.reportPageLoaded(dom.window.document, mockFn);

	// Then
	expect(mockFn.mock.calls.length).toBe(7);
	expect(mockFn.mock.calls[0][0].toNonTimestampString()).toBe(
		'{"tagName":"A","id":"","nodeName":"A","text":"link1","url":"http://localhost/","href":"https://www.example.com/1"}');
	expect(mockFn.mock.calls[1][0].toNonTimestampString()).toBe(
		'{"tagName":"AREA","id":"","nodeName":"AREA","text":"","url":"http://localhost/","href":"https://www.example.com/1"}');
	expect(mockFn.mock.calls[2][0].toNonTimestampString()).toBe(
		'{"tagName":"FORM","id":"form1","nodeName":"FORM","text":"FormContent","url":"http://localhost/"}');
	expect(mockFn.mock.calls[3][0].toNonTimestampString()).toBe(
		'{"tagName":"INPUT","id":"input1","nodeName":"INPUT","text":"","url":"http://localhost/"}');
	expect(mockFn.mock.calls[4][0].toNonTimestampString()).toBe(
		'{"tagName":"BUTTON","id":"button1","nodeName":"BUTTON","text":"","url":"http://localhost/"}');
	expect(mockFn.mock.calls[5][0].toNonTimestampString()).toBe(
		'{"tagName":"localStorage","id":"lsKey","nodeName":"","text":"value1","url":"http://localhost/"}');
	expect(mockFn.mock.calls[6][0].toNonTimestampString()).toBe(
		'{"tagName":"sessionStorage","id":"ssKey","nodeName":"","text":"value2","url":"http://localhost/"}');
		
	// Tidy
	localStorage.removeItem("lsKey");
	sessionStorage.removeItem("ssKey");
});

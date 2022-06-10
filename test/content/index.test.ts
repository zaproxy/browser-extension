/**
 * @jest-environment jsdom
 */

import { ReportedObject } from "../../src/content/index"; 

test('ReportedObject toString as expected', () => {
	let ro : ReportedObject  = new ReportedObject("a", "b", "c", "d");
  expect(ro.toString()).toBe("{\"tagName\":\"a\",\"id\":\"b\",\"nodeName\":\"c\",\"text\":\"d\",\"url\":\"http://localhost/\"}");
});
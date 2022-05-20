
class ReportedObject {
	tagName: string;
	id: string;
	nodeName: string;
	url: string;
	xpath: string;
	href: string;
	text: string;
	
	constructor(tagName: string, id: string, nodeName: string, text: string) {
		this.tagName = tagName;
		this.id = id;
		this.nodeName = nodeName;
		this.text = text;
		this.url = window.location.href;
	}

	toString() {
		return JSON.stringify(this);
	}

	toShortString() {
		return JSON.stringify(this, function(k: string, v: string) {
			if (k === "xpath") {
				// Dont return the xpath value - it can change too often in many cases
				return undefined;
			}
			return v;
		});
	}
}

class ReportedElement extends ReportedObject {

	constructor(element: Element) {
		super(element.tagName, element.id, element.nodeName, element.textContent);
		if (element["href"]) {
			this.href = element["href"];
		}
	}
	
}

class ReportedEvent {
	eventName: string;
	url: string;
	count: number;
	
	constructor(eventName: string) {
		this.eventName = eventName;
		this.url = window.location.href;
		this.count = 1;
	}

	toString() {
		return JSON.stringify(this);
	}
}

let reportedObjects = new Set<string>();

let reportedEvents: { [key: string]: ReportedEvent } = {};

function reportPageLoaded() {
	var url = window.location.href;
	if (url.includes('/OTHER/client/other/hook/')) {
		var json : JSON = JSON.parse(document.body.innerText);
		if ("url" in json && "apikey" in json) {
			chrome.runtime.sendMessage({type: "zapDetails", zapurl: json["zapurl"], zapkey: json["apikey"]});
		}
		// Lets get rid of the evidence ;)
		if (chrome.history) {
			let deletingUrl = chrome.history.deleteUrl({url: url});
				deletingUrl.then(() => {
					window.location.replace(json["url"]);
				});
		} else {
			window.location.replace(json["url"]);
		}
		// Shouldnt get to here, but no harm in returning..
		return;
	}
	
	reportPageLinks();
	reportPageForms();
	reportElements(document.getElementsByTagName("input"));
	reportElements(document.getElementsByTagName("button"));
	reportStorage();
}

function reportPageUnloaded() {
	for (let value of Object.values(reportedEvents)) {
		sendEventToZAP(value);
	}
	// TODO indicate it was created after page loaded..
	reportStorage();
}

function reportStorage() {
	for (let key of Object.keys(localStorage)) {
		reportObject(new ReportedObject('localStorage', key, '', localStorage.getItem(key)));
	}
	for (let key of Object.keys(sessionStorage)) {
		reportObject(new ReportedObject('sessionStorage', key, '', sessionStorage.getItem(key)));
	}
}

async function sendEventToZAP (obj: ReportedEvent) {
	chrome.runtime.sendMessage({type: "reportEvent", objectJson: obj.toString()});
}

async function sendObjectToZAP (obj: ReportedObject) {
	chrome.runtime.sendMessage({type: "reportObject", objectJson: obj.toString()});
}

function reportEvent(event: ReportedEvent) {
	let existingEvent: ReportedEvent;
	existingEvent = reportedEvents[event.eventName];
	if (! existingEvent) {
		existingEvent = new ReportedEvent(event.eventName);
		reportedEvents[event.eventName] = event;
		sendEventToZAP(existingEvent);
	} else if (existingEvent.url !== window.location.href) {
		// The fragment has changed - report the old one and start a new count
		sendEventToZAP(existingEvent);
		existingEvent = new ReportedEvent(event.eventName);
		reportedEvents[event.eventName] = event;
		sendEventToZAP(existingEvent);
	} else {
		existingEvent.count++;
	}
}

function reportObject(repObj: ReportedObject) {
	//let repObj = new ReportedObject(element);
	let repObjStr = repObj.toShortString();
	if (!reportedObjects.has(repObjStr)) {
		sendObjectToZAP(repObj);
		reportedObjects.add(repObjStr);
	}
}

function reportPageForms() {
	var forms = document.forms;
	for (var i = 0; i < forms.length; i++) {
		reportObject(new ReportedElement(forms[i]));
	}
}

function reportPageLinks() {
	var links = document.links;
	for (var i = 0; i < links.length; i++) {
		reportObject(new ReportedElement(links[i]));
	}
}

function reportElements(collection: HTMLCollection) {
	for (var i = 0; i < collection.length; i++) {
		reportObject(new ReportedElement(collection[i]));
	}
}

function reportNodeElements(node: Node, tagName: string) {
	if (node.nodeType === Node.ELEMENT_NODE) {
		reportElements((node as Element).getElementsByTagName(tagName));
	}
}

// Copied from https://medium.com/@a.k.h.i.l/javascript-to-generate-absolute-xpath-2ecae105ddbe
// Have not worked out how to define the parameter type yet :/
function createXPathFromElement(elm) {
	var allNodes = document.getElementsByTagName('*');
	for (var segs = []; elm && elm.nodeType == 1; elm = elm.parentNode) {
		if (elm.hasAttribute('id')) {
			var uniqueIdCount = 0;
			for (var n = 0; n < allNodes.length; n++) {
				if (allNodes[n].hasAttribute('id') && allNodes[n].id == elm.id) uniqueIdCount++;
				if (uniqueIdCount > 1) break;
			};
			if (uniqueIdCount == 1) {
				segs.unshift('id("' + elm.getAttribute('id') + '")');
				return segs.join('/');
			} else {
				segs.unshift(elm.localName.toLowerCase() + '[@id="' + elm.getAttribute('id') + '"]');
			}
		} else if (elm.hasAttribute('class')) {
			segs.unshift(elm.localName.toLowerCase() + '[@class="' + elm.getAttribute('class') + '"]');
		} else {
			for (var i = 1, sib = elm.previousSibling; sib; sib = sib.previousSibling) {
				if (sib.localName == elm.localName) i++;
			};
			segs.unshift(elm.localName.toLowerCase() + '[' + i + ']');
		};
	};
	return segs.length ? '/' + segs.join('/') : null;
};

const domMutated = function(mutationList: MutationRecord[], _obs: MutationObserver) {
	reportEvent(new ReportedEvent('DOM Mutation'));
	reportPageLinks();
	reportPageForms();
	for (const mutation of mutationList) {
		if (mutation.type === 'childList') {
			reportNodeElements(mutation.target, "input");
			reportNodeElements(mutation.target, "button");
		}
	}
}

window.addEventListener("load", reportPageLoaded, false);
window.onbeforeunload = reportPageUnloaded;

const observer = new MutationObserver(domMutated);
observer.observe(document, { attributes: true, childList: true, subtree: true });

// This is needed for more traditional apps
reportPageLoaded();



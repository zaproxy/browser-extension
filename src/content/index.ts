
class ReportedObject {
	public tagName: string;
	public id: string;
	public nodeName: string;
	public url: string;
	public xpath: string;
	public href: string;
	public text: string;

	public constructor(tagName: string, id: string, nodeName: string, text: string) {
		this.tagName = tagName;
		this.id = id;
		this.nodeName = nodeName;
		this.text = text;
		this.url = window.location.href;
	}

	public toString() {
		return JSON.stringify(this);
	}

	public toShortString() {
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

	public constructor(element: Element) {
		super(element.tagName, element.id, element.nodeName, element.textContent);
		if (element["href"]) {
			this.href = element["href"];
		}
	}

}

class ReportedEvent {
	public eventName: string;
	public url: string;
	public count: number;

	public constructor(eventName: string) {
		this.eventName = eventName;
		this.url = window.location.href;
		this.count = 1;
	}

	public toString() {
		return JSON.stringify(this);
	}
}

const reportedObjects = new Set<string>();

const reportedEvents: { [key: string]: ReportedEvent } = {};

function reportPageLoaded(doc: Document, fn: (re: ReportedObject) => void) {
	const url = window.location.href;
	if (url.includes('/OTHER/client/other/hook/')) {
		const json: JSON = JSON.parse(doc.body.innerText);
		if ("url" in json && "apikey" in json) {
			chrome.runtime.sendMessage({ type: "zapDetails", zapurl: json["zapurl"], zapkey: json["apikey"] });
		}
		// Lets get rid of the evidence ;)
		if (chrome.history) {
			const deletingUrl = chrome.history.deleteUrl({ url });
			deletingUrl.then(() => {
				window.location.replace(json["url"]);
			});
		} else {
			window.location.replace(json["url"]);
		}
		// Shouldnt get to here, but no harm in returning..
		return;
	}

	reportPageLinks(doc, fn);
	reportPageForms(doc, fn);
	reportElements(doc.getElementsByTagName("input"), fn);
	reportElements(doc.getElementsByTagName("button"), fn);
	reportStorage("localStorage", localStorage, fn);
	reportStorage("sessionStorage", sessionStorage, fn);
}

function reportPageUnloaded() {
	for (const value of Object.values(reportedEvents)) {
		sendEventToZAP(value);
	}
	// TODO indicate it was created after page loaded..
	reportStorage("localStorage", localStorage, reportObject);
	reportStorage("sessionStorage", sessionStorage, reportObject);
}

function reportStorage(name: string, storage: Storage, fn: (re: ReportedObject) => void) {
	for (const key of Object.keys(storage)) {
		fn(new ReportedObject(name, key, '', storage.getItem(key)));
	}
}

async function sendEventToZAP(obj: ReportedEvent) {
	chrome.runtime.sendMessage({ type: "reportEvent", objectJson: obj.toString() });
}

async function sendObjectToZAP(obj: ReportedObject) {
	chrome.runtime.sendMessage({ type: "reportObject", objectJson: obj.toString() });
}

function reportEvent(event: ReportedEvent) {
	let existingEvent: ReportedEvent;
	existingEvent = reportedEvents[event.eventName];
	if (!existingEvent) {
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
	const repObjStr = repObj.toShortString();
	if (!reportedObjects.has(repObjStr)) {
		sendObjectToZAP(repObj);
		reportedObjects.add(repObjStr);
	}
}

function reportPageForms(doc: Document, fn: (re: ReportedObject) => void) {
	Array.prototype.forEach.call(doc.forms, (form: HTMLFormElement) => {
		fn(new ReportedElement(form))
	});
}

function reportPageLinks(doc: Document, fn: (re: ReportedObject) => void) {
	Array.prototype.forEach.call(doc.links, (link: HTMLAnchorElement | HTMLAreaElement) => {
		fn(new ReportedElement(link))
	});
}

function reportElements(collection: HTMLCollection, fn: (re: ReportedObject) => void) {
	Array.prototype.forEach.call(collection, (element: Element) => {
		fn(new ReportedElement(element))
	});
}

function reportNodeElements(node: Node, tagName: string, fn: (re: ReportedObject) => void) {
	if (node.nodeType === Node.ELEMENT_NODE) {
		reportElements((node as Element).getElementsByTagName(tagName), fn);
	}
}

const domMutated = function(mutationList: MutationRecord[], _obs: MutationObserver) {
	reportEvent(new ReportedEvent('DOM Mutation'));
	reportPageLinks(document, reportObject);
	reportPageForms(document, reportObject);
	for (const mutation of mutationList) {
		if (mutation.type === 'childList') {
			reportNodeElements(mutation.target, "input", reportObject);
			reportNodeElements(mutation.target, "button", reportObject);
		}
	}
}

function onLoadEventListener() {
	reportPageLoaded(document, reportObject);
}

window.addEventListener("load", onLoadEventListener, false);
window.onbeforeunload = reportPageUnloaded;

const observer = new MutationObserver(domMutated);
observer.observe(document, { attributes: true, childList: true, subtree: true });

// This is needed for more traditional apps
reportPageLoaded(document, reportObject);

export { ReportedObject, ReportedElement, reportPageLinks, reportPageLoaded, reportPageForms, reportNodeElements, reportStorage }

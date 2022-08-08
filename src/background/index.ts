// Disable the 'no-explicit-any' rule in this file as the message handlers are defined to use 'any'
/* eslint-disable  @typescript-eslint/no-explicit-any */

console.log("ZAP Service Worker 👋");

function onMessageHandler(request: any, _sender: chrome.runtime.MessageSender, _sendResponse: any): boolean {
	chrome.storage.sync.get({
		zapurl: 'http://zap/',
		zapkey: 'not set'
	}, function(items) {
		handleMessage(request, items.zapurl, items.zapkey);
	});
	return true;
}

/*
  A callback URL will only be available if the browser has been launched from ZAP, otherwise call the individual endpoints
*/
function zapApiUrl(zapurl: string, action: string) {
	if (zapurl.indexOf('/zapCallBackUrl/') > 0) {
		return zapurl;
	} else {
		return zapurl + "JSON/client/action/" + action + "/";
	}
}

function handleMessage(request: any, zapurl: string, zapkey: string): boolean {
	if (request.type === "zapDetails") {
		console.log("ZAP Service worker updating the ZAP details");
		chrome.storage.sync.set({
			zapurl: request.zapurl,
			zapcallback: request.zapcallback,
			zapkey: request.zapkey
		});

		return true;
	}

	console.log("ZAP Service worker calling ZAP on " + zapurl);

	if (request.type === "reportObject") {
		console.log("body = " + "objectJson=" + encodeURIComponent(request.objectJson) + "&apikey=" + encodeURIComponent(zapkey));
		fetch(zapApiUrl(zapurl, "reportObject"), {
			method: "POST",
			body: "objectJson=" + encodeURIComponent(request.objectJson) + "&apikey=" + encodeURIComponent(zapkey),
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			}
		})
	} else if (request.type === "reportEvent") {
		fetch(zapApiUrl(zapurl, "reportEvent"), {
			method: "POST",
			body: "eventJson=" + encodeURIComponent(request.objectJson) + "&apikey=" + encodeURIComponent(zapkey),
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			}
		})
	}
	return true;
}

function onToolbarButtonClick(_tab: any) {
	chrome.runtime.openOptionsPage();
}

chrome.browserAction.onClicked.addListener(onToolbarButtonClick);
chrome.runtime.onMessage.addListener(onMessageHandler);

export { handleMessage }
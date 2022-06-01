console.log("Options loading");

const ZAP_URL = 'zapurl';
const ZAP_KEY = 'zapkey';

// Saves options to chrome.storage
function save_options() {
	console.log("Options save_options");
	const zapurl = (document.getElementById(ZAP_URL) as HTMLInputElement).value;
	const zapkey = (document.getElementById(ZAP_KEY) as HTMLInputElement).value;
	chrome.storage.sync.set({
		zapurl,
		zapkey
	});
}

// Restores options from chrome.storage.
function restore_options() {
	console.log("Options restore_options");
	chrome.storage.sync.get({
		zapurl: 'http://zap/',
		zapkey: 'not set'
	}, function(items) {
		(document.getElementById(ZAP_URL) as HTMLInputElement).value = items.zapurl;
		(document.getElementById(ZAP_KEY) as HTMLInputElement).value = items.zapkey;
	});
}
document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);

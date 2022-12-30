/*
 * Zed Attack Proxy (ZAP) and its related source files.
 *
 * ZAP is an HTTP/HTTPS proxy for assessing web application security.
 *
 * Copyright 2022 The ZAP Development Team
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
import 'emoji-log';
import {browser, Runtime} from 'webextension-polyfill-ts';

console.log('ZAP Service Worker 👋');

/*
  A callback URL will only be available if the browser has been launched from ZAP, otherwise call the individual endpoints
*/
function zapApiUrl(zapurl: string, action: string): string {
  if (zapurl.indexOf('/zapCallBackUrl/') > 0) {
    return zapurl;
  }
  return `${zapurl}JSON/client/action/${action}/`;
}

function handleMessage(
  request: MessageEvent,
  zapurl: string,
  zapkey: string
): boolean {
  if (request.type === 'zapDetails') {
    console.log('ZAP Service worker updating the ZAP details');
    browser.storage.sync.set({
      zapurl: request.data.zapurl,
      zapcallback: request.data.zapcallback,
      zapkey: request.data.zapkey,
    });

    return true;
  }

  console.log(`ZAP Service worker calling ZAP on ${zapurl}`);
  console.log(zapApiUrl(zapurl, 'reportObject'));
  console.log(encodeURIComponent(zapkey));
  console.log(`Type: ${request.type}`);
  console.log(`Data: ${request.data}`);
  if (request.type === 'reportObject') {
    const body = `objectJson=${encodeURIComponent(
      request.data
    )}&apikey=${encodeURIComponent(zapkey)}`;
    console.log(`body = ${body}`);
    fetch(zapApiUrl(zapurl, 'reportObject'), {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  } else if (request.type === 'reportEvent') {
    const body = `eventJson=${encodeURIComponent(
      request.data
    )}&apikey=${encodeURIComponent(zapkey)}`;
    console.log(`body = ${body}`);
    fetch(zapApiUrl(zapurl, 'reportEvent'), {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }
  return true;
}

function onMessageHandler(
  message: MessageEvent,
  _sender: Runtime.MessageSender
): Promise<number> {
  browser.storage.sync
    .get({
      zapurl: 'http://zap/',
      zapkey: 'not set',
    })
    .then((items) => {
      handleMessage(message, items.zapurl, items.zapkey);
      return Promise.resolve(1);
    });
  // No point failing - theres nothing we can do if this doesnt work
  return Promise.resolve(2);
}

browser.browserAction.onClicked.addListener((_tab) => {
  browser.runtime.openOptionsPage();
});

browser.runtime.onMessage.addListener(onMessageHandler);

browser.runtime.onInstalled.addListener((): void => {
  console.emoji('🦄', 'extension installed');
});

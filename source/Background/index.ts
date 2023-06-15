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
import 'emoji-log';
import Browser, {Runtime} from 'webextension-polyfill';
import {ReportedStorage} from '../types/ReportedModel';
import {ZestScript, ZestScriptMessage} from '../types/zestScript/ZestScript';

console.log('ZAP Service Worker 👋');

/*
  We check the storage on every page, so need to record which storage events we have reported to ZAP here so that we dont keep sending the same events.
*/
const reportedStorage = new Set<string>();
const zestScript = new ZestScript('recordedScript');
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
): boolean | ZestScriptMessage {
  if (request.type === 'zapDetails') {
    console.log('ZAP Service worker updating the ZAP details');
    Browser.storage.sync.set({
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
    const repObj = JSON.parse(request.data);
    if (repObj.type === 'localStorage' || repObj.type === 'sessionStorage') {
      // Check to see if we have already reported this storage object
      const repStorage = new ReportedStorage('', '', '', '', '');
      Object.assign(repStorage, repObj);
      const repStorStr: string = repStorage.toShortString();
      if (reportedStorage.has(repStorStr)) {
        // Already reported
        return true;
      }
      reportedStorage.add(repStorStr);
    }
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
  } else if (request.type === 'zestScript') {
    const data = zestScript.addStatement(request.data);

    const body = `eventJson=${encodeURIComponent(
      data
    )}&apikey=${encodeURIComponent(zapkey)}`;
    console.log(`body = ${body}`);
    fetch(zapApiUrl(zapurl, 'reportZestScript'), {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  } else if (request.type === 'saveZestScript') {
    return zestScript.getZestScript();
  } else if (request.type === 'resetZestScript') {
    zestScript.reset();
  }
  return true;
}

async function onMessageHandler(
  message: MessageEvent,
  _sender: Runtime.MessageSender
): Promise<number | ZestScriptMessage> {
  let val: number | ZestScriptMessage = 2;
  const items = await Browser.storage.sync.get({
    zapurl: 'http://zap/',
    zapkey: 'not set',
  });
  const msg = handleMessage(message, items.zapurl, items.zapkey);
  console.log(msg);
  if (!(typeof msg === 'boolean')) {
    console.log(msg);
    val = msg;
  }
  return Promise.resolve(val);
}

Browser.action.onClicked.addListener((_tab: Browser.Tabs.Tab) => {
  Browser.runtime.openOptionsPage();
});

Browser.runtime.onMessage.addListener(onMessageHandler);

Browser.runtime.onInstalled.addListener((): void => {
  console.emoji('🦄', 'extension installed');
  Browser.storage.sync.set({
    zapurl: 'http://localhost:8080/',
    zapkey: 'not set',
  });
});

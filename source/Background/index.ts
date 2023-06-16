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
import Browser, {Cookies, Runtime} from 'webextension-polyfill';
import {ReportedStorage} from '../types/ReportedModel';

console.log('ZAP Service Worker 👋');

/*
  We check the storage on every page, so need to record which storage events we have reported to ZAP here so that we dont keep sending the same events.
*/
const reportedStorage = new Set<string>();

/*
  A callback URL will only be available if the browser has been launched from ZAP, otherwise call the individual endpoints
*/
function zapApiUrl(zapurl: string, action: string): string {
  if (zapurl.indexOf('/zapCallBackUrl/') > 0) {
    return zapurl;
  }
  return `${zapurl}JSON/client/action/${action}/`;
}

function getUrlFromCookieDomain(domain: string): string {
  return domain.startsWith('.')
    ? `http://${domain.substring(1)}`
    : `http://${domain}`;
}

function getCookieTabUrl(
  cookie: Cookies.Cookie
): Promise<string> {
  const getAllTabs = Browser.tabs.query({
    currentWindow: true,
  });
  return new Promise((resolve, reject) => {
    getAllTabs
      .then((allTabs) => {
        for (const tab of allTabs) {
          if (tab.url) {
            const getAllCookiesForTab = Browser.cookies.getAll({url: tab.url});
            getAllCookiesForTab.then((cookies) => {
              for (const cookie of cookies) {
                if (
                  cookie.name === cookie.name &&
                  cookie.value === cookie.value &&
                  cookie.domain === cookie.domain &&
                  cookie.storeId === cookie.storeId
                ) {
                  resolve(
                    tab.url
                      ? tab.url
                      : getUrlFromCookieDomain(cookie.domain)
                  );
                }
              }
            });
          }
        }
      })
      .catch((error) => {
        console.error(`Could not fetch tabs: ${error.message}`);
        reject(getUrlFromCookieDomain(cookie.domain));
      });
  });
}

function reportCookies(
  cookie: Cookies.Cookie,
  zapurl: string,
  zapkey: string
): Boolean {
  let cookieString = `${cookie.name}=${cookie.value}; path=${cookie.path}; domain=${cookie.domain}`;
  if (cookie.expirationDate) {
    cookieString = cookieString.concat(
      `; expires=${new Date(cookie.expirationDate * 1000).toUTCString()}`
    );
  }
  if (cookie.secure) {
    cookieString = cookieString.concat(`; secure`);
  }
  if (cookie.sameSite === 'lax' || cookie.sameSite === 'strict') {
    cookieString = cookieString.concat(`; SameSite=${cookie.sameSite}`);
  }
  if (cookie.httpOnly) {
    cookieString = cookieString.concat(`; HttpOnly`);
  }

  getCookieTabUrl(cookie).then((cookieUrl) => {
    const repStorage = new ReportedStorage(
      'Cookies',
      '',
      cookie.name,
      '',
      cookieString,
      cookieUrl
    );
    const repStorStr: string = repStorage.toShortString();
    if (!reportedStorage.has(repStorStr) && repStorage.url.startsWith('http')) {
      const body = `objectJson=${encodeURIComponent(
        repStorage.toString()
      )}&apikey=${encodeURIComponent(zapkey)}`;

      fetch(zapApiUrl(zapurl, 'reportObject'), {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      reportedStorage.add(repStorStr);
    }
  }).catch((error) => {
    console.log(error);
    return false;
  });

  return true;
}

function handleMessage(
  request: MessageEvent,
  zapurl: string,
  zapkey: string
): boolean {
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
  }
  return true;
}

function onMessageHandler(
  message: MessageEvent,
  _sender: Runtime.MessageSender
): Promise<number> {
  Browser.storage.sync
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

function cookieChangeHandler(
  changeInfo: Cookies.OnChangedChangeInfoType
): void {
  Browser.storage.sync
    .get({
      zapurl: 'http://localhost:8080/',
      zapkey: 'not set',
    })
    .then((items) => {
      reportCookies(changeInfo.cookie, items.zapurl, items.zapkey);
    });
}

Browser.action.onClicked.addListener((_tab: Browser.Tabs.Tab) => {
  Browser.runtime.openOptionsPage();
});

Browser.cookies.onChanged.addListener(cookieChangeHandler);
Browser.runtime.onMessage.addListener(onMessageHandler);

Browser.runtime.onInstalled.addListener((): void => {
  console.emoji('🦄', 'extension installed');
  Browser.storage.sync.set({
    zapurl: 'http://localhost:8080/',
    zapkey: 'not set',
  });
});

export {
  reportCookies
};
/*
 * AccuKnox DAST Browser Extension and its related source files.
 *
 * DAST is an HTTP/HTTPS proxy for assessing web application security.
 *
 * Copyright 2023 The AccuKnox DAST Development Team
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
import {ZestScript, ZestScriptMessage} from '../types/zestScript/ZestScript';
import {
  ZestStatementClientWaitForMsec,
  ZestStatementWindowClose,
} from '../types/zestScript/ZestStatement';
import {
  DAST_TRAILING_WAIT_MSEC,
  GET_ZEST_SCRIPT,
  IS_FULL_EXTENSION,
  LOCAL_STORAGE,
  REPORT_EVENT,
  REPORT_OBJECT,
  RESET_ZEST_SCRIPT,
  SESSION_STORAGE,
  STOP_RECORDING,
  ZEST_SCRIPT,
} from '../utils/constants';

console.log('DAST Service Worker 👋');

/*
  We check the storage on every page, so need to record which storage events we have reported to DAST here so that we dont keep sending the same events.
*/
const reportedStorage = new Set<string>();
const zestScript = new ZestScript();

/*
  A callback URL will only be available if the browser has been launched from DAST, otherwise call the individual endpoints
*/

function dastApiUrl(dasturl: string, action: string): string {
  if (dasturl.indexOf('/zapCallBackUrl/') > 0) {
    return dasturl;
  }
  return `${dasturl}JSON/client/action/${action}/`;
}

function getUrlFromCookieDomain(domain: string): string {
  return domain.startsWith('.')
    ? `http://${domain.substring(1)}`
    : `http://${domain}`;
}

function getCookieTabUrl(cookie: Cookies.Cookie): Promise<string> {
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
              for (const c of cookies) {
                if (
                  c.name === cookie.name &&
                  c.value === cookie.value &&
                  c.domain === cookie.domain &&
                  c.storeId === cookie.storeId
                ) {
                  resolve(
                    tab.url ? tab.url : getUrlFromCookieDomain(cookie.domain)
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
  dasturl: string,
  dastkey: string
): boolean {
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

  getCookieTabUrl(cookie)
    .then((cookieUrl) => {
      const repStorage = new ReportedStorage(
        'Cookies',
        '',
        cookie.name,
        '',
        cookieString,
        cookieUrl
      );
      const repStorStr: string = repStorage.toShortString();
      if (
        !reportedStorage.has(repStorStr) &&
        repStorage.url.startsWith('http')
      ) {
        const body = `objectJson=${encodeURIComponent(
          repStorage.toString()
        )}&apikey=${encodeURIComponent(dastkey)}`;

        fetch(dastApiUrl(dasturl, REPORT_OBJECT), {
          method: 'POST',
          body,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });

        reportedStorage.add(repStorStr);
      }
    })
    .catch((error) => {
      console.log(error);
      return false;
    });

  return true;
}

function sendZestScriptToDAST(
  data: string,
  dastkey: string,
  dasturl: string
): void {
  if (IS_FULL_EXTENSION) {
    const body = `statementJson=${encodeURIComponent(
      data
    )}&apikey=${encodeURIComponent(dastkey)}`;
    console.log(`body = ${body}`);
    fetch(dastApiUrl(dasturl, 'reportZestStatement'), {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }
}

async function handleMessage(
  request: MessageEvent,
  dasturl: string,
  dastkey: string
): Promise<boolean | ZestScriptMessage> {
  console.log(`DAST Service worker calling DAST on ${dasturl}`);
  console.log(dastApiUrl(dasturl, REPORT_OBJECT));
  console.log(encodeURIComponent(dastkey));
  console.log(`Type: ${request.type}`);
  console.log(`Data: ${request.data}`);
  switch (request.type) {
    case REPORT_OBJECT: {
      const repObj = JSON.parse(request.data);
      if (repObj.type === LOCAL_STORAGE || repObj.type === SESSION_STORAGE) {
        const repStorage = new ReportedStorage('', '', '', '', '', '');
        Object.assign(repStorage, repObj);
        const repStorStr = repStorage.toShortString();
        if (reportedStorage.has(repStorStr)) {
          return true;
        }
        reportedStorage.add(repStorStr);
      }
      const repObjBody = `objectJson=${encodeURIComponent(
        request.data
      )}&apikey=${encodeURIComponent(dastkey)}`;
      console.log(`body = ${repObjBody}`);
      fetch(dastApiUrl(dasturl, REPORT_OBJECT), {
        method: 'POST',
        body: repObjBody,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      break;
    }

    case REPORT_EVENT: {
      const eventBody = `eventJson=${encodeURIComponent(
        request.data
      )}&apikey=${encodeURIComponent(dastkey)}`;
      console.log(`body = ${eventBody}`);
      fetch(dastApiUrl(dasturl, REPORT_EVENT), {
        method: 'POST',
        body: eventBody,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      break;
    }

    case ZEST_SCRIPT: {
      const data = zestScript.addStatement(request.data);
      sendZestScriptToDAST(data, dastkey, dasturl);
      break;
    }

    case GET_ZEST_SCRIPT:
      return zestScript.getZestScript();

    case RESET_ZEST_SCRIPT: {
      zestScript.reset();
      reportedStorage.clear();
      let origin = '';
      try {
        const parsed = new URL(request.data as string);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          origin = parsed.origin;
        }
      } catch {
        // invalid/empty URL
      }
      if (origin) {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        await Browser.browsingData.remove({origins: [origin]} as any, {
          cacheStorage: true,
          cookies: true,
          indexedDB: true,
          localStorage: true,
          serviceWorkers: true,
        } as any);
      }
      break;
    }

    case STOP_RECORDING: {
      if (zestScript.getZestStatementCount() > 0) {
        const waitStmt = new ZestStatementClientWaitForMsec(
          DAST_TRAILING_WAIT_MSEC
        );
        sendZestScriptToDAST(
          zestScript.addStatement(waitStmt.toJSON()),
          dastkey,
          dasturl
        );

        const {dastclosewindowhandle} = await Browser.storage.sync.get({
          dastclosewindowhandle: false,
        });
        if (dastclosewindowhandle) {
          const stmt = new ZestStatementWindowClose(0);
          const data = zestScript.addStatement(stmt.toJSON());
          sendZestScriptToDAST(data, dastkey, dasturl);
        }
      }
      break;
    }

    default:
      // Handle unknown request type
      break;
  }

  return true;
}

async function onMessageHandler(
  message: unknown,
  _sender: Runtime.MessageSender
): Promise<number | ZestScriptMessage> {
  let val: number | ZestScriptMessage = 2;
  const items = await Browser.storage.sync.get({
    dasturl: 'http://zap/',
    dastkey: 'not set',
  });
  const msg = await handleMessage(
    message as MessageEvent,
    items.dasturl as string,
    items.dastkey as string
  );
  if (!(typeof msg === 'boolean')) {
    val = msg;
  }
  return Promise.resolve(val);
}

function cookieChangeHandler(
  changeInfo: Cookies.OnChangedChangeInfoType
): void {
  Browser.storage.sync
    .get({
      dasturl: 'http://zap/',
      dastkey: 'not set',
    })
    .then((items) => {
      reportCookies(
        changeInfo.cookie,
        items.dasturl as string,
        items.dastkey as string
      );
    });
}

Browser.runtime.onMessage.addListener(onMessageHandler);

if (IS_FULL_EXTENSION) {
  Browser.action.onClicked.addListener((_tab: Browser.Tabs.Tab) => {
    Browser.runtime.openOptionsPage();
  });

  Browser.cookies.onChanged.addListener(cookieChangeHandler);

  Browser.runtime.onInstalled.addListener((): void => {
    console.emoji('🦄', 'extension installed');
    Browser.storage.sync.set({
      dasturl: 'http://zap/',
      dastkey: 'not set',
    });
  });
}

export {reportCookies};

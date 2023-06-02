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
import Browser from 'webextension-polyfill';

console.log('Options loading');

const ZAP_URL = 'zapurl';
const ZAP_KEY = 'zapkey';
const ZAP_ENABLE = 'zapenable';

// Saves options to chrome.storage
function saveOptions(): void {
  console.log('Options save_options');
  const zapurl = (document.getElementById(ZAP_URL) as HTMLInputElement).value;
  const zapkey = (document.getElementById(ZAP_KEY) as HTMLInputElement).value;
  const zapenable = (document.getElementById(ZAP_ENABLE) as HTMLInputElement)
    .checked;
  Browser.storage.sync.set({
    zapurl,
    zapkey,
    zapenable,
  });
}

// Restores options from chrome.storage.
function restoreOptions(): void {
  console.log('Options restore_options');

  Browser.storage.sync
    .get({
      zapurl: 'http://localhost:8080/',
      zapkey: 'not set',
      zapenable: true,
    })
    .then((items) => {
      (document.getElementById(ZAP_URL) as HTMLInputElement).value =
        items.zapurl;
      (document.getElementById(ZAP_KEY) as HTMLInputElement).value =
        items.zapkey;
      (document.getElementById(ZAP_ENABLE) as HTMLInputElement).checked =
        items.zapenable;
    });
}
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save')?.addEventListener('click', saveOptions);

export {saveOptions};

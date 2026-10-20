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
import {
  IS_FULL_EXTENSION,
  ZAP_ENABLE,
  ZAP_KEY,
  ZAP_URL,
} from '../utils/constants';
import {DEFAULT_STATEMENT_DELAY} from '../types/zestScript/ZestScript';

console.log('Options loading');

// Saves options to chrome.storage
function saveOptions(): void {
  console.log('Options save_options');
  const zapclosewindowhandle = (
    document.getElementById('window-close-input') as HTMLInputElement
  ).checked;
  const zapstatementdelay = parseInt(
    (document.getElementById('statement-delay-input') as HTMLInputElement)
      .value,
    10
  );
  const settings: Record<string, unknown> = {
    zapclosewindowhandle,
    zapstatementdelay,
  };
  if (IS_FULL_EXTENSION) {
    // The recorder does not show these, so it should not change them
    settings.zapenable = (
      document.getElementById(ZAP_ENABLE) as HTMLInputElement
    ).checked;
    settings.zapurl = (
      document.getElementById(ZAP_URL) as HTMLInputElement
    ).value;
    settings.zapkey = (
      document.getElementById(ZAP_KEY) as HTMLInputElement
    ).value;
  }
  Browser.storage.sync.set(settings);
}

/**
 * The recorder does not talk to ZAP, so the page only shows what applies to it:
 * the text about giving ZAP access to the browser, the settings for how to
 * reach ZAP, and whether to report to ZAP are only for the full extension.
 */
function showWhatApplies(): void {
  if (typeof Browser.runtime.getManifest === 'function') {
    const title = document.getElementById('title');
    if (title) {
      title.textContent = Browser.runtime.getManifest().name;
    }
  }
  if (!IS_FULL_EXTENSION) {
    document.querySelectorAll<HTMLElement>('.full-only').forEach((el) => {
      const element = el;
      element.hidden = true;
    });
  }
}

// Restores options from chrome.storage.
function restoreOptions(): void {
  console.log('Options restore_options');
  showWhatApplies();

  Browser.storage.sync
    .get({
      zapurl: 'http://zap/',
      zapkey: 'not set',
      zapenable: false,
      zaprecordingactive: false,
      zapclosewindowhandle: true,
      zapstatementdelay: DEFAULT_STATEMENT_DELAY,
    })
    .then((items) => {
      (document.getElementById(ZAP_URL) as HTMLInputElement).value =
        items.zapurl as string;
      (document.getElementById(ZAP_KEY) as HTMLInputElement).value =
        items.zapkey as string;
      (document.getElementById(ZAP_ENABLE) as HTMLInputElement).checked =
        items.zapenable as boolean;
      (
        document.getElementById('window-close-input') as HTMLInputElement
      ).checked = items.zapclosewindowhandle as boolean;
      (
        document.getElementById('statement-delay-input') as HTMLInputElement
      ).value = String(items.zapstatementdelay);
    });
}
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save')?.addEventListener('click', saveOptions);

export {saveOptions};

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
import Browser from 'webextension-polyfill';
import {DAST_ENABLE, DAST_KEY, DAST_URL} from '../utils/constants';

console.log('Options loading');

// Saves options to chrome.storage
function saveOptions(): void {
  console.log('Options save_options');
  const dasturl = (document.getElementById(DAST_URL) as HTMLInputElement).value;
  const dastkey = (document.getElementById(DAST_KEY) as HTMLInputElement).value;
  const dastenable = (document.getElementById(DAST_ENABLE) as HTMLInputElement)
    .checked;
  const dastclosewindowhandle = (
    document.getElementById('window-close-input') as HTMLInputElement
  ).checked;
  Browser.storage.sync.set({
    dasturl,
    dastkey,
    dastenable,
    dastclosewindowhandle,
  });
}

// Restores options from chrome.storage.
function restoreOptions(): void {
  console.log('Options restore_options');

  Browser.storage.sync
    .get({
      dasturl: 'http://zap/',
      dastkey: 'not set',
      dastenable: false,
      dastrecordingactive: false,
      dastclosewindowhandle: true,
    })
    .then((items) => {
      (document.getElementById(DAST_URL) as HTMLInputElement).value =
        items.dasturl as string;
      (document.getElementById(DAST_KEY) as HTMLInputElement).value =
        items.dastkey as string;
      (document.getElementById(DAST_ENABLE) as HTMLInputElement).checked =
        items.dastenable as boolean;
      (
        document.getElementById('window-close-input') as HTMLInputElement
      ).checked = items.dastclosewindowhandle as boolean;
    });
}
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save')?.addEventListener('click', saveOptions);

export {saveOptions};

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
import Browser from 'webextension-polyfill';
import './styles.scss';

console.log('Options loading');

const ZAP_URL = 'zapurl';
const ZAP_KEY = 'zapkey';
const RECORD_URL = 'recordurl';
let recordingActive = false;

// Saves options to chrome.storage
function saveOptions(): void {
  console.log('Options save_options');
  const zapurl = (document.getElementById(ZAP_URL) as HTMLInputElement).value;
  const zapkey = (document.getElementById(ZAP_KEY) as HTMLInputElement).value;
  Browser.storage.sync.set({
    zapurl,
    zapkey,
  });
}

// Restores options from chrome.storage.
function restoreOptions(): void {
  console.log('Options restore_options');

  Browser.storage.sync
    .get({
      zapurl: 'http://zap/',
      zapkey: 'not set',
      recordurl: 'http://',
      zaprecordingactive: false,
    })
    .then((items) => {
      (document.getElementById(ZAP_URL) as HTMLInputElement).value =
        items.zapurl;
      (document.getElementById(ZAP_KEY) as HTMLInputElement).value =
        items.zapkey;
      (document.getElementById(RECORD_URL) as HTMLInputElement).value =
        items.recordurl;
      recordingActive = items.zaprecordingactive;
    });

  Browser.storage.sync.remove('recordurl');
}

function stopRecording(): void {
  console.log('Recording stopped ...');

  const recordButton = document.getElementById(
    'record-btn'
  ) as HTMLButtonElement;
  recordButton.textContent = 'Record';
}

function startRecording(): void {
  console.log('Recording started ...');

  const recordUrl = (document.getElementById('url') as HTMLInputElement).value;

  Browser.tabs.create({url: recordUrl}).then((tab) => {
    Browser.tabs.update(tab.id, {active: true});
  });

  const recordButton = document.getElementById(
    'record-btn'
  ) as HTMLButtonElement;
  recordButton.textContent = 'Stop';
}

function toggleRecording(): void {
  if (recordingActive) {
    stopRecording();
  } else {
    startRecording();
  }
  recordingActive = !recordingActive;
}

function saveScript(): void {
  // Code to save the recorded script goes here
  console.log('Script saved');
}

function openOptionsPage(): void {
  Browser.tabs.create({url: 'options.html'}).then((tab) => {
    Browser.tabs.update(tab.id, {active: true});
  });
}

const recordButton = document.getElementById('record-btn');
const saveButton = document.getElementById('save-btn');
const configureButton = document.getElementById('configure-btn');

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save')?.addEventListener('click', saveOptions);
recordButton?.addEventListener('click', toggleRecording);
saveButton?.addEventListener('click', saveScript);
configureButton?.addEventListener('click', openOptionsPage);

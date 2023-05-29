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
import './styles.scss';

let recordingActive = false;

// Restores State from chrome.storage.
function sendMessagetoContentScript(message: string): void {
  Browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
    const activeTab = tabs[0];
    if (activeTab?.id) {
      Browser.tabs.sendMessage(activeTab.id, {type: message});
    }
  });
}

function restoreState(): void {
  console.log('Restore state');

  Browser.storage.sync
    .get({
      zaprecordingactive: false,
    })
    .then((items) => {
      recordingActive = items.zaprecordingactive;
    });

  if (recordingActive) {
    const recordButton = document.getElementById(
      'record-btn'
    ) as HTMLButtonElement;
    recordButton.textContent = 'Stop';
  }
}

function stopRecording(): void {
  console.log('Recording stopped ...');
  sendMessagetoContentScript('zapStopRecording');
  Browser.storage.sync.set({
    zaprecordingactive: false,
  });
  const recordButton = document.getElementById(
    'record-btn'
  ) as HTMLButtonElement;
  recordButton.textContent = 'Record';
}

function startRecording(): void {
  console.log('Recording started ...');
  sendMessagetoContentScript('zapStartRecording');

  Browser.storage.sync.set({
    zaprecordingactive: true,
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

function openOptionsPage(): void {
  Browser.tabs.create({url: 'options.html'}).then((tab) => {
    Browser.tabs.update(tab.id, {active: true});
  });
}

const recordButton = document.getElementById('record-btn');
const configureButton = document.getElementById('configure-btn');

document.addEventListener('DOMContentLoaded', restoreState);
recordButton?.addEventListener('click', toggleRecording);
configureButton?.addEventListener('click', openOptionsPage);

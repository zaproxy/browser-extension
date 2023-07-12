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
import i18n from './i18n';

let recordingActive = false;
const RECORD = i18n.t('Record');
const STOP = i18n.t('Stop');

function sendMessageToContentScript(message: string): void {
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
      if (recordingActive) {
        const recordButton = document.getElementById(
          'record-btn'
        ) as HTMLButtonElement;
        recordButton.textContent = STOP;
      }
    });
}

function closePopup(): void {
  setTimeout(() => {
    window.close();
  }, 500);
}

function stopRecording(): void {
  console.log('Recording stopped ...');
  sendMessageToContentScript('zapStopRecording');
  Browser.storage.sync.set({
    zaprecordingactive: false,
  });
  const recordButton = document.getElementById(
    'record-btn'
  ) as HTMLButtonElement;
  recordButton.textContent = RECORD;
  recordingActive = false;
}

function startRecording(): void {
  console.log('Recording started ...');
  sendMessageToContentScript('zapStartRecording');
  Browser.runtime.sendMessage({type: 'resetZestScript'});

  Browser.storage.sync.set({
    zaprecordingactive: true,
  });
  const recordButton = document.getElementById(
    'record-btn'
  ) as HTMLButtonElement;
  recordButton.textContent = STOP;
  recordingActive = true;
}

function toggleRecording(): void {
  if (recordingActive) {
    stopRecording();
  } else {
    closePopup();
    startRecording();
  }
}

function openOptionsPage(): void {
  Browser.tabs.create({url: 'options.html'}).then((tab) => {
    Browser.tabs.update(tab.id, {active: true});
  });
  closePopup();
}

function downloadZestScript(zestScriptJSON: string, title: string): void {
  const blob = new Blob([zestScriptJSON], {type: 'application/json'});
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${title}.zst`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);

  closePopup();
}

function handleSaveScript(): void {
  Browser.runtime.sendMessage({type: 'saveZestScript'}).then((items) => {
    downloadZestScript(items.script, items.title);
  });
}

const recordButton = document.getElementById('record-btn');
const configureButton = document.getElementById('configure-btn');
const saveScript = document.getElementById('save-script');

document.addEventListener('DOMContentLoaded', restoreState);
document.addEventListener('load', restoreState);

recordButton?.addEventListener('click', toggleRecording);
configureButton?.addEventListener('click', openOptionsPage);
saveScript?.addEventListener('click', handleSaveScript);

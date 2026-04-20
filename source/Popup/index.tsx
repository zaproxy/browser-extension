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
import './styles.scss';
import i18n from './i18n';

import {
  GET_ZEST_SCRIPT,
  IS_FULL_EXTENSION,
  RESET_ZEST_SCRIPT,
  STOP_RECORDING,
  UPDATE_TITLE,
  DAST_START_RECORDING,
  DAST_STOP_RECORDING,
} from '../utils/constants';
import {downloadJson} from '../utils/util';
import {ZestScriptMessage} from '../types/zestScript/ZestScript';

const STOP = i18n.t('stop');
const START = i18n.t('start');
const OPTIONS = i18n.t('options');
const DOWNLOAD = i18n.t('download');

const play = document.querySelector('.play');
const pause = document.querySelector('.pause');
const wave1 = document.querySelector('.record__back-1');
const wave2 = document.querySelector('.record__back-2');
const done = document.querySelector('.done');
const optionsIcon = document.querySelector('.settings') as HTMLImageElement;
const downloadIcon = document.querySelector('.download') as HTMLImageElement;
const dastIcon = document.querySelector('.dasticon') as HTMLImageElement;

const dastImageDark = './assets/icons/accuknox-logo-dark.svg';
const dastImageLight = './assets/icons/accuknox-logo.svg';

const recordButton = document.getElementById('record-btn');
const configureButton = document.getElementById('configure-btn');
const helpButton = document.getElementById('help-btn');
const saveScript = document.getElementById('save-script');
const loginUrlInput = document.getElementById(
  'login-url-input'
) as HTMLInputElement;
const scriptNameInput = document.getElementById(
  'script-name-input'
) as HTMLInputElement;

let startTab: Browser.Tabs.Tab | undefined;

function sendMessageToContentScript(message: string, data = ''): void {
  if (startTab?.id) {
    Browser.tabs.sendMessage(startTab?.id, {type: message, data});
    startTab = undefined;
  } else {
    Browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        Browser.tabs.sendMessage(activeTab.id, {type: message, data});
      }
    });
  }
}

function stoppedAnimation(): void {
  pause?.classList.add('visibility');
  play?.classList.add('visibility');
  recordButton?.classList.add('shadow');
  wave1?.classList.add('paused');
  wave2?.classList.add('paused');
  (play as HTMLImageElement).title = START;
}

function startedAnimation(): void {
  pause?.classList.remove('visibility');
  play?.classList.remove('visibility');
  recordButton?.classList.remove('shadow');
  wave1?.classList.remove('paused');
  wave2?.classList.remove('paused');
  (play as HTMLImageElement).title = STOP;
}

async function restoreState(): Promise<void> {
  console.log('Restore state');
  optionsIcon.title = OPTIONS;
  downloadIcon.title = DOWNLOAD;
  Browser.storage.sync
    .get({
      dastrecordingactive: false,
      dastscriptname: '',
    })
    .then((items) => {
      if (items.dastrecordingactive) {
        startedAnimation();
      } else {
        stoppedAnimation();
      }
      scriptNameInput.value = items.dastscriptname as string;
      if (items.dastclosewindowhandle) {
        done?.classList.remove('invisible');
      } else {
        done?.classList.add('invisible');
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
  stoppedAnimation();
  sendMessageToContentScript(DAST_STOP_RECORDING);
  Browser.runtime.sendMessage({type: STOP_RECORDING});
  Browser.storage.sync.set({
    dastrecordingactive: false,
  });
}

async function toggleRecording(e: Event): Promise<void> {
  e.preventDefault();
  const items = await Browser.storage.sync.get({dastrecordingactive: false});
  if (items.dastrecordingactive) {
    stopRecording();
    console.log('active');
    return;
  }

  const loginUrl = loginUrlInput.value;

  let targetUrl = loginUrl;
  if (!targetUrl) {
    const [activeTab] = await Browser.tabs.query({active: true, currentWindow: true});
    targetUrl = activeTab?.url ?? '';
  }

  await Browser.runtime.sendMessage({type: RESET_ZEST_SCRIPT, data: targetUrl});

  startedAnimation();
  Browser.storage.sync.set({
    initScript: true,
    loginUrl,
    startTime: loginUrl !== '' ? Date.now() : 0,
  });

  if (loginUrl !== '') {
    try {
      const tab = await Browser.tabs.create({active: false, url: loginUrl});
      startTab = tab;
      sendMessageToContentScript(DAST_START_RECORDING);
      Browser.storage.sync.set({dastrecordingactive: true});
      Browser.tabs.update(tab.id, {active: true});
      closePopup();
    } catch (error) {
      console.log(`Error: ${error}`);
    }
  } else {
    sendMessageToContentScript(DAST_START_RECORDING);
    Browser.storage.sync.set({dastrecordingactive: true});
    closePopup();
  }
}

function openOptionsPage(): void {
  Browser.tabs.create({url: 'options.html', active: true});
  closePopup();
}

function openHelpPage(): void {
  Browser.tabs.create({url: 'help.html', active: true});
  closePopup();
}

function downloadZestScript(
  zestScriptJSON: string,
  title: string,
  statementCount: number
): void {
  if (statementCount === 0) {
    return;
  }
  if (title === '') {
    scriptNameInput?.focus();
    return;
  }
  downloadJson(
    zestScriptJSON,
    title + (title.slice(-4) === '.zst' ? '' : '.zst')
  );

  Browser.runtime.sendMessage({type: RESET_ZEST_SCRIPT});
  Browser.storage.sync.set({
    dastrecordingactive: false,
  });
  closePopup();
}

async function handleSaveScript(): Promise<void> {
  const storageItems = await Browser.storage.sync.get({
    dastrecordingactive: false,
  });
  if (storageItems.dastrecordingactive) {
    sendMessageToContentScript(DAST_STOP_RECORDING);
    await Browser.runtime.sendMessage({type: STOP_RECORDING});
  }
  Browser.runtime.sendMessage({type: GET_ZEST_SCRIPT}).then((items) => {
    const msg = items as ZestScriptMessage;
    downloadZestScript(msg.script, msg.title, msg.statementCount);
  });
}

function handleScriptNameChange(e: Event): void {
  const {value} = e.target as HTMLInputElement;
  Browser.storage.sync.set({
    dastscriptname: value,
  });
  sendMessageToContentScript(UPDATE_TITLE, value);
}

document.addEventListener('DOMContentLoaded', restoreState);
document.addEventListener('load', restoreState);

recordButton?.addEventListener('click', toggleRecording);
saveScript?.addEventListener('click', handleSaveScript);
scriptNameInput?.addEventListener('input', handleScriptNameChange);

if (
  window.matchMedia &&
  window.matchMedia('(prefers-color-scheme: dark)').matches
) {
  dastIcon.src = dastImageDark;
}

window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', (e) => {
    if (e.matches) {
      dastIcon.src = dastImageDark;
    } else {
      dastIcon.src = dastImageLight;
    }
  });

if (configureButton) {
  if (IS_FULL_EXTENSION) {
    configureButton.addEventListener('click', openOptionsPage);
  } else {
    configureButton.style.visibility = 'hidden';
  }
}
if (helpButton) {
  helpButton.addEventListener('click', openHelpPage);
}

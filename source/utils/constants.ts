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

// The manifest will be undefined when running the tests
export const IS_FULL_EXTENSION =
  typeof Browser.runtime.getManifest === 'undefined' ||
  Browser.runtime.getManifest().name === 'AccuKnox DAST Browser Extension';

export const ZEST_CLIENT_SWITCH_TO_FRAME = 'ZestClientSwitchToFrame';
export const ZEST_CLIENT_ELEMENT_CLICK = 'ZestClientElementClick';
export const ZEST_CLIENT_ELEMENT_SCROLL_TO = 'ZestClientElementScrollTo';
export const ZEST_CLIENT_ELEMENT_SEND_KEYS = 'ZestClientElementSendKeys';
export const ZEST_CLIENT_ELEMENT_SUBMIT = 'ZestClientElementSubmit';
export const ZEST_CLIENT_LAUNCH = 'ZestClientLaunch';
export const ZEST_CLIENT_ELEMENT_CLEAR = 'ZestClientElementClear';
export const ZEST_CLIENT_WINDOW_CLOSE = 'ZestClientWindowClose';
export const ZEST_CLIENT_ELEMENT_MOUSE_OVER = 'ZestClientElementMouseOver';
export const ZEST_CLIENT_WAIT_FOR_MSEC = 'ZestClientWaitForMsec';
export const ZEST_COMMENT = 'ZestComment';

// Trailing wait after recording stops so the site can finish loading on replay
export const DAST_TRAILING_WAIT_MSEC = 10000;
export const DEFAULT_WINDOW_HANDLE = 'windowHandle1';

export const DAST_STOP_RECORDING = 'dastStopRecording';
export const DAST_START_RECORDING = 'dastStartRecording';
export const ZEST_SCRIPT = 'zestScript';

export const STOP_RECORDING = 'stopRecording';
export const RESET_ZEST_SCRIPT = 'resetZestScript';
export const GET_ZEST_SCRIPT = 'getZestScript';
export const UPDATE_TITLE = 'updateTitle';

export const REPORT_EVENT = 'reportEvent';
export const REPORT_OBJECT = 'reportObject';

export const LOCAL_STORAGE = 'localStorage';
export const SESSION_STORAGE = 'sessionStorage';
export const LOCAL_DAST_URL = 'localdasturl';
export const LOCAL_DAST_ENABLE = 'localdastenable';
export const LOCAL_DAST_RECORD = 'localdastrecord';
export const URL_DAST_ENABLE = 'dastenable';
export const URL_DAST_RECORD = 'dastrecord';

export const DAST_URL = 'dasturl';
export const DAST_KEY = 'dastkey';
export const DAST_ENABLE = 'dastenable';

export const DAST_FLOATING_DIV = 'DastfloatingDiv';
export const DAST_FLOATING_DIV_ELEMENTS = 'DastfloatingDivElements';

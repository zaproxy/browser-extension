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

// The manifest will be undefined when running the tests
export const IS_FULL_EXTENSION =
  typeof Browser.runtime.getManifest === 'undefined' ||
  Browser.runtime.getManifest().name === 'ZAP by Checkmarx Browser Extension';

export const ZEST_CLIENT_SWITCH_TO_FRAME = 'ZestClientSwitchToFrame';
export const ZEST_CLIENT_ELEMENT_CLICK = 'ZestClientElementClick';
export const ZEST_CLIENT_ELEMENT_SCROLL_TO = 'ZestClientElementScrollTo';
export const ZEST_CLIENT_ELEMENT_SEND_KEYS = 'ZestClientElementSendKeys';
export const ZEST_CLIENT_ELEMENT_SUBMIT = 'ZestClientElementSubmit';
export const ZEST_CLIENT_LAUNCH = 'ZestClientLaunch';
export const ZEST_CLIENT_ELEMENT_CLEAR = 'ZestClientElementClear';
export const ZEST_CLIENT_WINDOW_CLOSE = 'ZestClientWindowClose';
export const ZEST_CLIENT_ELEMENT_MOUSE_OVER = 'ZestClientElementMouseOver';
export const ZEST_COMMENT = 'ZestComment';
export const DEFAULT_WINDOW_HANDLE = 'windowHandle1';

export const ZAP_STOP_RECORDING = 'zapStopRecording';
export const ZAP_START_RECORDING = 'zapStartRecording';
export const ZEST_SCRIPT = 'zestScript';

export const STOP_RECORDING = 'stopRecording';
export const RESET_ZEST_SCRIPT = 'resetZestScript';
export const GET_ZEST_SCRIPT = 'getZestScript';
export const SET_ZEST_STATEMENTS = 'setZestStatements';
export const UPDATE_TITLE = 'updateTitle';
export const REPLAY_STATEMENT = 'replayStatement';
export const REPLAY_FINISHED = 'replayFinished';
export const REPLAY_PAUSE = 'replayPause';
export const REPLAY_NEXT = 'replayNext';
export const REPLAY_CANCEL = 'replayCancel';
export const REPLAY_ABORT = 'replayAbort';
export const REPLAY_PING = 'replayPing';
export const REFRESH_SCRIPT_VIEW = 'refreshScriptView';

// How a change to the script affects what can be undone and redone
export const HISTORY_RECORD = 'record';
export const HISTORY_UNDO = 'undo';
export const HISTORY_REDO = 'redo';
export const HISTORY_NONE = 'none';

export const REPORT_EVENT = 'reportEvent';
export const REPORT_OBJECT = 'reportObject';

export const LOCAL_STORAGE = 'localStorage';
export const SESSION_STORAGE = 'sessionStorage';
export const LOCAL_ZAP_URL = 'localzapurl';
export const LOCAL_ZAP_ENABLE = 'localzapenable';
export const LOCAL_ZAP_RECORD = 'localzaprecord';
export const LOCAL_ZAP_CONFIGURED = 'localzapconfigured';
export const URL_ZAP_ENABLE = 'zapenable';
export const URL_ZAP_RECORD = 'zaprecord';

export const ZAP_URL = 'zapurl';
export const ZAP_KEY = 'zapkey';
export const ZAP_ENABLE = 'zapenable';

export const ZAP_FLOATING_DIV = 'ZapfloatingDiv';
export const ZAP_FLOATING_DIV_ELEMENTS = 'ZapfloatingDivElements';

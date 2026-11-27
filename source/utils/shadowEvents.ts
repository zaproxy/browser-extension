/*
 * Zed Attack Proxy (ZAP) and its related source files.
 *
 * ZAP is an HTTP/HTTPS proxy for assessing web application security.
 *
 * Copyright 2026 The ZAP Development Team
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

// Shared with the script that runs in the page's world, so it must not import anything that uses
// the extension APIs (e.g. the constants).

/** Dispatched on a (connected) host when a shadow root is attached to it. */
export const SHADOW_ATTACHED_EVENT = 'zap-shadow-attached';

/** Dispatched by the recorder on a document to start the notifications of attached shadow roots. */
export const SHADOW_TRACKING_START_EVENT = 'zap-shadow-tracking-start';

/** Dispatched by the recorder on a document to stop the notifications of attached shadow roots. */
export const SHADOW_TRACKING_STOP_EVENT = 'zap-shadow-tracking-stop';

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
import {
  SHADOW_ATTACHED_EVENT,
  SHADOW_TRACKING_START_EVENT,
  SHADOW_TRACKING_STOP_EVENT,
} from '../utils/shadowEvents';

/**
 * Runs in the page's world, at document start, to be notified of the creation of shadow roots
 * (including closed ones). The recorder, in the extension's world, handles the notification and gets
 * access to the root through the extension APIs. It notifies only while recording, as started and
 * stopped by the recorder.
 */
((): void => {
  let tracking = false;
  document.addEventListener(SHADOW_TRACKING_START_EVENT, () => {
    tracking = true;
  });
  document.addEventListener(SHADOW_TRACKING_STOP_EVENT, () => {
    tracking = false;
  });

  // A proxy keeps the signature (e.g. name, length, and string) of the native function.
  Element.prototype.attachShadow = new Proxy(Element.prototype.attachShadow, {
    apply(target, host: Element, args: [ShadowRootInit]): ShadowRoot {
      const root = Reflect.apply(target, host, args);
      try {
        // Only connected hosts are notified, the others are found when they are added to the DOM.
        if (tracking && host.isConnected) {
          host.dispatchEvent(
            new CustomEvent(SHADOW_ATTACHED_EVENT, {
              bubbles: true,
              composed: true,
            })
          );
        }
      } catch {
        // Never break the page.
      }
      return root;
    },
  });
})();

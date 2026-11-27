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

/** Installs `CSS.escape`, not implemented by jsdom. */
export function installCssEscape(): void {
  (globalThis as unknown as {CSS: {escape(s: string): string}}).CSS = {
    escape: (value: string): string => value.replace(/([^\w-])/g, '\\$1'),
  };
}

/**
 * Installs, until the end of the tests of the file, the API provided to extensions by Chrome to
 * reach closed roots, it returns the roots of the hosts registered in the returned map.
 */
export function installClosedRoots(): WeakMap<Element, ShadowRoot> {
  const closedRoots = new WeakMap<Element, ShadowRoot>();
  beforeAll(() => {
    (globalThis as unknown as {chrome: unknown}).chrome = {
      dom: {
        openOrClosedShadowRoot: (e: Element): ShadowRoot | null =>
          closedRoots.get(e) ?? null,
      },
    };
  });
  afterAll(() => {
    delete (globalThis as unknown as {chrome?: unknown}).chrome;
  });
  return closedRoots;
}

/** Attaches a shadow root to the host, reachable even if closed. */
export function attachRoot(
  closedRoots: WeakMap<Element, ShadowRoot>,
  host: Element,
  mode: ShadowRootMode,
  html = ''
): ShadowRoot {
  const root = host.attachShadow({mode});
  closedRoots.set(host, root);
  root.innerHTML = html;
  return root;
}

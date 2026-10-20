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
import Browser from 'webextension-polyfill';

/**
 * Shows the tab for one of the extension's pages if it is already open,
 * otherwise opens it in a new tab. Any problem looking for an existing tab
 * (e.g. the browser not supporting the query) just results in a new tab.
 */
async function showOrCreateTab(
  page: string
): Promise<{tab: Browser.Tabs.Tab; existed: boolean}> {
  try {
    const [existing] = await Browser.tabs.query({
      url: Browser.runtime.getURL(page),
    });
    if (existing?.id !== undefined) {
      const tab = await Browser.tabs.update(existing.id, {active: true});
      if (existing.windowId !== undefined) {
        try {
          await Browser.windows.update(existing.windowId, {focused: true});
        } catch {
          // The tab is shown, it just may not be in front
        }
      }
      return {tab: tab ?? existing, existed: true};
    }
  } catch (e) {
    console.log('ZAP could not look for an existing tab', e);
  }
  return {
    tab: await Browser.tabs.create({url: page, active: true}),
    existed: false,
  };
}

/**
 * Makes sure that one of the extension's pages is open, by opening it in a tab
 * behind the current one if it is not. This never switches to the page, so the
 * user stays where they are.
 */
async function openInBackgroundIfClosed(page: string): Promise<void> {
  try {
    const [existing] = await Browser.tabs.query({
      url: Browser.runtime.getURL(page),
    });
    if (existing) {
      return;
    }
  } catch (e) {
    console.log('ZAP could not look for an existing tab', e);
  }
  await Browser.tabs.create({url: page, active: false});
}

export default showOrCreateTab;
export {openInBackgroundIfClosed};

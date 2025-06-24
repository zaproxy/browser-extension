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
import {Browser, WebDriver, Builder} from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox';
import {BaseDriver} from './BaseDriver';
import {extensionPath} from '../ContentScript/constants';

class FirefoxDriver extends BaseDriver {
  extensionId = '5f271647-ec19-47f5-bb19-d646f523c873';

  protected async getBaseExtensionUrl(): Promise<string> {
    return `moz-extension://${this.extensionId}/`;
  }

  protected async createWebDriver(): Promise<WebDriver> {
    const options = new firefox.Options()
      .addExtensions(`${extensionPath.FIREFOX}.ext.xpi`)
      .setPreference('browser.download.folderList', 2)
      .setPreference('browser.download.dir', this.downloadsDir)
      .setPreference(
        'extensions.webextensions.uuids',
        JSON.stringify({
          'browser-extensionV3@zaproxy.org': this.extensionId,
        })
      )
      .addArguments('-headless');
    const wd = (await new Builder()
      .forBrowser(Browser.FIREFOX)
      .setFirefoxOptions(options)
      .build()) as firefox.Driver;
    wd.installAddon(`${extensionPath.FIREFOX}.ext.xpi`, true);
    return wd;
  }
}

export {FirefoxDriver};

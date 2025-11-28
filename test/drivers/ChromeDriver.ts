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
import {
  Browser,
  WebDriver,
  Builder,
  By,
  Capabilities,
} from 'selenium-webdriver';
import {BaseDriver} from './BaseDriver';
import {extensionPath} from '../ContentScript/constants';

class ChromeDriver extends BaseDriver {
  extensionBaseUrl: string;

  protected async getBaseExtensionUrl(): Promise<string> {
    if (!this.extensionBaseUrl) {
      const wd = await this.getWebDriver();
      await wd.get(`chrome://serviceworker-internals/`);
      const element = await wd.findElement(
        By.css(
          '#serviceworker-list > div > div.serviceworker-item > div > div.serviceworker-scope > span.value'
        )
      );
      this.extensionBaseUrl = await element.getText();
    }
    return this.extensionBaseUrl;
  }

  protected async createWebDriver(): Promise<WebDriver> {
    const capabilities = Capabilities.chrome();
    capabilities.set('webSocketUrl', true);
    capabilities.set('goog:chromeOptions', {
      args: [
        // Needed to install the extension with BiDi.
        '--enable-unsafe-extension-debugging',
        '--remote-debugging-pipe',
        '--headless=new',
      ],
      prefs: {
        'download.default_directory': this.downloadsDir,
      },
    });
    const wd = await new Builder()
      .forBrowser(Browser.CHROME)
      .withCapabilities(capabilities)
      .build();
    (await wd.getBidi()).send({
      method: 'webExtension.install',
      params: {
        extensionData: {type: 'path', path: `${extensionPath.CHROME}-ext`},
      },
    });
    return wd;
  }
}

export {ChromeDriver};

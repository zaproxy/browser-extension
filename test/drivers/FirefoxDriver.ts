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
import {Browser, BrowserContext, firefox} from 'playwright';
import {withExtension} from 'playwright-webextext';
import {extensionPath} from '../ContentScript/constants';

class FirefoxDriver {
  browser: Browser;

  context: BrowserContext;

  extensionId: string;

  public getExtensionId(): string {
    // TODO: Find a way to get the extension ID
    return this.extensionId;
  }

  public async getBrowser(): Promise<Browser> {
    return withExtension(firefox, `${extensionPath.FIREFOX}`).launch({
      headless: false,
    });
  }

  public async grantPermission(): Promise<void> {
    const page = await this.context.newPage();
    await page.goto('about:addons');
    await page.waitForTimeout(50);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);

    for (let i = 0; i < 7; i += 1) {
      await page.keyboard.press('Tab');
    }

    await page.keyboard.press('Enter');

    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(50);
    }

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(50);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(50);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(50);
    await page.keyboard.up('ShiftLeft');
    await page.waitForTimeout(50);

    await page.keyboard.press('Enter');
    for (let i = 0; i < 2; i += 1) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(50);
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.close();
  }

  public async getContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    this.browser = await this.getBrowser();
    this.context = await this.browser.newContext();
    // TODO: add way to configure extension
    await this.grantPermission();
    return this.context;
  }

  public async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
  }

  public async getOptionsURL(): Promise<string> {
    const extensionId = this.getExtensionId();
    return `moz-extension://${extensionId}/options.html`;
  }

  public async getPopupURL(): Promise<string> {
    const extensionId = this.getExtensionId();
    return `moz-extension://${extensionId}/popup.html`;
  }

  public async setEnable(): Promise<void> {
    // TODO: to be implemented
  }

  public async toggleRecording(): Promise<void> {
    // TODO: to be implemented
  }
}

export {FirefoxDriver};

/*
 * Zed Attack Proxy (ZAP) and its related source files.
 *
 * ZAP is an HTTP/HTTPS proxy for assessing web application security.
 *
 * Copyright 2025 The ZAP Development Team
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
import {By, WebDriver} from 'selenium-webdriver';

abstract class BaseDriver {
  protected downloadsDir: string;

  driver: WebDriver;

  protected abstract getBaseExtensionUrl(): Promise<string>;
  protected abstract createWebDriver(): Promise<WebDriver>;

  constructor(downloadsDir: string) {
    this.downloadsDir = downloadsDir;
  }

  public async getWebDriver(): Promise<WebDriver> {
    if (this.driver) {
      return this.driver;
    }
    this.driver = await this.createWebDriver();
    await this.driver.manage().setTimeouts({implicit: 2000});
    return this.driver;
  }

  public async close(): Promise<void> {
    await this.driver?.quit();
  }

  private async getOptionsURL(): Promise<string> {
    const baseUrl = await this.getBaseExtensionUrl();
    return `${baseUrl}options.html`;
  }

  public async getPopupURL(): Promise<string> {
    const baseUrl = await this.getBaseExtensionUrl();
    return `${baseUrl}popup.html`;
  }

  public async configureExtension(port: number): Promise<void> {
    const wd = await this.getWebDriver();
    await wd.switchTo().newWindow('tab');
    await wd.get(await this.getOptionsURL());
    const zapurl = await wd.findElement(By.id('zapurl'));
    await zapurl.clear();
    await zapurl.sendKeys(`http://localhost:${port}/`);
    await this.setEnableAndSave(wd, false);
  }

  private async selectLatestWindow(wd: WebDriver): Promise<void> {
    const handles = await wd.getAllWindowHandles();
    await wd.switchTo().window(handles.at(handles.length > 2 ? -1 : 0));
  }

  public async setEnable(value: boolean): Promise<void> {
    const wd = await this.getWebDriver();
    await wd.switchTo().newWindow('tab');
    await wd.get(await this.getOptionsURL());
    await this.setEnableAndSave(wd, value);
  }

  private async setEnableAndSave(wd: WebDriver, value: boolean): Promise<void> {
    const zapenable = await wd.findElement(By.id('zapenable'));
    if (value !== (await zapenable.isSelected())) {
      await zapenable.click();
    }
    await wd.findElement(By.id('save')).click();
    await wd.close();
    await this.selectLatestWindow(wd);
  }

  public async toggleRecording(loginUrl = ''): Promise<void> {
    const wd = await this.getWebDriver();
    await wd.switchTo().newWindow('tab');
    await wd.get(await this.getPopupURL());
    if (loginUrl !== '') {
      await wd.findElement(By.id('login-url-input')).sendKeys(loginUrl);
    }
    await wd.findElement(By.id('record-btn')).click();
    await this.selectLatestWindow(wd);
  }
}

export {BaseDriver};

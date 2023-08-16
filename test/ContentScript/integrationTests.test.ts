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
import * as http from 'http';
import {HTTPPORT, JSONPORT, BROWSERNAME} from './constants';
import {ChromeDriver} from '../drivers/ChromeDriver';
import {FirefoxDriver} from '../drivers/FirefoxDriver';
import {getFakeZapServer, getStaticHttpServer, closeServer} from './utils';

function integrationTests(
  browserName: string,
  _HTTPPORT: number,
  _JSONPORT: number
): void {
  let server: http.Server;
  let httpServer: http.Server;
  const actualData = new Set<string>();
  let driver: ChromeDriver | FirefoxDriver;

  beforeEach(async () => {
    actualData.clear();
    if (browserName === BROWSERNAME.FIREFOX) {
      driver = new FirefoxDriver();
    } else {
      driver = new ChromeDriver();
    }
    httpServer = getStaticHttpServer();
    httpServer.listen(_HTTPPORT, () => {
      console.log(`Server listening on port ${_HTTPPORT}`);
    });
  });

  afterEach(async () => {
    await driver?.close();
    await closeServer(server);
    await closeServer(httpServer);
  });

  test('Should load extension into browser', async () => {
    // Given / When
    server = getFakeZapServer(actualData, _JSONPORT);
    const context = await driver.getContext(_JSONPORT);
    const page = await context.newPage();
    await page.goto(
      `http://localhost:${_HTTPPORT}/webpages/integrationTest.html`
    );
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.close();
    // Then
    const expectedData =
      '["{\\"action\\":{\\"action\\":\\"reportEvent\\"},\\"body\\":{\\"eventJson\\":\\"{TIMESTAMP,\\"eventName\\":\\"pageLoad\\",\\"url\\":\\"http://localhost:1801/webpages/integrationTest.html\\",\\"count\\":1}\\",\\"apikey\\":\\"not set\\"}}","{\\"action\\":{\\"action\\":\\"reportObject\\"},\\"body\\":{\\"objectJson\\":\\"{TIMESTAMP,\\"type\\":\\"nodeAdded\\",\\"tagName\\":\\"A\\",\\"id\\":\\"\\",\\"nodeName\\":\\"A\\",\\"url\\":\\"http://localhost:1801/webpages/integrationTest.html\\",\\"href\\":\\"http://localhost:1801/webpages/integrationTest.html#test\\",\\"text\\":\\"Link\\"}\\",\\"apikey\\":\\"not set\\"}}"]';
    expect(JSON.stringify(Array.from(actualData))).toBe(expectedData);
  });

  if (browserName !== BROWSERNAME.FIREFOX) {
    test('Should Disable Extension', async () => {
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/integrationTest.html`
      );
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await page.close();
      // Then
      expect(JSON.stringify(Array.from(actualData))).toBe('[]');
    });

    test('Should record click', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT, true);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/interactions.html`
      );
      await page.click('#click');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await page.close();
      // Then
      const expectedData =
        '["{\\"action\\":{\\"action\\":\\"reportZestScript\\"},\\"body\\":{\\"scriptJson\\":\\"{\\"windowHandle\\":\\"windowHandle1\\",\\"type\\":\\"id\\",\\"element\\":\\"click\\",\\"index\\":1,\\"enabled\\":true,\\"elementType\\":\\"ZestClientElementClick\\"}\\",\\"apikey\\":\\"not set\\"}}"]';
      expect(JSON.stringify(Array.from(actualData))).toBe(expectedData);
    });

    test('Should record send keys', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT, true);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/interactions.html`
      );
      await page;
      await page.fill('#input-1', 'testinput');
      await page.click('#click');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await page.close();
      // Then
      const expectedData =
        '["{\\"action\\":{\\"action\\":\\"reportZestScript\\"},\\"body\\":{\\"scriptJson\\":\\"{\\"windowHandle\\":\\"windowHandle1\\",\\"type\\":\\"id\\",\\"element\\":\\"input-1\\",\\"index\\":1,\\"enabled\\":true,\\"elementType\\":\\"ZestClientElementClear\\"}\\",\\"apikey\\":\\"not set\\"}}","{\\"action\\":{\\"action\\":\\"reportZestScript\\"},\\"body\\":{\\"scriptJson\\":\\"{\\"value\\":\\"testinput\\",\\"windowHandle\\":\\"windowHandle1\\",\\"type\\":\\"id\\",\\"element\\":\\"input-1\\",\\"index\\":2,\\"enabled\\":true,\\"elementType\\":\\"ZestClientElementSendKeys\\"}\\",\\"apikey\\":\\"not set\\"}}","{\\"action\\":{\\"action\\":\\"reportZestScript\\"},\\"body\\":{\\"scriptJson\\":\\"{\\"windowHandle\\":\\"windowHandle1\\",\\"type\\":\\"id\\",\\"element\\":\\"click\\",\\"index\\":3,\\"enabled\\":true,\\"elementType\\":\\"ZestClientElementClick\\"}\\",\\"apikey\\":\\"not set\\"}}"]';
      expect(JSON.stringify(Array.from(actualData))).toBe(expectedData);
    });

    test('Should stop recording', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT, true);
      await driver.setEnable(false);
      await driver.toggleRecording();
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/interactions.html`
      );
      await page.fill('#input-1', 'testinput');
      await page.click('#click');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await page.close();
      // Then
      expect(JSON.stringify(Array.from(actualData))).toBe('[]');
    });

    test('Should download the script', async () => {
      // Given
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT, true);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(await driver.getPopupURL());
      await page.fill('#script-name-input', 'recordedScript');
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/interactions.html`
      );
      await page.click('#click');
      await page.goto(await driver.getPopupURL());
      let actualOutcome = '';
      page.on('download', async (download) => {
        actualOutcome = download.suggestedFilename();
        await download.delete();
      });
      // When
      await page.click('#save-script');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await page.close();
      // Then
      expect(actualOutcome).toBe('recordedScript.zst');
    });

    test('Should send window handle close script when enabled', async () => {
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT, true);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(await driver.getOptionsURL());
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/interactions.html`
      );
      await page.fill('#input-1', 'testinput');
      await page.click('#click');
      await page.goto(await driver.getPopupURL());
      await page.click('#record-btn');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await page.close();
      // Then
      const expectedData =
        '["{\\"action\\":{\\"action\\":\\"reportZestScript\\"},\\"body\\":{\\"scriptJson\\":\\"{\\"windowHandle\\":\\"windowHandle1\\",\\"type\\":\\"id\\",\\"element\\":\\"input-1\\",\\"index\\":1,\\"enabled\\":true,\\"elementType\\":\\"ZestClientElementClear\\"}\\",\\"apikey\\":\\"not set\\"}}","{\\"action\\":{\\"action\\":\\"reportZestScript\\"},\\"body\\":{\\"scriptJson\\":\\"{\\"value\\":\\"testinput\\",\\"windowHandle\\":\\"windowHandle1\\",\\"type\\":\\"id\\",\\"element\\":\\"input-1\\",\\"index\\":2,\\"enabled\\":true,\\"elementType\\":\\"ZestClientElementSendKeys\\"}\\",\\"apikey\\":\\"not set\\"}}","{\\"action\\":{\\"action\\":\\"reportZestScript\\"},\\"body\\":{\\"scriptJson\\":\\"{\\"windowHandle\\":\\"windowHandle1\\",\\"type\\":\\"id\\",\\"element\\":\\"click\\",\\"index\\":3,\\"enabled\\":true,\\"elementType\\":\\"ZestClientElementClick\\"}\\",\\"apikey\\":\\"not set\\"}}","{\\"action\\":{\\"action\\":\\"reportZestScript\\"},\\"body\\":{\\"scriptJson\\":\\"{\\"windowHandle\\":\\"windowHandle1\\",\\"index\\":4,\\"sleepInSeconds\\":0,\\"enabled\\":true,\\"elementType\\":\\"ZestClientWindowClose\\"}\\",\\"apikey\\":\\"not set\\"}}"]';
      expect(JSON.stringify(Array.from(actualData))).toBe(expectedData);
    });

    test('Should configure downloaded script name', async () => {
      // Given
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT, true);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/interactions.html`
      );
      await page.click('#click');
      await page.goto(await driver.getPopupURL());
      await page.fill('#script-name-input', 'test-name');
      let actualOutcome = '';
      page.on('download', async (download) => {
        actualOutcome = download.suggestedFilename();
        await download.delete();
      });
      // When
      await page.click('#save-script');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await page.close();
      // Then
      expect(actualOutcome).toBe('test-name.zst');
    });
  }
}

describe('Chrome Integration Test', () => {
  integrationTests(BROWSERNAME.CHROME, HTTPPORT, JSONPORT);
});

describe('Firefox Integration Test', () => {
  integrationTests(BROWSERNAME.FIREFOX, HTTPPORT, JSONPORT);
});

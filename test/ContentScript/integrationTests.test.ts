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
    server = getFakeZapServer(actualData, _JSONPORT);
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
    const context = await driver.getContext(_JSONPORT);
    const page = await context.newPage();
    await page.goto(
      `http://localhost:${_HTTPPORT}/webpages/integrationTest.html`
    );
    await page.waitForLoadState('networkidle');
    await page.close();
    // Then
    expect(JSON.stringify(Array.from(actualData))).toBe(
      '["{\\"action\\":{\\"action\\":\\"reportEvent\\"},\\"body\\":{\\"eventJson\\":\\"{TIMESTAMP,\\"eventName\\":\\"pageLoad\\",\\"url\\":\\"http://localhost:1801/webpages/integrationTest.html\\",\\"count\\":1}\\",\\"apikey\\":\\"not set\\"}}","{\\"action\\":{\\"action\\":\\"reportObject\\"},\\"body\\":{\\"objectJson\\":\\"{TIMESTAMP,\\"type\\":\\"nodeAdded\\",\\"tagName\\":\\"A\\",\\"id\\":\\"\\",\\"nodeName\\":\\"A\\",\\"url\\":\\"http://localhost:1801/webpages/integrationTest.html\\",\\"href\\":\\"http://localhost:1801/webpages/integrationTest.html#test\\",\\"text\\":\\"Link\\"}\\",\\"apikey\\":\\"not set\\"}}"]'
    );
  });

  if (browserName !== BROWSERNAME.FIREFOX) {
    test('Should Disable Extension', async () => {
      const context = await driver.getContext(_JSONPORT);
      let page = await context.newPage();
      await page.goto(await driver.getOptionsURL());
      await page.uncheck('#zapenable');
      await page.click('#save');
      await page.close();

      page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/integrationTest.html`
      );
      await page.waitForLoadState('networkidle');
      await page.close();
      // Then
      expect(JSON.stringify(Array.from(actualData))).toBe('[]');
    });
  }
}

describe('Chrome Integration Test', () => {
  integrationTests(BROWSERNAME.CHROME, HTTPPORT, JSONPORT);
});

describe('Firefox Integration Test', () => {
  integrationTests(BROWSERNAME.FIREFOX, HTTPPORT, JSONPORT);
});

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
import {
  closeServer,
  getFakeZapServer,
  getStaticHttpServer,
  reportEvent,
  reportObject,
  reportZestStatementClick,
  reportZestStatementClose,
  reportZestStatementComment,
  reportZestStatementLaunch,
  reportZestStatementScrollTo,
  reportZestStatementSendKeys,
  reportZestStatementSubmit,
  reportZestStatementSwitchToFrame,
} from './utils';

const TIMEOUT = 2000;

function integrationTests(
  browserName: string,
  _HTTPPORT: number,
  _JSONPORT: number
): void {
  let server: http.Server;
  let httpServer: http.Server;
  const actualData = new Array<object>();
  let driver: ChromeDriver | FirefoxDriver;

  beforeEach(async () => {
    actualData.length = 0;
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
    server = getFakeZapServer(actualData, _JSONPORT, true);
    const context = await driver.getContext(_JSONPORT);
    const page = await context.newPage();
    await page.goto(
      `http://localhost:${_HTTPPORT}/webpages/integrationTest.html`
    );
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(TIMEOUT);
    await page.close();
    // Then
    expect(actualData).toEqual([
      reportEvent(
        'pageLoad',
        'http://localhost:1801/webpages/integrationTest.html'
      ),
      reportObject(
        'nodeAdded',
        'A',
        '',
        'A',
        'http://localhost:1801/webpages/integrationTest.html',
        'http://localhost:1801/webpages/integrationTest.html#test',
        'Link'
      ),
      reportObject(
        'localStorage',
        '',
        'localzapurl',
        '',
        'http://localhost:1801/webpages/integrationTest.html',
        undefined,
        'http://localhost:8080/'
      ),
      reportObject(
        'localStorage',
        '',
        'localzapenable',
        '',
        'http://localhost:1801/webpages/integrationTest.html',
        undefined,
        'true'
      ),
    ]);
  });

  if (browserName !== BROWSERNAME.FIREFOX) {
    test.skip('Should init script for page accessed before starting recorder', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/linkedpage3.html`
      );
      await driver.toggleRecording();
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toEqual([
        reportZestStatementComment(),
        reportZestStatementLaunch(
          'http://localhost:1801/webpages/linkedpage3.html'
        ),
      ]);
    });

    test('Should init script once for several opened pages', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT, true);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/linkedpage1.html`
      );
      await page.waitForLoadState('networkidle');
      await page.click('#click');
      await page.waitForLoadState('networkidle');
      await page.click('#click');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toEqual([
        reportZestStatementComment(),
        reportZestStatementLaunch(
          'http://localhost:1801/webpages/linkedpage1.html'
        ),
        reportZestStatementScrollTo(3, 'click'),
        reportZestStatementClick(4, 'click'),
        reportZestStatementScrollTo(5, 'click'),
        reportZestStatementClick(6, 'click'),
      ]);
    });

    test('Should Disable Extension', async () => {
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/interactions.html`
      );
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toStrictEqual([]);
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
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toEqual([
        reportZestStatementComment(),
        reportZestStatementLaunch(
          'http://localhost:1801/webpages/interactions.html'
        ),
        reportZestStatementScrollTo(3, 'click'),
        reportZestStatementClick(4, 'click'),
      ]);
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
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toEqual([
        reportZestStatementComment(),
        reportZestStatementLaunch(
          'http://localhost:1801/webpages/interactions.html'
        ),
        reportZestStatementScrollTo(3, 'input-1'),
        reportZestStatementSendKeys(4, 'input-1', 'testinput'),
        reportZestStatementScrollTo(5, 'click'),
        reportZestStatementClick(6, 'click'),
      ]);
    });

    test('Should record overwrite existing input text', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT, true);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/interactions.html`
      );
      await page;
      await page.fill('#input-3-filled', 'testinput');
      await page.click('#click');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toEqual([
        reportZestStatementComment(),
        reportZestStatementLaunch(
          'http://localhost:1801/webpages/interactions.html'
        ),
        reportZestStatementScrollTo(3, 'input-3-filled'),
        reportZestStatementSendKeys(4, 'input-3-filled', 'testinput'),
        reportZestStatementScrollTo(5, 'click'),
        reportZestStatementClick(6, 'click'),
      ]);
    });

    test('Should record inserting before existing input text', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT, true);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/interactions.html`
      );
      await page;
      const inputElement = page.locator('#input-3-filled');
      await inputElement.focus();
      // Playwright always appends to the start of a field, apparently due to browser inconsistencies
      await inputElement.type('testinput');
      await page.click('#click');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toEqual([
        reportZestStatementComment(),
        reportZestStatementLaunch(
          'http://localhost:1801/webpages/interactions.html'
        ),
        reportZestStatementScrollTo(3, 'input-3-filled'),
        reportZestStatementSendKeys(
          4,
          'input-3-filled',
          'testinputExisting text'
        ),
        reportZestStatementScrollTo(5, 'click'),
        reportZestStatementClick(6, 'click'),
      ]);
    });

    test('Should record overwrite existing input textarea', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT, true);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/interactions.html`
      );
      await page;
      await page.fill('#textarea-1', 'testinput');
      await page.click('#click');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toEqual([
        reportZestStatementComment(),
        reportZestStatementLaunch(
          'http://localhost:1801/webpages/interactions.html'
        ),
        reportZestStatementScrollTo(3, 'textarea-1'),
        reportZestStatementSendKeys(4, 'textarea-1', 'testinput'),
        reportZestStatementScrollTo(5, 'click'),
        reportZestStatementClick(6, 'click'),
      ]);
    });

    test('Should record inserting before existing input textarea', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT, true);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/interactions.html`
      );
      await page;
      const inputElement = page.locator('#textarea-1');
      await inputElement.focus();
      // Playwright always appends to the start of a field, apparently due to browser inconsistencies
      await inputElement.type('testinput');
      await page.click('#click');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toEqual([
        reportZestStatementComment(),
        reportZestStatementLaunch(
          'http://localhost:1801/webpages/interactions.html'
        ),
        reportZestStatementScrollTo(3, 'textarea-1'),
        reportZestStatementSendKeys(4, 'textarea-1', 'testinputExisting text'),
        reportZestStatementScrollTo(5, 'click'),
        reportZestStatementClick(6, 'click'),
      ]);
    });

    test('Should record option select', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT, true);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/interactions.html`
      );
      await page;
      await page.locator("//select[@id='cars']").selectOption('audi');
      await page.click('#click');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toEqual([
        reportZestStatementComment(),
        reportZestStatementLaunch(
          'http://localhost:1801/webpages/interactions.html'
        ),
        reportZestStatementScrollTo(3, 'cars'),
        reportZestStatementSendKeys(4, 'cars', 'audi'),
        reportZestStatementScrollTo(5, 'click'),
        reportZestStatementClick(6, 'click'),
      ]);
    });

    test('Should record return key', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT, true);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/interactions.html`
      );
      await page.type('#input-1', 'testinput');
      await page.keyboard.press('Enter');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toEqual([
        reportZestStatementComment(),
        reportZestStatementLaunch(
          'http://localhost:1801/webpages/interactions.html'
        ),
        reportZestStatementScrollTo(3, 'input-1'),
        reportZestStatementSendKeys(4, 'input-1', 'testinput'),
        reportZestStatementScrollTo(5, 'input-1'),
        reportZestStatementSubmit(6, 'input-1'),
      ]);
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
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toStrictEqual([]);
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
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toEqual([
        reportZestStatementComment(),
        reportZestStatementLaunch(
          'http://localhost:1801/webpages/interactions.html'
        ),
        reportZestStatementScrollTo(3, 'input-1'),
        reportZestStatementSendKeys(4, 'input-1', 'testinput'),
        reportZestStatementScrollTo(5, 'click'),
        reportZestStatementClick(6, 'click'),
        reportZestStatementClose(7),
      ]);
    });

    test('Should send window handle close script when directly pressed save script', async () => {
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
      await page.click('#save-script');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toEqual([
        reportZestStatementComment(),
        reportZestStatementLaunch(
          'http://localhost:1801/webpages/interactions.html'
        ),
        reportZestStatementScrollTo(3, 'input-1'),
        reportZestStatementSendKeys(4, 'input-1', 'testinput'),
        reportZestStatementScrollTo(5, 'click'),
        reportZestStatementClick(6, 'click'),
        reportZestStatementClose(7),
      ]);
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
      await page.close();
      // Then
      expect(actualOutcome).toBe('test-name.zst');
    });

    test('Should record frame switches', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT, true);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/interactions.html`
      );
      const frame = await page.frame('frame1');
      frame?.click('#test-btn');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toEqual([
        reportZestStatementComment(),
        reportZestStatementLaunch(
          'http://localhost:1801/webpages/interactions.html'
        ),
        reportZestStatementSwitchToFrame(3, 0, ''),
        reportZestStatementScrollTo(4, 'test-btn'),
        reportZestStatementClick(5, 'test-btn'),
      ]);
    });

    test('Should not record interactions on floating container', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT, true);
      await driver.setEnable(false);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/interactions.html`
      );
      await page.click('#ZapfloatingDiv');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toEqual([
        reportZestStatementComment(),
        reportZestStatementLaunch(
          'http://localhost:1801/webpages/interactions.html'
        ),
        reportZestStatementClose(3),
      ]);
    });

    test('Should record set localStorage', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT, true);
      const context = await driver.getContext(_JSONPORT);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/localStorage.html`
      );
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toContainEqual(
        reportObject(
          'localStorage',
          '',
          'test',
          '',
          'http://localhost:1801/webpages/localStorage.html',
          undefined,
          'localData'
        )
      );
    });

    test('Should record set sessionStorage', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/sessionStorage.html`
      );
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toContainEqual(
        reportObject(
          'sessionStorage',
          '',
          'test',
          '',
          'http://localhost:1801/webpages/sessionStorage.html',
          undefined,
          'sessionData'
        )
      );
    });

    test('Should record set localStorage with page open', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT, true);
      const context = await driver.getContext(_JSONPORT);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/localStorageDelay.html`
      );
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(TIMEOUT);
      // Then
      expect(actualData).toContainEqual(
        reportObject(
          'localStorage',
          '',
          'test',
          '',
          'http://localhost:1801/webpages/localStorageDelay.html',
          undefined,
          'localData'
        )
      );
      // Tidy up
      await page.close();
    });

    test('Should record set sessionStorage with page open', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/sessionStorageDelay.html`
      );
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(TIMEOUT);
      // Then
      expect(actualData).toContainEqual(
        reportObject(
          'sessionStorage',
          '',
          'test',
          '',
          'http://localhost:1801/webpages/sessionStorageDelay.html',
          undefined,
          'sessionData'
        )
      );
      // Tidy up
      await page.close();
    });

    test('Should record dup added link once ', async () => {
      // Given / When
      server = getFakeZapServer(actualData, _JSONPORT);
      const context = await driver.getContext(_JSONPORT);
      const page = await context.newPage();
      await page.goto(
        `http://localhost:${_HTTPPORT}/webpages/integrationTest.html`
      );
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        // eslint-disable-next-line func-names
        const addLink = function (): void {
          const aTag = document.createElement('a');
          aTag.innerHTML = 'Test link';
          aTag.href = 'https://www.example.com';
          aTag.title = 'Test link';
          document.body.appendChild(aTag);
        };
        addLink();
        addLink();
      });
      await page.waitForTimeout(TIMEOUT);
      await page.close();
      // Then
      expect(actualData).toEqual([
        reportEvent(
          'pageLoad',
          'http://localhost:1801/webpages/integrationTest.html'
        ),
        reportObject(
          'nodeAdded',
          'A',
          '',
          'A',
          'http://localhost:1801/webpages/integrationTest.html',
          'http://localhost:1801/webpages/integrationTest.html#test',
          'Link'
        ),
        reportEvent(
          'domMutation',
          'http://localhost:1801/webpages/integrationTest.html'
        ),
        reportObject(
          'nodeAdded',
          'A',
          '',
          'A',
          'http://localhost:1801/webpages/integrationTest.html',
          'https://www.example.com/',
          'Test link'
        ),
      ]);
    });
  }
}

describe('Chrome Integration Test', () => {
  integrationTests(BROWSERNAME.CHROME, HTTPPORT, JSONPORT);
});

/* Using Playwright to test Firefox extensions is proving _very_ problematic
describe('Firefox Integration Test', () => {
  integrationTests(BROWSERNAME.FIREFOX, HTTPPORT, JSONPORT);
});
*/

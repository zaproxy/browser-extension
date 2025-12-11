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
import {By, Key, until} from 'selenium-webdriver';
import {dir, DirectoryResult, setGracefulCleanup} from 'tmp-promise';
import {HTTPPORT, JSONPORT, BROWSERNAME} from './constants';
import {ZapServer} from './ZapServer';
import {BaseDriver} from '../drivers/BaseDriver';
import {ChromeDriver} from '../drivers/ChromeDriver';
import {EdgeDriver} from '../drivers/EdgeDriver';
import {FirefoxDriver} from '../drivers/FirefoxDriver';
import {
  closeServer,
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
  eventsProcessed,
  enableZapEvents,
  pageLoaded,
  focus,
  downloadScriptName,
} from './utils';

const testif = (condition: boolean): jest.It => (condition ? it : it.skip);

function integrationTests(
  browserName: string,
  _HTTPPORT: number,
  _JSONPORT: number
): void {
  let downloadsDir: DirectoryResult;
  let server: ZapServer;
  let httpServer: http.Server;
  const actualData = new Array<object>();
  let driver: BaseDriver;

  beforeEach(async () => {
    setGracefulCleanup();
    downloadsDir = await dir({
      prefix: 'zap-browser-extension',
      unsafeCleanup: true,
    });
    const downloadsDirPath = downloadsDir.path;

    actualData.length = 0;
    if (browserName === BROWSERNAME.FIREFOX) {
      driver = new FirefoxDriver(downloadsDirPath);
    } else if (browserName === BROWSERNAME.CHROME) {
      driver = new ChromeDriver(downloadsDirPath);
    } else {
      driver = new EdgeDriver(downloadsDirPath);
    }
    httpServer = getStaticHttpServer();
    httpServer.listen(_HTTPPORT, () => {});
    server = new ZapServer(actualData, _JSONPORT);
    await driver.configureExtension(_JSONPORT);
  });

  afterEach(async () => {
    await driver?.close();
    await server?.close();
    await closeServer(httpServer);
    await downloadsDir?.cleanup();
  });

  test('Should load extension into browser', async () => {
    // Given
    await enableZapEvents(server, driver);
    const wd = await driver.getWebDriver();
    // When
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/integrationTest.html`);
    await eventsProcessed();
    // Then
    expect(actualData).toEqual(
      // Firefox and Chrome get some events in different order.
      expect.arrayContaining([
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
      ])
    );
  });

  test.skip('Should init script for page accessed before starting recorder', async () => {
    // Given / When
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/linkedpage3.html`);
    await driver.toggleRecording();
    await eventsProcessed();
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
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/linkedpage1.html`);
    await pageLoaded(wd);
    await wd.findElement(By.id('click')).click();
    await pageLoaded(wd);
    await wd.findElement(By.id('click')).click();
    await eventsProcessed();
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
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    await eventsProcessed();
    // Then
    expect(actualData).toStrictEqual([]);
  });

  test('Should miss redirection', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/redirect/`);
    await eventsProcessed();
    // Then
    expect(actualData).toEqual([
      reportZestStatementComment(),
      reportZestStatementLaunch(
        'http://localhost:1801/webpages/interactions.html'
      ),
    ]);
  });

  test('Should record login URL', async () => {
    // Given / When
    await driver.toggleRecording(
      `http://localhost:${_HTTPPORT}/webpages/interactions.html`
    );
    await eventsProcessed();
    // Then
    expect(actualData).toEqual([
      reportZestStatementComment(),
      reportZestStatementLaunch(
        'http://localhost:1801/webpages/interactions.html'
      ),
    ]);
  });

  test('Should record login URL even if redirection', async () => {
    // Given / When
    await driver.toggleRecording(`http://localhost:${_HTTPPORT}/redirect/`);
    await eventsProcessed();
    // Then
    expect(actualData).toEqual([
      reportZestStatementComment(),
      reportZestStatementLaunch('http://localhost:1801/redirect/'),
    ]);
  });

  test('Should record click', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    await pageLoaded(wd);
    await wd.findElement(By.id('click')).click();
    await eventsProcessed();
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

  test('Should record click that does not bubble', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    await pageLoaded(wd);
    await wd.findElement(By.id('click-no-bubble')).click();
    await eventsProcessed();
    // Then
    expect(actualData).toEqual([
      reportZestStatementComment(),
      reportZestStatementLaunch(
        'http://localhost:1801/webpages/interactions.html'
      ),
      reportZestStatementScrollTo(3, 'click-no-bubble'),
      reportZestStatementClick(4, 'click-no-bubble'),
    ]);
  });

  test('Should record click with start URL delay', async () => {
    // Given / When
    await driver.toggleRecording(
      `http://localhost:${_HTTPPORT}/webpages/interactions.html?delay=5000`
    );
    const wd = await driver.getWebDriver();
    await pageLoaded(wd, 5500);
    await wd.findElement(By.id('click')).click();
    await eventsProcessed();
    // Then
    expect(actualData).toEqual([
      reportZestStatementComment(),
      reportZestStatementLaunch(
        'http://localhost:1801/webpages/interactions.html?delay=5000'
      ),
      reportZestStatementScrollTo(3, 'click', 'id', 10000),
      reportZestStatementClick(4, 'click', 'id', 10000),
    ]);
  });

  test('Should record send keys', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    await pageLoaded(wd);
    await wd.findElement(By.id('input-1')).sendKeys('testinput');
    await wd.findElement(By.id('click')).click();
    await eventsProcessed();
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

  test('Should record send keys waiting enough', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    await pageLoaded(wd);
    await wd.findElement(By.id('click')).click();
    await eventsProcessed(5000);
    await wd.findElement(By.id('input-1')).sendKeys('testinput');
    await wd.findElement(By.id('click')).click();
    await eventsProcessed();
    // Then
    expect(actualData).toEqual([
      reportZestStatementComment(),
      reportZestStatementLaunch(
        'http://localhost:1801/webpages/interactions.html'
      ),
      reportZestStatementScrollTo(3, 'click'),
      reportZestStatementClick(4, 'click'),
      reportZestStatementScrollTo(5, 'input-1', 'id', 10000),
      reportZestStatementSendKeys(6, 'input-1', 'testinput', 'id', 10000),
      reportZestStatementScrollTo(7, 'click'),
      reportZestStatementClick(8, 'click'),
    ]);
  });

  test('Should record appending existing input text', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    await wd.findElement(By.id('input-3-filled')).sendKeys('testinput');
    await wd.findElement(By.id('click')).click();
    await eventsProcessed();
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
        'Existing texttestinput'
      ),
      reportZestStatementScrollTo(5, 'click'),
      reportZestStatementClick(6, 'click'),
    ]);
  });

  test('Should record inserting before existing input text', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    const inputElement = await wd.findElement(By.id('input-3-filled'));
    await focus(wd, inputElement);
    await inputElement.sendKeys('testinput');
    await wd.findElement(By.id('click')).click();
    await eventsProcessed();
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

  test('Should record appending existing input textarea', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    await wd.findElement(By.id('textarea-1')).sendKeys('testinput');
    await wd.findElement(By.id('click')).click();
    await eventsProcessed();
    // Then
    expect(actualData).toEqual([
      reportZestStatementComment(),
      reportZestStatementLaunch(
        'http://localhost:1801/webpages/interactions.html'
      ),
      reportZestStatementScrollTo(3, 'textarea-1'),
      reportZestStatementSendKeys(4, 'textarea-1', 'Existing texttestinput'),
      reportZestStatementScrollTo(5, 'click'),
      reportZestStatementClick(6, 'click'),
    ]);
  });

  test('Should record inserting before existing input textarea', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    const inputElement = await wd.findElement(By.id('textarea-1'));
    await focus(wd, inputElement);
    await inputElement.sendKeys('testinput');
    await wd.findElement(By.id('click')).click();
    await eventsProcessed();
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
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    await pageLoaded(wd);
    await wd.findElement(By.id('cars')).sendKeys('audi');
    await wd.findElement(By.id('click')).click();
    await eventsProcessed();
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
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    const input1 = await wd.findElement(By.id('input-1'));
    await input1.sendKeys('testinput');
    await input1.sendKeys(Key.ENTER);
    await eventsProcessed();
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
    // Given
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    // When
    await driver.toggleRecording();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    await wd.findElement(By.id('input-1')).sendKeys('testinput');
    await wd.findElement(By.id('click')).click();
    await eventsProcessed();
    // Then
    expect(actualData).toStrictEqual([]);
  });

  test('Should download the script', async () => {
    // Given
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(await driver.getPopupURL());
    await wd.findElement(By.id('script-name-input')).sendKeys('recordedScript');
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    await wd.findElement(By.id('click')).click();
    await wd.get(await driver.getPopupURL());
    await wd.findElement(By.id('save-script')).click();
    // When
    await eventsProcessed();
    // Then
    expect(downloadScriptName(downloadsDir.path)).toBe('recordedScript.zst');
  });

  test('Should send window handle close script when enabled', async () => {
    // Given
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    await wd.findElement(By.id('input-1')).sendKeys('testinput');
    await wd.findElement(By.id('click')).click();
    // When
    await wd.get(await driver.getPopupURL());
    await wd.findElement(By.id('record-btn')).click();
    await eventsProcessed();
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
    // Given
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    await wd.findElement(By.id('input-1')).sendKeys('testinput');
    await wd.findElement(By.id('click')).click();
    // When
    await wd.get(await driver.getPopupURL());
    await wd.findElement(By.id('save-script')).click();
    await eventsProcessed();
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
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    await wd.findElement(By.id('click')).click();
    await eventsProcessed();
    await wd.get(await driver.getPopupURL());
    await wd.findElement(By.id('script-name-input')).sendKeys('test-name');
    await wd.findElement(By.id('save-script')).click();
    // When
    await eventsProcessed();
    // Then
    expect(downloadScriptName(downloadsDir.path)).toBe('test-name.zst');
  });

  test('Should record frame switches', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    await wd.switchTo().frame('frame1');
    wd.findElement(By.id('test-btn')).click();
    await eventsProcessed();
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

  test('Should record frame submitted elements', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/frameset.html`);
    await wd.switchTo().frame(0);
    await wd.findElement(By.id('btn')).click();
    const inputA = await wd.findElement(By.xpath('/html/body/div[2]/input'));
    await inputA.sendKeys('value');
    await inputA.sendKeys(Key.ENTER);
    await eventsProcessed();
    // Then
    expect(actualData).toEqual([
      reportZestStatementComment(),
      reportZestStatementLaunch('http://localhost:1801/webpages/frameset.html'),
      reportZestStatementSwitchToFrame(3, 0, ''),
      reportZestStatementScrollTo(4, 'btn'),
      reportZestStatementClick(5, 'btn'),
      reportZestStatementScrollTo(6, 'body > div > input', 'cssSelector'),
      reportZestStatementSendKeys(
        7,
        'body > div > input',
        'value',
        'cssSelector'
      ),
      reportZestStatementScrollTo(8, 'body > div > input', 'cssSelector'),
      reportZestStatementSubmit(9, 'body > div > input', 'cssSelector'),
    ]);
  });

  test('Should record frame interactions on delayed loaded frame', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/framesetDelay.html`);
    await wd.wait(until.ableToSwitchToFrame(0));
    await wd.wait(until.elementLocated(By.id('btn'))).click();
    await eventsProcessed();
    // Then
    expect(actualData).toEqual([
      reportZestStatementComment(),
      reportZestStatementLaunch(
        'http://localhost:1801/webpages/framesetDelay.html'
      ),
      reportZestStatementSwitchToFrame(3, 0, ''),
      reportZestStatementScrollTo(4, 'btn'),
      reportZestStatementClick(5, 'btn'),
    ]);
  });

  test('Should record frame interactions on replaced frame', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/framesetReplace.html`);
    await wd.wait(until.ableToSwitchToFrame(0));
    await wd.wait(until.elementLocated(By.id('btn'))).click();
    await wd.wait(until.elementLocated(By.id('click'))).click();
    await eventsProcessed();
    // Then
    expect(actualData).toEqual([
      reportZestStatementComment(),
      reportZestStatementLaunch(
        'http://localhost:1801/webpages/framesetReplace.html'
      ),
      reportZestStatementSwitchToFrame(3, 0, ''),
      reportZestStatementScrollTo(4, 'btn'),
      reportZestStatementClick(5, 'btn'),
      reportZestStatementScrollTo(6, 'click'),
      reportZestStatementClick(7, 'click'),
    ]);
  });

  test('Should not record interactions on floating container', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/interactions.html`);
    await wd.findElement(By.id('ZapfloatingDiv')).click();
    await eventsProcessed();
    // Then
    expect(actualData).toEqual([
      reportZestStatementComment(),
      reportZestStatementLaunch(
        'http://localhost:1801/webpages/interactions.html'
      ),
      reportZestStatementClose(3),
    ]);
  });

  test('Should not record interactions on hidden element', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/hiddenElement.html`);
    await eventsProcessed();
    await wd.findElement(By.id('visibleButton')).click();
    await eventsProcessed();
    // Then
    expect(actualData).toEqual([
      reportZestStatementComment(),
      reportZestStatementLaunch(
        'http://localhost:1801/webpages/hiddenElement.html'
      ),
      reportZestStatementScrollTo(3, 'visibleButton'),
      reportZestStatementClick(4, 'visibleButton'),
      reportZestStatementScrollTo(5, 'visibleCheckBox'),
      reportZestStatementClick(6, 'visibleCheckBox'),
      reportZestStatementScrollTo(7, 'visibleCheckBox'),
      reportZestStatementSendKeys(8, 'visibleCheckBox', 'on', 'id'),
    ]);
  });

  test('Should record set localStorage', async () => {
    // Given
    await enableZapEvents(server, driver);
    const wd = await driver.getWebDriver();
    // When
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/localStorage.html`);
    await eventsProcessed();
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
    // Given
    await enableZapEvents(server, driver);
    const wd = await driver.getWebDriver();
    // When
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/sessionStorage.html`);
    await eventsProcessed();
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
    // Given
    await enableZapEvents(server, driver);
    const wd = await driver.getWebDriver();
    // When
    await wd.get(
      `http://localhost:${_HTTPPORT}/webpages/localStorageDelay.html`
    );
    await eventsProcessed();
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
  });

  test('Should record set sessionStorage with page open', async () => {
    // Given
    await enableZapEvents(server, driver);
    const wd = await driver.getWebDriver();
    // When
    await wd.get(
      `http://localhost:${_HTTPPORT}/webpages/sessionStorageDelay.html`
    );
    await eventsProcessed();
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
  });

  test('Should record dup added link once', async () => {
    // Given
    await enableZapEvents(server, driver);
    server.setRecordZapEvents(false);
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/integrationTest.html`);
    await pageLoaded(wd);
    // When
    await wd.executeScript(() => {
      const addLink = (): void => {
        const aTag = document.createElement('a');
        aTag.innerHTML = 'Test link';
        aTag.href = 'https://www.example.com';
        aTag.title = 'Test link';
        document.body.appendChild(aTag);
      };
      addLink();
      addLink();
    });
    await wd.wait(until.elementLocated(By.xpath('//a[3]')));
    await eventsProcessed();
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

  test('Should ignore ZAP div', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/divtest.html`);
    await pageLoaded(wd);
    await wd.findElement(By.id('btn')).click();
    await eventsProcessed();
    await wd.findElement(By.xpath('/html/body/div[3]/button')).click();
    await eventsProcessed();
    await wd.findElement(By.xpath('/html/body/div[3]/span[1]')).click();
    await eventsProcessed();
    // Then
    expect(actualData).toEqual([
      reportZestStatementComment(),
      reportZestStatementLaunch('http://localhost:1801/webpages/divtest.html'),
      reportZestStatementScrollTo(3, 'btn'),
      reportZestStatementClick(4, 'btn'),
      reportZestStatementScrollTo(
        5,
        '/html/body/div[2]/button',
        'xpath',
        10000
      ),
      reportZestStatementClick(6, '/html/body/div[2]/button', 'xpath', 10000),
      reportZestStatementScrollTo(
        7,
        '/html/body/div[2]/span[1]',
        'xpath',
        10000
      ),
      reportZestStatementClick(8, '/html/body/div[2]/span[1]', 'xpath', 10000),
    ]);
  });

  test('Should insert ZAP div after frameset', async () => {
    // Given / When
    await driver.toggleRecording();
    const wd = await driver.getWebDriver();
    await wd.get(`http://localhost:${_HTTPPORT}/webpages/frameset.html`);
    await pageLoaded(wd);
    await wd.findElement(By.xpath('/html/div/button')).click();
    await eventsProcessed();
    // Then
    expect(actualData).toEqual([
      reportZestStatementComment(),
      reportZestStatementLaunch('http://localhost:1801/webpages/frameset.html'),
      reportZestStatementClose(3),
    ]);
  });

  testif(browserName === BROWSERNAME.FIREFOX)(
    'Should open help from popup',
    async () => {
      // Given / When
      const wd = await driver.getWebDriver();
      await wd.get(await driver.getPopupURL());
      await wd.findElement(By.id('help-btn')).click();
      await eventsProcessed();
      await wd.switchTo().window((await wd.getAllWindowHandles())[0]);
      // Then
      expect(await wd.getPageSource()).toContain('Summary');
    }
  );
}

describe('Chrome Integration Test', () => {
  integrationTests(BROWSERNAME.CHROME, HTTPPORT, JSONPORT);
});

describe('Edge Integration Test', () => {
  integrationTests(BROWSERNAME.EDGE, HTTPPORT, JSONPORT);
});

describe('Firefox Integration Test', () => {
  integrationTests(BROWSERNAME.FIREFOX, HTTPPORT, JSONPORT);
});

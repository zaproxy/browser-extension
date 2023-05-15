import {Browser, BrowserContext} from 'playwright';
import * as http from 'http';
import {HTTPPORT, JSONPORT, BROWSERNAME} from './constants';
import {
  getFakeZapServer,
  getStaticHttpServer,
  closeServer,
  getContextForChrome,
  getFirefoxBrowser,
  grantPermissionFirefox,
} from './utils';

function integrationTests(
  browserName: string,
  _HTTPPORT: number,
  _JSONPORT: number
): void {
  let server: http.Server;
  let httpServer: http.Server;
  const actualData = new Set<string>();
  let context: BrowserContext;
  let browser: Browser;

  beforeAll(async () => {
    actualData.clear();
    if (browserName === BROWSERNAME.FIREFOX) {
      browser = await getFirefoxBrowser();
      context = await browser.newContext();
      await grantPermissionFirefox(context);
    } else {
      context = await getContextForChrome(_JSONPORT);
    }
    server = getFakeZapServer(actualData, _JSONPORT);
    httpServer = getStaticHttpServer();
    httpServer.listen(_HTTPPORT, () => {
      console.log(`Server listening on port ${_HTTPPORT}`);
    });
  });

  afterAll(async () => {
    await context?.close();
    await browser?.close();
    await closeServer(server);
    await closeServer(httpServer);
  });

  test('Should load extension into browser', async () => {
    // Given / When
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
}

describe('Chrome Integration Test', () => {
  integrationTests(BROWSERNAME.CHROME, HTTPPORT, JSONPORT);
});

describe('Firefox Integration Test', () => {
  integrationTests(BROWSERNAME.FIREFOX, HTTPPORT, JSONPORT);
});

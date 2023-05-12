import {Browser, BrowserContext, firefox} from 'playwright';
import {withExtension} from 'playwright-webextext';
import path from 'path';
import {Request, Response} from 'express';
import JsonServer from 'json-server';
import * as http from 'http';
import fs from 'fs';

describe('Firefox Integration Test', () => {
  let server: http.Server;
  let httpServer: http.Server;
  let actualData: string[];
  let context: BrowserContext;
  let browser: Browser;
  const HTTPPORT = 1801;
  const JSONPORT = 8080;

  function getFakeZapServer(): http.Server {
    const app = JsonServer.create();

    app.use(JsonServer.bodyParser);
    app.post('/JSON/client/action/:action', (req: Request, res: Response) => {
      const {action} = req.params;
      console.log(action);
      actualData.push(action);
      res.sendStatus(200);
    });

    return app.listen(JSONPORT, () => {
      console.log(`JSON Server listening on port ${JSONPORT}`);
    });
  }

  function getStaticHttpServer(): http.Server {
    return http.createServer((request, response) => {
      const url = `${request.url}`;
      const filePath = path.join(__dirname, url);

      fs.promises
        .access(filePath, fs.constants.F_OK)
        .then(() => {
          const fileStream = fs.createReadStream(filePath);
          response.writeHead(200, {'Content-Type': 'text/html'});
          fileStream.pipe(response);
        })
        .catch((err: NodeJS.ErrnoException | null) => {
          response.writeHead(404, {'Content-Type': 'text/plain'});
          response.end(`Error : ${err}`);
        });
    });
  }

  async function closeServer(_server: http.Server): Promise<void> {
    return new Promise((resolve) => {
      _server.close(() => {
        console.log('Server closed');
        resolve();
      });
    });
  }

  beforeAll(async () => {
    actualData = [];
    const extensionPath = path.join(
      __dirname,
      '..',
      '..',
      'extension',
      'firefox.xpi'
    );
    browser = await withExtension(firefox, `${extensionPath}`).launch({
      // headless: false,
    });
    context = await browser.newContext();
    server = getFakeZapServer();
    httpServer = getStaticHttpServer();
    httpServer.listen(HTTPPORT, () => {
      console.log(`Server listening on port ${HTTPPORT}`);
    });
  });

  afterAll(async () => {
    if (context) {
      await context.close();
    }
    if (browser) {
      await browser.close();
    }
    if (server) {
      await closeServer(server);
    }
    if (httpServer) {
      await closeServer(httpServer);
    }
  });

  test('Integration Test', async () => {
    // Given / When
    const page = await context.newPage();
    await page.goto(
      `http://localhost:${HTTPPORT}/webpages/integrationTest.html`
    );
    // await page.click('#click');
    await page.waitForLoadState('networkidle');
    await page.close();
    // Then
    expect(JSON.stringify(actualData)).toBe(
      '["{\\"action\\":{\\"action\\":\\"reportEvent\\"},\\"body\\":{\\"eventJson\\":\\"{TIMESTAMP,\\"eventName\\":\\"pageLoad\\",\\"url\\":\\"http://localhost:1801/webpages/integrationTest.html\\",\\"count\\":1}\\",\\"apikey\\":\\"not set\\"}}","{\\"action\\":{\\"action\\":\\"reportObject\\"},\\"body\\":{\\"objectJson\\":\\"{TIMESTAMP,\\"type\\":\\"nodeAdded\\",\\"tagName\\":\\"A\\",\\"id\\":\\"\\",\\"nodeName\\":\\"A\\",\\"url\\":\\"http://localhost:1801/webpages/integrationTest.html\\",\\"href\\":\\"http://localhost:1801/webpages/integrationTest.html#test\\",\\"text\\":\\"Link\\"}\\",\\"apikey\\":\\"not set\\"}}","{\\"action\\":{\\"action\\":\\"reportEvent\\"},\\"body\\":{\\"eventJson\\":\\"{TIMESTAMP,\\"eventName\\":\\"pageLoad\\",\\"url\\":\\"http://localhost:1801/webpages/integrationTest.html\\",\\"count\\":1}\\",\\"apikey\\":\\"not set\\"}}","{\\"action\\":{\\"action\\":\\"reportObject\\"},\\"body\\":{\\"objectJson\\":\\"{TIMESTAMP,\\"type\\":\\"nodeAdded\\",\\"tagName\\":\\"A\\",\\"id\\":\\"\\",\\"nodeName\\":\\"A\\",\\"url\\":\\"http://localhost:1801/webpages/integrationTest.html\\",\\"href\\":\\"http://localhost:1801/webpages/integrationTest.html#test\\",\\"text\\":\\"Link\\"}\\",\\"apikey\\":\\"not set\\"}}"]'
    );
  });
});

import {Builder, WebDriver} from 'selenium-webdriver';
import * as chrome from 'selenium-webdriver/chrome';
import path from 'path';
import {Request, Response} from 'express';
import JsonServer from 'json-server';
import * as http from 'http';
import fs from 'fs';

describe('Chrome Integration Test', () => {
  let server: http.Server;
  let httpServer: http.Server;
  const actualData = new Set<string>();
  const HTTPPORT = 1801;
  const JSONPORT = 8080;
  let driver: WebDriver;

  function getFakeZapServer(): http.Server {
    const app = JsonServer.create();

    app.use(JsonServer.bodyParser);
    app.post('/JSON/client/action/:action', (req: Request, res: Response) => {
      const action = req.params;
      const {body} = req;
      const msg = JSON.stringify({action, body});
      actualData.add(
        msg.replace(/\\"timestamp\\":\d+/g, 'TIMESTAMP').replace(/[\\]/g, '')
      );
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

  const waitForNetworkIdle = (timeout: number): Promise<string> =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolve('');
      }, timeout);
    });

  beforeAll(async () => {
    actualData.clear();
    const extensionPath = path.join(
      __dirname,
      '..',
      '..',
      'extension',
      'chrome.zip'
    );
    const chromeOptions = new chrome.Options();
    chromeOptions.addExtensions([extensionPath]);
    chromeOptions.addArguments('--headless=new');

    driver = new Builder().withCapabilities(chromeOptions).build();
    server = getFakeZapServer();
    httpServer = getStaticHttpServer();
    httpServer.listen(HTTPPORT, () => {
      console.log(`Server listening on port ${HTTPPORT}`);
    });
  });

  test('Integration Test', async () => {
    // Given / When
    await driver.get(
      `http://localhost:${HTTPPORT}/webpages/integrationTest.html`
    );
    await waitForNetworkIdle(500);
    // Then
    expect(JSON.stringify(Array.from(actualData))).toBe(
      '["{\\"action\\":{\\"action\\":\\"reportEvent\\"},\\"body\\":{\\"eventJson\\":\\"{TIMESTAMP,\\"eventName\\":\\"pageLoad\\",\\"url\\":\\"http://localhost:1801/webpages/integrationTest.html\\",\\"count\\":1}\\",\\"apikey\\":\\"not set\\"}}","{\\"action\\":{\\"action\\":\\"reportObject\\"},\\"body\\":{\\"objectJson\\":\\"{TIMESTAMP,\\"type\\":\\"nodeAdded\\",\\"tagName\\":\\"A\\",\\"id\\":\\"\\",\\"nodeName\\":\\"A\\",\\"url\\":\\"http://localhost:1801/webpages/integrationTest.html\\",\\"href\\":\\"http://localhost:1801/webpages/integrationTest.html#test\\",\\"text\\":\\"Link\\"}\\",\\"apikey\\":\\"not set\\"}}"]'
    );
  }, 10000);

  afterAll(async () => {
    if (driver) {
      driver.quit();
    }
    if (server) {
      await closeServer(server);
    }
    if (httpServer) {
      await closeServer(httpServer);
    }
  });
});

/*
 * Zed Attack Proxy (ZAP) and its related source files.
 *
 * ZAP is an HTTP/HTTPS proxy for assessing web application security.
 *
 * Copyright 2022 The ZAP Development Team
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
import http from 'http';
import fs from 'fs';
import path from 'path';
import {BrowserContext, chromium, firefox, Browser} from 'playwright';
import {Request, Response} from 'express';
import JsonServer from 'json-server';
import {withExtension} from 'playwright-webextext';
import {extensionPath} from './constants';

export function getStaticHttpServer(): http.Server {
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

export async function getChromeExtensionId(
  _context: BrowserContext
): Promise<string> {
  let [background] = _context.serviceWorkers();
  if (!background) background = await _context.waitForEvent('serviceworker');
  return background.url().split('/')[2];
}

export async function getContextForChrome(
  JSONPORT: number
): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext('', {
    args: [
      `--headless=new`,
      `--disable-extensions-except=${extensionPath.CHROME}`,
      `--load-extension=${extensionPath.CHROME}`,
    ],
  });
  const extensionId = await getChromeExtensionId(context);
  const backgroundPage = await context.newPage();
  await backgroundPage.goto(`chrome-extension://${extensionId}/options.html`);
  await backgroundPage.fill('#zapurl', `http://localhost:${JSONPORT}/`);
  await backgroundPage.click('#save');
  await backgroundPage.close();
  return context;
}

export function getFakeZapServer(
  actualData: Set<string>,
  JSONPORT: number
): http.Server {
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

export async function closeServer(_server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    _server.close(() => {
      console.log('Server closed');
      resolve();
    });
  });
}

export async function getFirefoxBrowser(): Promise<Browser> {
  return withExtension(firefox, `${extensionPath.FIREFOX}`).launch({
    headless: false,
  });
}

export async function grantPermissionFirefox(
  _context: BrowserContext
): Promise<void> {
  const page = await _context.newPage();
  await page.goto('about:addons');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');

  for (let i = 0; i < 7; i += 1) {
    await page.keyboard.press('Tab');
  }

  await page.keyboard.press('Enter');

  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);
  }

  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.close();
}

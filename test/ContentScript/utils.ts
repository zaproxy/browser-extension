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
import http from 'http';
import fs, {readdirSync} from 'fs';
import path from 'path';
import {WebDriver, WebElement} from 'selenium-webdriver';
import {ZapServer} from './ZapServer';
import {BaseDriver} from '../drivers/BaseDriver';

const TIMEOUT = 2000;

function streamResponse(
  filePath: string,
  response: http.ServerResponse<http.IncomingMessage>
): void {
  const fileStream = fs.createReadStream(filePath);
  response.writeHead(200, {'Content-Type': 'text/html'});
  fileStream.pipe(response);
}

export function getStaticHttpServer(): http.Server {
  return http.createServer((request, response) => {
    const baseUrl = new URL(`http://localhost${request.url}`);
    const url = baseUrl.pathname;

    if (url.startsWith('/redirect/')) {
      response.writeHead(302, {Location: '/webpages/interactions.html'});
      response.end();
      return;
    }

    const filePath = path.join(__dirname, url);

    fs.promises
      .access(filePath, fs.constants.F_OK)
      .then(() => {
        let delay = 0;
        if (baseUrl.searchParams.has('delay')) {
          delay = Number(baseUrl.searchParams.get('delay')) || 1000;
        }
        setTimeout((): void => {
          streamResponse(filePath, response);
        }, delay);
      })
      .catch((err: NodeJS.ErrnoException | null) => {
        response.writeHead(404, {'Content-Type': 'text/plain'});
        response.end(`Error : ${err}`);
      });
  });
}

export function reportEvent(eventName: string, url: string): object {
  const data = {
    action: {action: 'reportEvent'},
    body: {
      eventJson: {
        timestamp: 'TIMESTAMP',
        eventName,
        url,
        count: 1,
      },
      apikey: 'not set',
    },
  };
  return data;
}

export function reportObject(
  type: string,
  tagName: string,
  id: string,
  nodeName: string,
  url: string,
  href: string | undefined,
  text: string,
  ariaIdentification?: Record<string, string>
): object {
  const data = {
    action: {action: 'reportObject'},
    body: {
      objectJson: {
        timestamp: 'TIMESTAMP',
        type,
        tagName,
        id,
        nodeName,
        url,
        href,
        text,
        ariaIdentification,
      },
      apikey: 'not set',
    },
  };
  if (href === undefined) {
    delete data.body.objectJson.href;
  }
  if (ariaIdentification === undefined) {
    delete data.body.objectJson.ariaIdentification;
  }
  return data;
}

export function reportZestStatementComment(): object {
  const data = {
    action: {
      action: 'reportZestStatement',
    },
    body: {
      statementJson: {
        index: 1,
        enabled: true,
        elementType: 'ZestComment',
        comment: 'Recorded by comment',
      },
      apikey: 'not set',
    },
  };
  return data;
}

export function reportZestStatementLaunch(url: string): object {
  const data = {
    action: {action: 'reportZestStatement'},
    body: {
      statementJson: {
        windowHandle: 'windowHandle1',
        browserType: 'browser',
        url,
        capabilities: '',
        headless: false,
        index: 2,
        enabled: true,
        elementType: 'ZestClientLaunch',
      },
      apikey: 'not set',
    },
  };
  return data;
}

export function reportZestStatementClose(index: number): object {
  const data = {
    action: {action: 'reportZestStatement'},
    body: {
      statementJson: {
        windowHandle: 'windowHandle1',
        index,
        sleepInSeconds: 0,
        enabled: true,
        elementType: 'ZestClientWindowClose',
      },
      apikey: 'not set',
    },
  };
  return data;
}

function reportZestStatement(
  index: number,
  elementType: string,
  element: string,
  value: string | undefined = undefined,
  statementType = 'id',
  wait = 5000
): object {
  const data = {
    action: {action: 'reportZestStatement'},
    body: {
      statementJson: {
        windowHandle: 'windowHandle1',
        type: statementType,
        element,
        index,
        waitForMsec: wait,
        enabled: true,
        elementType,
        value,
      },
      apikey: 'not set',
    },
  };
  if (value === undefined) {
    delete data.body.statementJson.value;
  }
  return data;
}

export function reportZestStatementScrollTo(
  index: number,
  element: string,
  statementType = 'id',
  wait = 5000
): object {
  return reportZestStatement(
    index,
    'ZestClientElementScrollTo',
    element,
    undefined,
    statementType,
    wait
  );
}

export function reportZestStatementClick(
  index: number,
  element: string,
  statementType = 'id',
  wait = 5000
): object {
  return reportZestStatement(
    index,
    'ZestClientElementClick',
    element,
    undefined,
    statementType,
    wait
  );
}

export function reportZestStatementSubmit(
  index: number,
  element: string,
  statementType = 'id',
  wait = 5000
): object {
  return reportZestStatement(
    index,
    'ZestClientElementSubmit',
    element,
    undefined,
    statementType,
    wait
  );
}

export function reportZestStatementSendKeys(
  index: number,
  element: string,
  value: string,
  statementType = 'id',
  wait = 5000
): object {
  return reportZestStatement(
    index,
    'ZestClientElementSendKeys',
    element,
    value,
    statementType,
    wait
  );
}

export function reportZestStatementSwitchToFrame(
  index: number,
  frameIndex: number,
  frameName: string
): object {
  const data = {
    action: {
      action: 'reportZestStatement',
    },
    body: {
      statementJson: {
        windowHandle: 'windowHandle1',
        frameIndex,
        frameName,
        parent: false,
        index,
        enabled: true,
        elementType: 'ZestClientSwitchToFrame',
      },
      apikey: 'not set',
    },
  };
  return data;
}

export async function eventsProcessed(delay = TIMEOUT): Promise<void> {
  return new Promise((f) => {
    setTimeout(f, delay);
  });
}

export async function pageLoaded(
  wd: WebDriver,
  timeout = TIMEOUT
): Promise<void> {
  await wd.wait(
    () => wd.executeScript('return document.readyState == "complete"'),
    timeout
  );
}

export async function focus(wd: WebDriver, element: WebElement): Promise<void> {
  await wd.executeScript('arguments[0].focus();', element);
}

export async function enableZapEvents(
  server: ZapServer,
  driver: BaseDriver
): Promise<void> {
  server.setRecordZapEvents(true);
  await driver.setEnable(true);
}

export async function closeServer(_server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    _server.close(() => {
      resolve();
    });
  });
}

export function downloadScriptName(dir: string): string {
  return readdirSync(dir, {withFileTypes: true}).filter(
    (item) => !item.isDirectory()
  )[0].name;
}

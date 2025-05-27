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
import fs from 'fs';
import path from 'path';
import {Request, Response} from 'express';
import JsonServer from 'json-server';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getInsertPosition(body: any, actualData: Array<object>): number {
  const statementJson = body?.statementJson;
  if (statementJson) {
    const index = JSON.parse(statementJson)?.index;
    if (index) {
      return index - 1;
    }
  }
  return actualData.length;
}

function toJsonWithoutDynamicValues(value: string): string {
  return JSON.parse(
    value
      .replace(/timestamp":\d+/g, 'timestamp": "TIMESTAMP"')
      .replace(/Recorded by [^\\]+?"/g, 'Recorded by comment"')
      .replace(/browserType":"[^\\]+?"/g, 'browserType":"browser"')
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeJson(body: any): any {
  ['eventJson', 'statementJson', 'objectJson'].forEach((name) => {
    const value = body[name];
    if (value) {
      body[name] = toJsonWithoutDynamicValues(value);
    }
  });
  return body;
}

export function getFakeZapServer(
  actualData: Array<object>,
  JSONPORT: number,
  incZapEvents = false
): http.Server {
  const app = JsonServer.create();

  app.use(JsonServer.bodyParser);
  app.post('/JSON/client/action/:action', (req: Request, res: Response) => {
    const action = req.params;
    const {body} = req;
    const msg = JSON.stringify({action, body});
    if (incZapEvents || msg.indexOf('localzap') === -1) {
      // Ignore localzap events
      actualData[getInsertPosition(body, actualData)] = {
        action,
        body: normalizeJson(body),
      };
    }
    res.sendStatus(200);
  });

  return app.listen(JSONPORT, () => {
    console.log(`JSON Server listening on port ${JSONPORT}`);
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
  text: string
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
      },
      apikey: 'not set',
    },
  };
  if (href === undefined) {
    delete data.body.objectJson.href;
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
  value: string | undefined = undefined
): object {
  const data = {
    action: {action: 'reportZestStatement'},
    body: {
      statementJson: {
        windowHandle: 'windowHandle1',
        type: 'id',
        element,
        index,
        waitForMsec: 5000,
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
  element: string
): object {
  return reportZestStatement(
    index,
    'ZestClientElementScrollTo',
    element,
    undefined
  );
}

export function reportZestStatementClick(
  index: number,
  element: string
): object {
  return reportZestStatement(
    index,
    'ZestClientElementClick',
    element,
    undefined
  );
}

export function reportZestStatementSubmit(
  index: number,
  element: string
): object {
  return reportZestStatement(
    index,
    'ZestClientElementSubmit',
    element,
    undefined
  );
}

export function reportZestStatementSendKeys(
  index: number,
  element: string,
  value: string
): object {
  return reportZestStatement(
    index,
    'ZestClientElementSendKeys',
    element,
    value
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

export async function closeServer(_server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    _server.close(() => {
      console.log('Server closed');
      resolve();
    });
  });
}

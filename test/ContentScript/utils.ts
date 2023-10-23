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

export function getFakeZapServer(
  actualData: Array<string>,
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
      actualData.push(
        msg.replace(/\\"timestamp\\":\d+/g, 'TIMESTAMP').replace(/[\\]/g, '')
      );
    }
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

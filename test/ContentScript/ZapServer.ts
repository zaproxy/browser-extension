/*
 * Zed Attack Proxy (ZAP) and its related source files.
 *
 * ZAP is an HTTP/HTTPS proxy for assessing web application security.
 *
 * Copyright 2025 The ZAP Development Team
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
import {Request, Response} from 'express';
import http from 'http';
import JsonServer from 'json-server';

class ZapServer {
  server: http.Server;

  events: Array<object>;

  incZapEvents = false;

  constructor(events: Array<object>, port: number) {
    this.events = events;
    const app = JsonServer.create();

    app.use(JsonServer.bodyParser);
    app.post('/JSON/client/action/:action', (req: Request, res: Response) => {
      const action = req.params;
      const {body} = req;
      const msg = JSON.stringify({action, body});
      if (this.incZapEvents || msg.indexOf('localzap') === -1) {
        // Ignore localzap events
        this.events[this.getInsertPosition(body)] = {
          action,
          body: this.normalizeJson(body),
        };
      }
      res.sendStatus(200);
    });

    this.server = app.listen(port, () => {});
  }

  public setRecordZapEvents(include: boolean): void {
    this.incZapEvents = include;
  }

  public async close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getInsertPosition(body: any): number {
    const statementJson = body?.statementJson;
    if (statementJson) {
      const index = JSON.parse(statementJson)?.index;
      if (index) {
        return index - 1;
      }
    }
    return this.events.length;
  }

  private toJsonWithoutDynamicValues(value: string): string {
    return JSON.parse(
      value
        .replace(/timestamp":\d+/g, 'timestamp": "TIMESTAMP"')
        .replace(/Recorded by [^\\]+?"/g, 'Recorded by comment"')
        .replace(/browserType":"[^\\]+?"/g, 'browserType":"browser"')
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private normalizeJson(body: any): any {
    ['eventJson', 'statementJson', 'objectJson'].forEach((name) => {
      const value = body[name];
      if (value) {
        body[name] = this.toJsonWithoutDynamicValues(value);
      }
    });
    return body;
  }
}

export {ZapServer};

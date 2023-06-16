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
import path from 'path';

export const extensionPath = {
  CHROME: path.join(__dirname, '..', '..', 'extension', 'chrome'),
  FIREFOX: path.join(__dirname, '..', '..', 'extension', 'firefox.xpi'),
};

export const HTTPPORT = 1801;
export const JSONPORT = 8080;
export const BROWSERNAME = {
  CHROME: 'chrome',
  FIREFOX: 'firefox',
};

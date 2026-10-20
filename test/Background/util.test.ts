/*
 * Zed Attack Proxy (ZAP) and its related source files.
 *
 * ZAP is an HTTP/HTTPS proxy for assessing web application security.
 *
 * Copyright 2026 The ZAP Development Team
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
import {sleep} from '../../source/utils/util';

test('waits for the time given', async () => {
  const started = Date.now();
  await sleep(50);
  expect(Date.now() - started).toBeGreaterThanOrEqual(40);
});

test('stops waiting as soon as the signal is aborted', async () => {
  const controller = new AbortController();
  const started = Date.now();
  setTimeout(() => controller.abort(), 20);

  await sleep(5000, controller.signal);

  expect(Date.now() - started).toBeLessThan(1000);
});

test('does not wait if the signal has already been aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  const started = Date.now();

  await sleep(5000, controller.signal);

  expect(Date.now() - started).toBeLessThan(1000);
});

test('an abort after the wait has ended does nothing', async () => {
  const controller = new AbortController();
  await sleep(10, controller.signal);
  expect(() => controller.abort()).not.toThrow();
});

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
import RawStatement from '../types/zestScript/RawStatement';
import {
  ZEST_CLIENT_ELEMENT_CLEAR,
  ZEST_CLIENT_ELEMENT_CLICK,
  ZEST_CLIENT_ELEMENT_MOUSE_OVER,
  ZEST_CLIENT_ELEMENT_SCROLL_TO,
  ZEST_CLIENT_ELEMENT_SEND_KEYS,
  ZEST_CLIENT_ELEMENT_SUBMIT,
  ZEST_CLIENT_LAUNCH,
  ZEST_CLIENT_SWITCH_TO_FRAME,
  ZEST_CLIENT_WINDOW_CLOSE,
  ZEST_COMMENT,
} from './constants';
import i18n from './i18n';

interface ZestStatementSummary {
  index: number;
  enabled: boolean;
  summary: string;
}

function str(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function describeElement(statement: RawStatement): string {
  return `${str(statement.type)}: ${str(statement.element)}`;
}

function describeFrame(statement: RawStatement): string {
  if (statement.parent === true) {
    return i18n.t('summary.frameParent');
  }
  const name = str(statement.frameName);
  return name !== ''
    ? i18n.t('summary.frameName', {name})
    : i18n.t('summary.frameIndex', {index: str(statement.frameIndex)});
}

function summarizeStatement(statement: RawStatement): string {
  const elementType = str(statement.elementType);
  const locator = describeElement(statement);
  switch (elementType) {
    case ZEST_CLIENT_LAUNCH:
      return i18n.t('summary.launch', {
        browser: str(statement.browserType),
        url: str(statement.url),
      });
    case ZEST_CLIENT_ELEMENT_CLICK:
      return i18n.t('summary.click', {locator});
    case ZEST_CLIENT_ELEMENT_SCROLL_TO:
      return i18n.t('summary.scrollTo', {locator});
    case ZEST_CLIENT_ELEMENT_SEND_KEYS:
      return i18n.t('summary.sendKeys', {
        keys: str(statement.value),
        locator,
      });
    case ZEST_CLIENT_ELEMENT_SUBMIT:
      return i18n.t('summary.submit', {locator});
    case ZEST_CLIENT_ELEMENT_CLEAR:
      return i18n.t('summary.clear', {locator});
    case ZEST_CLIENT_ELEMENT_MOUSE_OVER:
      return i18n.t('summary.mouseOver', {locator});
    case ZEST_CLIENT_SWITCH_TO_FRAME:
      return i18n.t('summary.switchToFrame', {
        frame: describeFrame(statement),
      });
    case ZEST_CLIENT_WINDOW_CLOSE:
      return i18n.t('summary.closeWindow', {
        handle: str(statement.windowHandle),
      });
    case ZEST_COMMENT:
      return i18n.t('summary.comment', {comment: str(statement.comment)});
    default:
      return elementType !== '' ? elementType : i18n.t('summary.unknown');
  }
}

/**
 * Converts a Zest script (as a JSON string) into a list of one-line summaries,
 * one per statement.
 * @throws if the script is not valid JSON.
 */
function summarizeZestScript(scriptJson: string): ZestStatementSummary[] {
  const script = JSON.parse(scriptJson);
  const statements: RawStatement[] = Array.isArray(script.statements)
    ? script.statements
    : [];
  return statements.map((statement, i) => ({
    index: typeof statement.index === 'number' ? statement.index : i + 1,
    enabled: statement.enabled !== false,
    summary: summarizeStatement(statement),
  }));
}

export {summarizeZestScript, summarizeStatement};
export type {ZestStatementSummary};

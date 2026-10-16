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
  DEFAULT_WINDOW_HANDLE,
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

type FieldKind = 'text' | 'multiline' | 'number' | 'boolean' | 'locatorType';

interface FieldDef {
  key: string;
  /** The i18n key of the label. */
  labelKey: string;
  kind: FieldKind;
  required?: boolean;
}

interface StatementTypeDef {
  elementType: string;
  /** The i18n key of the name of the statement type. */
  labelKey: string;
  fields: FieldDef[];
  defaults: RawStatement;
}

type FieldValues = Record<string, string | boolean>;

const LOCATOR_TYPES = [
  'id',
  'cssSelector',
  'xpath',
  'className',
  'name',
  'linkText',
  'tagName',
];

const LOCATOR_FIELDS: FieldDef[] = [
  {key: 'type', labelKey: 'edit.field.locatorType', kind: 'locatorType'},
  {
    key: 'element',
    labelKey: 'edit.field.locator',
    kind: 'text',
    required: true,
  },
];

const WAIT_FIELD: FieldDef = {
  key: 'waitForMsec',
  labelKey: 'edit.field.waitFor',
  kind: 'number',
};

const ELEMENT_DEFAULTS = {
  windowHandle: DEFAULT_WINDOW_HANDLE,
  type: 'id',
  element: '',
};

const ENABLED_FIELD: FieldDef = {
  key: 'enabled',
  labelKey: 'edit.field.enabled',
  kind: 'boolean',
};

const STATEMENT_TYPES: StatementTypeDef[] = [
  {
    elementType: ZEST_CLIENT_LAUNCH,
    labelKey: 'edit.type.launch',
    fields: [
      {
        key: 'browserType',
        labelKey: 'edit.field.browser',
        kind: 'text',
        required: true,
      },
      {key: 'url', labelKey: 'edit.field.url', kind: 'text', required: true},
    ],
    defaults: {
      windowHandle: DEFAULT_WINDOW_HANDLE,
      browserType: 'Chrome',
      url: '',
      capabilities: '',
      headless: false,
    },
  },
  {
    elementType: ZEST_CLIENT_ELEMENT_CLICK,
    labelKey: 'edit.type.click',
    fields: [...LOCATOR_FIELDS, WAIT_FIELD],
    defaults: {...ELEMENT_DEFAULTS, waitForMsec: 0},
  },
  {
    elementType: ZEST_CLIENT_ELEMENT_SEND_KEYS,
    labelKey: 'edit.type.sendKeys',
    fields: [
      ...LOCATOR_FIELDS,
      {key: 'value', labelKey: 'edit.field.keys', kind: 'multiline'},
      WAIT_FIELD,
    ],
    defaults: {...ELEMENT_DEFAULTS, value: '', waitForMsec: 0},
  },
  {
    elementType: ZEST_CLIENT_ELEMENT_CLEAR,
    labelKey: 'edit.type.clear',
    fields: LOCATOR_FIELDS,
    defaults: {...ELEMENT_DEFAULTS},
  },
  {
    elementType: ZEST_CLIENT_ELEMENT_SUBMIT,
    labelKey: 'edit.type.submit',
    fields: [...LOCATOR_FIELDS, WAIT_FIELD],
    defaults: {...ELEMENT_DEFAULTS, waitForMsec: 0},
  },
  {
    elementType: ZEST_CLIENT_ELEMENT_SCROLL_TO,
    labelKey: 'edit.type.scrollTo',
    fields: [...LOCATOR_FIELDS, WAIT_FIELD],
    defaults: {...ELEMENT_DEFAULTS, waitForMsec: 0},
  },
  {
    elementType: ZEST_CLIENT_ELEMENT_MOUSE_OVER,
    labelKey: 'edit.type.mouseOver',
    fields: [...LOCATOR_FIELDS, WAIT_FIELD],
    defaults: {...ELEMENT_DEFAULTS, waitForMsec: 0},
  },
  {
    elementType: ZEST_CLIENT_SWITCH_TO_FRAME,
    labelKey: 'edit.type.switchToFrame',
    fields: [
      {key: 'frameIndex', labelKey: 'edit.field.frameIndex', kind: 'number'},
      {key: 'frameName', labelKey: 'edit.field.frameName', kind: 'text'},
    ],
    defaults: {
      windowHandle: DEFAULT_WINDOW_HANDLE,
      frameIndex: 0,
      frameName: '',
      parent: false,
    },
  },
  {
    elementType: ZEST_CLIENT_WINDOW_CLOSE,
    labelKey: 'edit.type.closeWindow',
    fields: [
      {key: 'sleepInSeconds', labelKey: 'edit.field.sleep', kind: 'number'},
    ],
    defaults: {windowHandle: DEFAULT_WINDOW_HANDLE, sleepInSeconds: 0},
  },
  {
    elementType: ZEST_COMMENT,
    labelKey: 'edit.type.comment',
    fields: [
      {key: 'comment', labelKey: 'edit.field.comment', kind: 'multiline'},
    ],
    defaults: {comment: ''},
  },
];

/** Only web pages can be launched by a replay. */
function isReplayableUrl(url: string): boolean {
  try {
    const {protocol} = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function getStatementType(elementType: unknown): StatementTypeDef | undefined {
  return STATEMENT_TYPES.find((t) => t.elementType === elementType);
}

function newStatement(elementType: string): RawStatement {
  const def = getStatementType(elementType);
  if (!def) {
    throw new Error(`Unsupported statement type: ${elementType}`);
  }
  return {...def.defaults, index: 0, enabled: true, elementType};
}

/** The fields shown when editing, including the enabled flag. */
function getEditFields(def: StatementTypeDef): FieldDef[] {
  return [...def.fields, ENABLED_FIELD];
}

/** Initial form values for a statement. */
function toFieldValues(
  def: StatementTypeDef,
  statement: RawStatement
): FieldValues {
  const values: FieldValues = {};
  getEditFields(def).forEach((f) => {
    const v = statement[f.key];
    if (f.kind === 'boolean') {
      values[f.key] = f.key === 'enabled' ? v !== false : v === true;
    } else {
      values[f.key] = v === undefined || v === null ? '' : String(v);
    }
  });
  return values;
}

/**
 * Applies edited form values to a statement. Fields that are not shown in
 * the form (e.g. windowHandle) are preserved.
 * @returns the new statement, or the validation errors.
 */
function applyFieldValues(
  def: StatementTypeDef,
  statement: RawStatement,
  values: FieldValues
): {statement?: RawStatement; errors: string[]} {
  const errors: string[] = [];
  const result: RawStatement = {...statement};
  getEditFields(def).forEach((f) => {
    const raw = values[f.key];
    if (f.kind === 'boolean') {
      result[f.key] = raw === true;
      return;
    }
    const text = typeof raw === 'string' ? raw : '';
    if (f.kind === 'number') {
      if (!/^-?\d+$/.test(text.trim())) {
        errors.push(
          i18n.t('edit.error.wholeNumber', {field: i18n.t(f.labelKey)})
        );
      } else {
        result[f.key] = Number(text.trim());
      }
    } else if (f.required && text.trim() === '') {
      errors.push(i18n.t('edit.error.required', {field: i18n.t(f.labelKey)}));
    } else {
      result[f.key] = text;
    }
  });
  if (
    def.elementType === ZEST_CLIENT_LAUNCH &&
    typeof result.url === 'string' &&
    result.url.trim() !== '' &&
    !isReplayableUrl(result.url.trim())
  ) {
    errors.push(i18n.t('edit.error.badUrl'));
  }
  if (def.elementType === ZEST_CLIENT_SWITCH_TO_FRAME) {
    result.parent = result.frameIndex === -1;
  }
  return errors.length > 0 ? {errors} : {statement: result, errors};
}

/** Returns a copy of the list with an item moved, or the same order if out of range. */
function moveItem<T>(items: T[], from: number, to: number): T[] {
  const result = [...items];
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return result;
  }
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

// The names of the script level settings that are not kept
const METADATA_KEYS = {
  type: 'edit.metadata.type',
  description: 'edit.metadata.description',
  prefix: 'edit.metadata.prefix',
  parameters: 'edit.metadata.parameters',
  authentication: 'edit.metadata.authentication',
};

/**
 * The script level settings that the extension cannot keep: it only keeps the
 * title and the statements, and exports the other settings as the defaults.
 * @returns the names of the settings in the script which are not the defaults.
 */
function unsupportedMetadata(
  script: Record<string, unknown>
): (keyof typeof METADATA_KEYS)[] {
  const unsupported: (keyof typeof METADATA_KEYS)[] = [];
  const isEmpty = (v: unknown): boolean =>
    v === undefined || v === null || v === '';
  if (script.type !== undefined && script.type !== 'StandAlone') {
    unsupported.push('type');
  }
  if (!isEmpty(script.description)) {
    unsupported.push('description');
  }
  if (!isEmpty(script.prefix)) {
    unsupported.push('prefix');
  }
  const params = script.parameters as Record<string, unknown> | undefined;
  if (
    params &&
    ((params.tokens &&
      Object.keys(params.tokens as Record<string, unknown>).length > 0) ||
      (params.tokenStart !== undefined && params.tokenStart !== '{{') ||
      (params.tokenEnd !== undefined && params.tokenEnd !== '}}'))
  ) {
    unsupported.push('parameters');
  }
  if (
    Array.isArray(script.authentication) &&
    script.authentication.length > 0
  ) {
    unsupported.push('authentication');
  }
  return unsupported;
}

/**
 * Parses the contents of a Zest script file.
 * @throws if it is not a Zest script, or has settings that cannot be kept.
 */
function parseZestScript(text: string): {
  title: string;
  statements: RawStatement[];
} {
  let script;
  try {
    script = JSON.parse(text);
  } catch {
    throw new Error(i18n.t('edit.error.notJson'));
  }
  const {statements} = script ?? {};
  if (
    !Array.isArray(statements) ||
    !statements.every(
      (s) => s && typeof s === 'object' && typeof s.elementType === 'string'
    )
  ) {
    throw new Error(i18n.t('edit.error.notZest'));
  }
  const unsupported = unsupportedMetadata(script);
  if (unsupported.length > 0) {
    throw new Error(
      i18n.t('edit.error.unsupportedMetadata', {
        features: unsupported
          .map((m) => i18n.t(`edit.metadata.${m}`))
          .join(', '),
      })
    );
  }
  return {
    title: typeof script.title === 'string' ? script.title : '',
    statements,
  };
}

export {
  isReplayableUrl,
  parseZestScript,
  LOCATOR_TYPES,
  STATEMENT_TYPES,
  getStatementType,
  newStatement,
  getEditFields,
  toFieldValues,
  applyFieldValues,
  moveItem,
};
export type {FieldDef, FieldValues, StatementTypeDef};

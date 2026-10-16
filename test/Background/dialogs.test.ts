/**
 * @jest-environment jsdom
 */
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
import * as fs from 'fs';
import * as path from 'path';
import {getStatementType, newStatement} from '../../source/utils/zestEdit';

jest.mock('webextension-polyfill', () => ({
  __esModule: true,
  default: {runtime: {}},
}));

// jsdom does not implement modal dialogs
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(): void {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(): void {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(
    path.join(__dirname, '..', '..', 'views', 'script.html'),
    'utf8'
  );
  // The dialogs find their elements when the module is loaded
  jest.resetModules();
});

function submit(): void {
  (document.getElementById('edit-form') as HTMLFormElement).dispatchEvent(
    new Event('submit', {cancelable: true})
  );
}

async function load(): Promise<
  typeof import('../../source/ScriptView/dialogs')
> {
  // eslint-disable-next-line node/no-unsupported-features/es-syntax
  return import('../../source/ScriptView/dialogs');
}

describe('locator types', () => {
  const def = getStatementType('ZestClientElementClick');
  const statement = (type: unknown): Record<string, unknown> => ({
    ...newStatement('ZestClientElementClick'),
    element: 'target',
    type,
  });

  test('a type that is not known is kept when something else is changed', async () => {
    const dialogs = await load();
    const onSave = jest.fn();

    dialogs.openEditor(
      def as NonNullable<typeof def>,
      statement('data-test-id'),
      'Edit',
      onSave
    );
    const select = document.getElementById('field-type') as HTMLSelectElement;
    expect(select.value).toBe('data-test-id');
    (document.getElementById('field-enabled') as HTMLInputElement).checked =
      false;
    submit();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      type: 'data-test-id',
      element: 'target',
      enabled: false,
    });
  });

  test('the types that are known are still offered', async () => {
    const dialogs = await load();

    dialogs.openEditor(
      def as NonNullable<typeof def>,
      statement('data-test-id'),
      'Edit',
      jest.fn()
    );

    const options = Array.from(
      (document.getElementById('field-type') as HTMLSelectElement).options
    ).map((o) => o.value);
    expect(options).toEqual(
      expect.arrayContaining([
        'id',
        'cssSelector',
        'xpath',
        'className',
        'linkText',
        'partialLinkText',
      ])
    );
    expect(options[0]).toBe('data-test-id');
  });

  test('a known type does not get an extra option', async () => {
    const dialogs = await load();

    dialogs.openEditor(
      def as NonNullable<typeof def>,
      statement('xpath'),
      'Edit',
      jest.fn()
    );

    const select = document.getElementById('field-type') as HTMLSelectElement;
    expect(select.value).toBe('xpath');
    expect(select.options).toHaveLength(8);
  });

  test('partialLinkText can be chosen', async () => {
    const dialogs = await load();
    const onSave = jest.fn();

    dialogs.openEditor(
      def as NonNullable<typeof def>,
      statement('id'),
      'Edit',
      onSave
    );
    (document.getElementById('field-type') as HTMLSelectElement).value =
      'partialLinkText';
    (document.getElementById('field-element') as HTMLInputElement).value =
      'Sign in';
    submit();

    expect(onSave.mock.calls[0][0]).toMatchObject({
      type: 'partialLinkText',
      element: 'Sign in',
    });
  });

  test('a statement that has partialLinkText keeps it, without an extra option', async () => {
    const dialogs = await load();
    const onSave = jest.fn();

    dialogs.openEditor(
      def as NonNullable<typeof def>,
      statement('partialLinkText'),
      'Edit',
      onSave
    );
    const select = document.getElementById('field-type') as HTMLSelectElement;
    expect(select.value).toBe('partialLinkText');
    expect(select.options).toHaveLength(8);
    (document.getElementById('field-enabled') as HTMLInputElement).checked =
      false;
    submit();

    expect(onSave.mock.calls[0][0].type).toBe('partialLinkText');
  });

  test('another type can still be chosen', async () => {
    const dialogs = await load();
    const onSave = jest.fn();

    dialogs.openEditor(
      def as NonNullable<typeof def>,
      statement('data-test-id'),
      'Edit',
      onSave
    );
    (document.getElementById('field-type') as HTMLSelectElement).value = 'id';
    submit();

    expect(onSave.mock.calls[0][0].type).toBe('id');
  });
});

describe('closing the dialogs', () => {
  test('closes an open edit dialog and an open confirmation', async () => {
    const dialogs = await load();
    const def = getStatementType('ZestComment');
    dialogs.openEditor(
      def as NonNullable<typeof def>,
      newStatement('ZestComment'),
      'Edit',
      jest.fn()
    );
    dialogs.askConfirm('Title', 'Message', '', 'OK', jest.fn());
    const edit = document.getElementById('edit-dialog') as HTMLElement;
    const confirm = document.getElementById('confirm-dialog') as HTMLElement;
    expect(edit.hasAttribute('open')).toBe(true);
    expect(confirm.hasAttribute('open')).toBe(true);

    dialogs.closeDialogs();

    expect(edit.hasAttribute('open')).toBe(false);
    expect(confirm.hasAttribute('open')).toBe(false);
  });
});

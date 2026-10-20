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
import i18n from '../utils/i18n';
import {
  LOCATOR_TYPES,
  StatementTypeDef,
  applyFieldValues,
  getEditFields,
  toFieldValues,
} from '../utils/zestEdit';

const editDialog = document.getElementById('edit-dialog') as HTMLDialogElement;
const editForm = document.getElementById('edit-form') as HTMLFormElement;
const editTitle = document.getElementById('edit-title') as HTMLElement;
const editFields = document.getElementById('edit-fields') as HTMLElement;
const editErrors = document.getElementById('edit-errors') as HTMLElement;
const editCancel = document.getElementById('edit-cancel') as HTMLButtonElement;
const confirmDialog = document.getElementById(
  'confirm-dialog'
) as HTMLDialogElement;
const confirmTitle = document.getElementById('confirm-title') as HTMLElement;
const confirmMessage = document.getElementById(
  'confirm-message'
) as HTMLElement;
const confirmText = document.getElementById('confirm-text') as HTMLElement;
const confirmCancel = document.getElementById(
  'confirm-cancel'
) as HTMLButtonElement;
const confirmOk = document.getElementById('confirm-ok') as HTMLButtonElement;

function addEditField(
  parent: HTMLElement,
  key: string,
  label: string,
  kind: string,
  value: string | boolean
): void {
  const id = `field-${key}`;
  const labelEl = document.createElement('label');
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  if (kind === 'multiline') {
    // A text input would remove any line breaks from the value
    const textarea = document.createElement('textarea');
    textarea.rows = 4;
    textarea.value = String(value);
    input = textarea;
  } else if (kind === 'locatorType') {
    const select = document.createElement('select');
    // A type that the editor does not know about, e.g. in a loaded script, must
    // be kept, as otherwise saving the statement would lose it
    const types = LOCATOR_TYPES.includes(String(value))
      ? LOCATOR_TYPES
      : [String(value), ...LOCATOR_TYPES];
    types.forEach((t) => select.add(new Option(t, t)));
    select.value = String(value);
    input = select;
  } else {
    input = document.createElement('input');
    input.type = kind === 'boolean' ? 'checkbox' : 'text';
    if (kind === 'boolean') {
      input.checked = value === true;
    } else {
      input.value = String(value);
    }
  }
  input.id = id;
  input.name = key;
  parent.append(labelEl, input);
}

// A textarea reports all line breaks as LF, whatever the text had
const normalizeNewlines = (text: string): string =>
  text.replace(/\r\n?/g, '\n');

/** Shows the form for editing a statement, calling onSave with the valid result. */
function openEditor(
  def: StatementTypeDef,
  statement: RawStatement,
  title: string,
  onSave: (updated: RawStatement) => void
): void {
  editTitle.textContent = title;
  editErrors.textContent = '';
  editFields.textContent = '';
  const values = toFieldValues(def, statement);
  getEditFields(def).forEach((f) =>
    addEditField(editFields, f.key, i18n.t(f.labelKey), f.kind, values[f.key])
  );
  editForm.onsubmit = (e): void => {
    e.preventDefault();
    const entered: Record<string, string | boolean> = {};
    getEditFields(def).forEach((f) => {
      const input = document.getElementById(`field-${f.key}`) as
        HTMLInputElement | HTMLSelectElement;
      if (f.kind === 'boolean') {
        entered[f.key] = (input as HTMLInputElement).checked;
      } else if (
        f.kind === 'multiline' &&
        normalizeNewlines(String(values[f.key])) === input.value
      ) {
        // Not edited, so keep the original line breaks rather than the LF ones
        entered[f.key] = values[f.key];
      } else {
        entered[f.key] = input.value;
      }
    });
    const result = applyFieldValues(def, statement, entered);
    if (!result.statement) {
      editErrors.textContent = result.errors.join('. ');
      return;
    }
    editDialog.close();
    onSave(result.statement);
  };
  editDialog.showModal();
}

/** Asks the user to confirm an action, calling onOk if they do. */
function askConfirm(
  title: string,
  message: string,
  detail: string,
  okLabel: string,
  onOk: () => void
): void {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmText.textContent = detail;
  confirmText.hidden = detail === '';
  confirmOk.textContent = okLabel;
  confirmOk.onclick = (): void => {
    confirmDialog.close();
    onOk();
  };
  confirmDialog.showModal();
}

/** Closes the dialogs, e.g. because the script they were opened for has changed. */
function closeDialogs(): void {
  editDialog.close();
  confirmDialog.close();
}

editCancel.addEventListener('click', () => editDialog.close());
confirmCancel.addEventListener('click', () => confirmDialog.close());

export {openEditor, askConfirm, closeDialogs};

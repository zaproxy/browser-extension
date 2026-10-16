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
import Browser from 'webextension-polyfill';
import RawStatement from '../types/zestScript/RawStatement';
import {
  GET_ZEST_SCRIPT,
  REFRESH_SCRIPT_VIEW,
  REPLAY_CANCEL,
  REPLAY_NEXT,
  SET_ZEST_STATEMENTS,
} from '../utils/constants';
import {summarizeStatement, summarizeZestScript} from '../utils/zestSummary';
import {
  STATEMENT_TYPES,
  getStatementType,
  moveItem,
  newStatement,
  parseZestScript,
} from '../utils/zestEdit';
import i18n from '../utils/i18n';
import {downloadJson} from '../utils/util';
import {ZestScriptMessage} from '../types/zestScript/ZestScript';
import {askConfirm, openEditor} from './dialogs';
import ScriptPlayer, {RunMode, StatementState} from './player';

const titleElement = document.getElementById('script-title') as HTMLElement;
const messageElement = document.getElementById('script-message') as HTMLElement;
const tableBody = document.getElementById(
  'script-body'
) as HTMLTableSectionElement;
const table = document.getElementById('script-table') as HTMLElement;
const newButton = document.getElementById('new-btn') as HTMLButtonElement;
const loadButton = document.getElementById('load-btn') as HTMLButtonElement;
const saveButton = document.getElementById('save-btn') as HTMLButtonElement;
const loadFile = document.getElementById('load-file') as HTMLInputElement;
const refreshButton = document.getElementById(
  'refresh-btn'
) as HTMLButtonElement;
const runButton = document.getElementById('run-btn') as HTMLButtonElement;
const runModeSelect = document.getElementById('run-mode') as HTMLSelectElement;
const stepModeInput = document.getElementById('step-mode') as HTMLInputElement;
const stepLabel = document.getElementById('step-label') as HTMLElement;
const nextButton = document.getElementById('next-btn') as HTMLButtonElement;
const stopButton = document.getElementById('stop-btn') as HTMLButtonElement;
const undoButton = document.getElementById('undo-btn') as HTMLButtonElement;
const addTypeSelect = document.getElementById('add-type') as HTMLSelectElement;
const addButton = document.getElementById('add-btn') as HTMLButtonElement;

// Column of the table that shows the result of replaying a statement
const STATUS_CELL = 3;

const RUN_MODE_KEY = 'zaprunmode';

function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options) as string;
}

// Static text in the page is translated via data-i18n attributes
function translatePage(): void {
  document.title = t('script.pageTitle');
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const element = el;
    element.textContent = t(element.dataset.i18n as string);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const element = el;
    element.title = t(element.dataset.i18nTitle as string);
  });
}

let statements: RawStatement[] = [];
// What undoing a change restores: the statements and the name of the script
interface UndoStep {
  statements: RawStatement[];
  title: string;
}

let undoStack: UndoStep[] = [];
let scriptTitle = '';
let selected = -1;
let statementDelay = 0;
let statementCount = 0;
let recording = false;
let saving = false;
let player: ScriptPlayer | undefined;

function canEdit(): boolean {
  return !recording && !saving && player === undefined;
}

function updateControls(): void {
  const running = player !== undefined;
  const editable = canEdit();
  runButton.hidden = running;
  runModeSelect.hidden = running;
  stepLabel.hidden = running;
  runModeSelect.disabled = recording;
  stopButton.hidden = !running;
  refreshButton.disabled = running || saving;
  runButton.disabled = recording || saving || statementCount === 0;
  runButton.title = recording ? t('script.stopRecordingFirst') : '';
  addButton.disabled = !editable;
  addTypeSelect.disabled = !editable;
  loadButton.disabled = !editable;
  newButton.disabled = !editable;
  saveButton.disabled = statementCount === 0;
  undoButton.disabled = !editable || undoStack.length === 0;
  table.classList.toggle('locked', !editable);
}

function addCell(row: HTMLTableRowElement, text: string, cls = ''): void {
  const cell = row.insertCell();
  cell.textContent = text;
  if (cls) {
    cell.className = cls;
  }
}

function addActionButton(
  cell: HTMLElement,
  text: string,
  title: string,
  handler: () => void
): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.title = title;
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    handler();
  });
  cell.appendChild(button);
}

async function storedTitle(): Promise<string> {
  const items = await Browser.storage.sync.get({zapscriptname: ''});
  return items.zapscriptname as string;
}

/**
 * Stores the new list of statements, which are renumbered by the background.
 * If a title is given then that becomes the name of the script as well, and
 * is put back if the statements cannot be stored.
 * @returns true if they were stored.
 */
async function saveStatements(
  newStatements: RawStatement[],
  options: {title?: string; recordUndo?: boolean} = {}
): Promise<boolean> {
  const {title, recordUndo = true} = options;
  if (!canEdit()) {
    return false;
  }
  // Wait for the saved statements to be shown, as the rows' buttons refer to
  // their positions in the list that is currently displayed
  saving = true;
  updateControls();
  const before = statements;
  let previousTitle = '';
  let pushed = false;
  let titleChanged = false;
  let stored = true;
  try {
    previousTitle = await storedTitle();
    if (recordUndo) {
      undoStack.push({statements: before, title: previousTitle});
      pushed = true;
    }
    if (title !== undefined && title !== previousTitle) {
      await Browser.storage.sync.set({zapscriptname: title});
      titleChanged = true;
    }
    await Browser.runtime.sendMessage({
      type: SET_ZEST_STATEMENTS,
      data: newStatements,
    });
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    await loadScript();
  } catch (e) {
    stored = false;
    if (pushed) {
      undoStack.pop();
    }
    if (titleChanged) {
      try {
        await Browser.storage.sync.set({zapscriptname: previousTitle});
      } catch {
        // Nothing more can be done
      }
    }
    // Show what is really stored, then why the change was not made
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    await loadScript();
    messageElement.textContent = t('script.saveFailed', {
      error: e instanceof Error ? e.message : e,
    });
  } finally {
    saving = false;
    updateControls();
  }
  return stored;
}

function editStatement(position: number): void {
  const statement = statements[position];
  const def = getStatementType(statement.elementType);
  if (!def || !canEdit()) {
    return;
  }
  openEditor(
    def,
    statement,
    t('script.editTitle', {type: t(def.labelKey)}),
    (updated) => {
      const list = [...statements];
      list[position] = updated;
      saveStatements(list);
    }
  );
}

function addStatement(): void {
  const def = getStatementType(addTypeSelect.value);
  if (!def || !canEdit()) {
    return;
  }
  const at = selected >= 0 ? selected + 1 : statements.length;
  openEditor(
    def,
    newStatement(def.elementType),
    t('script.addTitle', {type: t(def.labelKey)}),
    (added) => {
      const list = [...statements];
      list.splice(at, 0, added);
      selected = at;
      saveStatements(list);
    }
  );
}

function moveStatement(position: number, delta: number): void {
  const target = position + delta;
  if (!canEdit() || target < 0 || target >= statements.length) {
    return;
  }
  selected = target;
  saveStatements(moveItem(statements, position, target));
}

function deleteStatement(position: number): void {
  if (!canEdit()) {
    return;
  }
  askConfirm(
    t('script.deleteTitle'),
    t('script.deleteMessage'),
    summarizeStatement(statements[position]),
    t('script.delete'),
    () => {
      selected = -1;
      saveStatements(statements.filter((_s, i) => i !== position));
    }
  );
}

function newScript(): void {
  if (!canEdit()) {
    return;
  }
  const clear = async (): Promise<void> => {
    // The state may have changed while the dialog was open
    if (!canEdit()) {
      return;
    }
    selected = -1;
    await saveStatements([], {
      title: '',
      recordUndo: statements.length > 0 || scriptTitle !== '',
    });
  };
  if (statements.length === 0 && scriptTitle === '') {
    clear();
    return;
  }
  askConfirm(
    t('script.newTitle'),
    t('script.newMessage', {count: statements.length}),
    '',
    t('script.discard'),
    clear
  );
}

async function undo(): Promise<void> {
  if (!canEdit() || undoStack.length === 0) {
    return;
  }
  // Only forget the step once it has been undone, so a failure can be retried
  const step = undoStack[undoStack.length - 1];
  selected = -1;
  if (
    await saveStatements(step.statements, {
      title: step.title,
      recordUndo: false,
    })
  ) {
    undoStack.pop();
    updateControls();
  }
}

function render(msg: ZestScriptMessage): void {
  tableBody.textContent = '';
  const script = JSON.parse(msg.script);
  statements = script.statements ?? [];
  statementDelay = Number(script.options?.statementDelay) || 0;
  statementCount = msg.statementCount;
  if (selected >= statements.length) {
    selected = -1;
  }
  scriptTitle = msg.title;
  titleElement.textContent =
    msg.title !== '' ? msg.title : t('script.untitled');
  if (msg.statementCount === 0) {
    messageElement.textContent = t('script.noStatements');
    table.hidden = true;
    return;
  }
  messageElement.textContent = t('script.statementCount', {
    count: msg.statementCount,
  });
  table.hidden = false;
  summarizeZestScript(msg.script).forEach((stmt, position) => {
    const row = tableBody.insertRow();
    if (!stmt.enabled) {
      row.classList.add('disabled');
    }
    if (position === selected) {
      row.classList.add('selected');
    }
    addCell(row, String(stmt.index), 'index');
    addCell(row, stmt.summary);
    const actions = row.insertCell();
    actions.className = 'actions';
    addCell(row, '', 'status');
    addActionButton(actions, '▲', t('script.moveUp'), () =>
      moveStatement(position, -1)
    );
    addActionButton(actions, '▼', t('script.moveDown'), () =>
      moveStatement(position, 1)
    );
    if (getStatementType(statements[position].elementType)) {
      addActionButton(actions, '✎', t('script.edit'), () =>
        editStatement(position)
      );
      row.addEventListener('dblclick', () => editStatement(position));
    }
    addActionButton(actions, '✕', t('script.delete'), () =>
      deleteStatement(position)
    );
    row.addEventListener('click', () => {
      selected = position;
      Array.from(tableBody.rows).forEach((r, i) =>
        r.classList.toggle('selected', i === position)
      );
    });
  });
}

async function loadScript(): Promise<void> {
  try {
    const msg = (await Browser.runtime.sendMessage({
      type: GET_ZEST_SCRIPT,
    })) as ZestScriptMessage;
    render(msg);
  } catch (e) {
    messageElement.textContent = t('script.loadScriptFailed', {error: e});
    table.hidden = true;
    statementCount = 0;
  }
  updateControls();
}

async function loadFromFile(): Promise<void> {
  const file = loadFile.files?.[0];
  loadFile.value = '';
  if (!file || !canEdit()) {
    return;
  }
  try {
    const script = parseZestScript(await file.text());
    selected = -1;
    // The name is replaced even if it is empty, as the old one is not this script's
    if (await saveStatements(script.statements, {title: script.title})) {
      messageElement.textContent = t('script.loaded', {
        count: script.statements.length,
        file: file.name,
      });
    }
  } catch (e) {
    messageElement.textContent = t('script.loadFileFailed', {
      file: file.name,
      error: e instanceof Error ? e.message : e,
    });
  }
}

async function saveToFile(): Promise<void> {
  const msg = (await Browser.runtime.sendMessage({
    type: GET_ZEST_SCRIPT,
  })) as ZestScriptMessage;
  if (msg.statementCount === 0) {
    return;
  }
  const title = msg.title !== '' ? msg.title : t('script.defaultFileName');
  downloadJson(msg.script, title + (title.slice(-4) === '.zst' ? '' : '.zst'));
}

function showState(
  position: number,
  state: StatementState,
  message?: string
): void {
  const row = tableBody.rows[position];
  row.classList.remove('running', 'ok', 'failed', 'skipped');
  row.classList.add(state);
  const labels = {running: '…', ok: '✓', failed: `✗ ${message}`, skipped: ''};
  row.cells[STATUS_CELL].textContent = labels[state];
  if (state === 'running') {
    row.scrollIntoView({block: 'nearest'});
  }
}

async function runScript(): Promise<void> {
  if (player || recording || saving || statementCount === 0) {
    return;
  }
  Array.from(tableBody.rows).forEach((row) => {
    row.classList.remove('running', 'ok', 'failed', 'skipped');
    row.cells[STATUS_CELL].textContent = '';
  });
  player = new ScriptPlayer(
    runModeSelect.value as RunMode,
    stepModeInput.checked
  );
  player.onPauseChange = (paused, nextStatement): void => {
    nextButton.hidden = !paused;
    messageElement.textContent = paused
      ? t('script.paused', {statement: nextStatement})
      : t('script.running');
  };
  updateControls();
  messageElement.textContent = t('script.running');
  const ok = await player.play(statements, statementDelay, showState);
  player = undefined;
  nextButton.hidden = true;
  messageElement.textContent = ok ? t('script.completed') : t('script.failed');
  updateControls();
}

async function loadRecordingState(): Promise<void> {
  const items = await Browser.storage.sync.get({zaprecordingactive: false});
  recording = items.zaprecordingactive as boolean;
  updateControls();
}

Browser.storage.onChanged.addListener((changes) => {
  if (changes.zaprecordingactive) {
    recording = changes.zaprecordingactive.newValue === true;
    // The script is replaced by a new recording, so old undo states are stale
    undoStack = [];
    selected = -1;
    if (recording) {
      // Replaying would otherwise be recorded
      player?.stop();
      updateControls();
    } else {
      loadScript();
    }
  }
});

STATEMENT_TYPES.forEach((type) =>
  addTypeSelect.add(new Option(t(type.labelKey), type.elementType))
);

document.addEventListener('DOMContentLoaded', () => {
  translatePage();
  loadRecordingState();
  loadScript();
});

// Remember the run mode, if the browser allows it
try {
  runModeSelect.value = localStorage.getItem(RUN_MODE_KEY) ?? 'window';
} catch {
  // Leave the default
}
runModeSelect.addEventListener('change', () => {
  try {
    localStorage.setItem(RUN_MODE_KEY, runModeSelect.value);
  } catch {
    // Not remembered
  }
});

newButton.addEventListener('click', newScript);
loadButton.addEventListener('click', () => loadFile.click());
loadFile.addEventListener('change', loadFromFile);
saveButton.addEventListener('click', saveToFile);
refreshButton.addEventListener('click', loadScript);
runButton.addEventListener('click', runScript);
stopButton.addEventListener('click', () => player?.stop());
nextButton.addEventListener('click', () => player?.next());
addButton.addEventListener('click', addStatement);
undoButton.addEventListener('click', undo);

// The same actions are available from the box shown in the page being replayed
Browser.runtime.onMessage.addListener((message: unknown) => {
  const {type} = message as {type: string};
  if (type === REPLAY_NEXT) {
    player?.next();
  } else if (type === REPLAY_CANCEL) {
    player?.stop();
  } else if (type === REFRESH_SCRIPT_VIEW && !player && !saving) {
    // The tab has been shown again, e.g. from the popup
    loadScript();
  }
});

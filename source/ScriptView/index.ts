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
import Browser, {Runtime} from 'webextension-polyfill';
import RawStatement from '../types/zestScript/RawStatement';
import {
  GET_ZEST_SCRIPT,
  HISTORY_NONE,
  HISTORY_RECORD,
  HISTORY_REDO,
  HISTORY_UNDO,
  REFRESH_SCRIPT_VIEW,
  REPLAY_CANCEL,
  REPLAY_NEXT,
  SET_ZEST_STATEMENTS,
} from '../utils/constants';
import {summarizeStatement, summarizeZestScript} from '../utils/zestSummary';
import type {ZestStatementSummary} from '../utils/zestSummary';
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
import {askConfirm, closeDialogs, openEditor} from './dialogs';
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
const redoButton = document.getElementById('redo-btn') as HTMLButtonElement;
const addTypeSelect = document.getElementById('add-type') as HTMLSelectElement;
const addButton = document.getElementById('add-btn') as HTMLButtonElement;

// Column of the table that shows the result of replaying a statement
const STATUS_CELL = 3;

const RUN_MODE_KEY = 'zaprunmode';

// How long to wait for more statements to be recorded before showing them
const RECORDING_REFRESH_MSEC = 250;
// How close to the bottom of the page counts as being at the bottom
const BOTTOM_MARGIN_PX = 80;

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
// What undoing has taken away, which stays until another change is made
let redoStack: UndoStep[] = [];
let scriptTitle = '';
let selected = -1;
let statementDelay = 0;
let statementCount = 0;
let recording = false;
let saving = false;
// The number of requests for the script that have not yet been answered
let loading = 0;
// Whether the statements shown are what is stored, as they are not if loading failed
let scriptLoaded = false;
// Changes whenever the script shown is replaced, so that dialogs opened for the old one can be ignored
let scriptVersion = 0;
// Set when the script changed while the tab could not be seen, so it is shown when it can
let refreshWhenVisible = false;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
// Identifies the latest request, so that replies to older ones can be ignored
let loadRequest = 0;
let player: ScriptPlayer | undefined;

function canEdit(): boolean {
  return (
    !recording &&
    !saving &&
    loading === 0 &&
    scriptLoaded &&
    player === undefined
  );
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
  runButton.disabled =
    recording || saving || loading > 0 || !scriptLoaded || statementCount === 0;
  runButton.title = recording ? t('script.stopRecordingFirst') : '';
  addButton.disabled = !editable;
  addTypeSelect.disabled = !editable;
  loadButton.disabled = !editable;
  newButton.disabled = !editable;
  saveButton.disabled = statementCount === 0;
  undoButton.disabled = !editable || undoStack.length === 0;
  redoButton.disabled = !editable || redoStack.length === 0;
  // Locked for as long as something prevents changes, which is shown by dimming
  // the buttons. Busy is only while a change or load is being completed, which
  // is too short to be worth showing, as the buttons would only flicker.
  table.classList.toggle('locked', recording || running || !scriptLoaded);
  table.classList.toggle('busy', saving || loading > 0);
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
  handler: () => void,
  enabled = true
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.title = title;
  button.disabled = !enabled;
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.detail > 0) {
      // A click with the mouse gives the button the focus, and the buttons of a
      // row are shown for as long as one of them has it. The rows are kept when
      // the script changes, so they would still be shown when the mouse had gone.
      // A click by the keyboard has no detail, and keeps the focus, so that
      // the button can be used again.
      button.blur();
    }
    handler();
  });
  cell.appendChild(button);
  return button;
}

async function storedTitle(): Promise<string> {
  const items = await Browser.storage.sync.get({zapscriptname: ''});
  return items.zapscriptname as string;
}

/**
 * How a change affects what can be undone or redone:
 * - HISTORY_RECORD: a new change, which can be undone, and which ends any redo
 * - HISTORY_UNDO: undoes the latest step, which can then be redone
 * - HISTORY_REDO: redoes the latest undone step, which can then be undone again
 * - HISTORY_NONE: leaves them as they are
 */
type History =
  | typeof HISTORY_RECORD
  | typeof HISTORY_UNDO
  | typeof HISTORY_REDO
  | typeof HISTORY_NONE;

/**
 * Stores the new list of statements, which are renumbered by the background.
 * If a title is given then that becomes the name of the script as well, and
 * is put back if the statements cannot be stored.
 * @returns true if they were stored.
 */
async function saveStatements(
  newStatements: RawStatement[],
  options: {title?: string; history?: History} = {}
): Promise<boolean> {
  const {title, history = HISTORY_RECORD} = options;
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
    if (history === HISTORY_RECORD) {
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
    // It is stored, so what can be undone and redone can now change
    const previousState = {statements: before, title: previousTitle};
    if (history === HISTORY_RECORD) {
      redoStack = [];
    } else if (history === HISTORY_UNDO) {
      undoStack.pop();
      redoStack.push(previousState);
    } else if (history === HISTORY_REDO) {
      redoStack.pop();
      undoStack.push(previousState);
    }
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

/**
 * Called when the script shown is replaced, or may no longer be what is stored.
 * Dialogs opened for the old script must not change the new one, as the
 * statements they refer to may be different.
 */
function replaceScript(): void {
  scriptVersion += 1;
  closeDialogs();
}

function editStatement(position: number): void {
  const statement = statements[position];
  const def = getStatementType(statement.elementType);
  if (!def || !canEdit()) {
    return;
  }
  const version = scriptVersion;
  openEditor(
    def,
    statement,
    t('script.editTitle', {type: t(def.labelKey)}),
    (updated) => {
      if (version !== scriptVersion) {
        return;
      }
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
  const version = scriptVersion;
  openEditor(
    def,
    newStatement(def.elementType),
    t('script.addTitle', {type: t(def.labelKey)}),
    (added) => {
      if (version !== scriptVersion) {
        return;
      }
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
  const version = scriptVersion;
  askConfirm(
    t('script.deleteTitle'),
    t('script.deleteMessage'),
    summarizeStatement(statements[position]),
    t('script.delete'),
    () => {
      if (version !== scriptVersion) {
        return;
      }
      selected = -1;
      saveStatements(statements.filter((_s, i) => i !== position));
    }
  );
}

function newScript(): void {
  if (!canEdit()) {
    return;
  }
  const version = scriptVersion;
  const clear = async (): Promise<void> => {
    // The state may have changed while the dialog was open
    if (version !== scriptVersion || !canEdit()) {
      return;
    }
    selected = -1;
    await saveStatements([], {
      title: '',
      history:
        statements.length > 0 || scriptTitle !== ''
          ? HISTORY_RECORD
          : HISTORY_NONE,
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
  // The step is only forgotten once it has been undone, so a failure can be retried
  const step = undoStack[undoStack.length - 1];
  selected = -1;
  await saveStatements(step.statements, {
    title: step.title,
    history: HISTORY_UNDO,
  });
}

async function redo(): Promise<void> {
  if (!canEdit() || redoStack.length === 0) {
    return;
  }
  const step = redoStack[redoStack.length - 1];
  selected = -1;
  await saveStatements(step.statements, {
    title: step.title,
    history: HISTORY_REDO,
  });
}

/** What to say while a recording is being made, as the script is changing. */
function recordingNote(count: number): string {
  return count === 0
    ? t('script.recordingEmpty')
    : t('script.recording', {count});
}

function isAtBottom(): boolean {
  return (
    window.innerHeight + window.scrollY >=
    document.documentElement.scrollHeight - BOTTOM_MARGIN_PX
  );
}

/**
 * Makes a row of the table, with its cells and buttons but not what they show.
 * A row stays for its position in the script, whatever statement is there, so
 * that a change to the script does not replace the rows, as the one under the
 * mouse would then lose its hover until the mouse moved, and its buttons would
 * flicker.
 */
function createRow(position: number): HTMLTableRowElement {
  const row = tableBody.insertRow();
  addCell(row, '', 'index');
  addCell(row, '');
  const actions = row.insertCell();
  actions.className = 'actions';
  addCell(row, '', 'status');
  addActionButton(actions, '▲', t('script.moveUp'), () =>
    moveStatement(position, -1)
  );
  addActionButton(actions, '▼', t('script.moveDown'), () =>
    moveStatement(position, 1)
  );
  addActionButton(actions, '✎', t('script.edit'), () =>
    editStatement(position)
  );
  addActionButton(actions, '✕', t('script.delete'), () =>
    deleteStatement(position)
  );
  // This does nothing for a statement that cannot be edited
  row.addEventListener('dblclick', () => editStatement(position));
  row.addEventListener('click', () => {
    selected = position;
    Array.from(tableBody.rows).forEach((r, i) =>
      r.classList.toggle('selected', i === position)
    );
  });
  return row;
}

/** Shows a statement in the row for its position. */
function updateRow(
  row: HTMLTableRowElement,
  position: number,
  statement: ZestStatementSummary
): void {
  // Anything left by running the script is cleared, as the script is replaced
  row.className = '';
  row.classList.toggle('disabled', !statement.enabled);
  row.classList.toggle('selected', position === selected);
  row.cells[0].textContent = String(statement.index);
  row.cells[1].textContent = statement.summary;
  row.cells[STATUS_CELL].textContent = '';
  const [up, down, edit] = Array.from(row.querySelectorAll('button'));
  // The first statement cannot move up, and the last cannot move down
  up.disabled = position === 0;
  down.disabled = position === statements.length - 1;
  edit.hidden = !getStatementType(statements[position].elementType);
}

function render(msg: ZestScriptMessage): void {
  // Only follow the recording if the end of the script is being looked at, so
  // that scrolling up to look at something is not undone by the next statement
  const followRecording = recording && isAtBottom();
  replaceScript();
  scriptLoaded = true;
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
    messageElement.textContent = recording
      ? recordingNote(0)
      : t('script.noStatements');
    tableBody.textContent = '';
    table.hidden = true;
    return;
  }
  messageElement.textContent = recording
    ? recordingNote(msg.statementCount)
    : t('script.statementCount', {count: msg.statementCount});
  table.hidden = false;
  const summaries = summarizeZestScript(msg.script);
  while (tableBody.rows.length > summaries.length) {
    tableBody.deleteRow(-1);
  }
  summaries.forEach((statement, position) => {
    updateRow(
      tableBody.rows[position] ?? createRow(position),
      position,
      statement
    );
  });
  if (followRecording) {
    tableBody.rows[tableBody.rows.length - 1]?.scrollIntoView({
      block: 'nearest',
    });
  }
}

async function loadScript(): Promise<void> {
  loadRequest += 1;
  const request = loadRequest;
  loading += 1;
  updateControls();
  try {
    const msg = (await Browser.runtime.sendMessage({
      type: GET_ZEST_SCRIPT,
    })) as ZestScriptMessage;
    // A newer request, or a script that is now running, makes this reply out of date
    if (request === loadRequest && !player) {
      render(msg);
    }
  } catch (e) {
    if (request === loadRequest) {
      // What is shown is no longer known to be what is stored, so nothing can
      // be changed until it has been loaded again
      replaceScript();
      scriptLoaded = false;
      messageElement.textContent = t('script.loadScriptFailed', {error: e});
      table.hidden = true;
      statementCount = 0;
    }
  } finally {
    loading -= 1;
    updateControls();
  }
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
  if (!row) {
    // The script shown is not the one being run, which should not be possible
    return;
  }
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
  let message = t('script.failed');
  try {
    const ok = await player.play(statements, statementDelay, showState);
    message = ok ? t('script.completed') : t('script.failed');
  } catch (e) {
    message = t('script.runError', {
      error: e instanceof Error ? e.message : e,
    });
  } finally {
    // Whatever happened, the controls must not stay locked
    player = undefined;
    nextButton.hidden = true;
  }
  messageElement.textContent = message;
  updateControls();
}

async function loadRecordingState(): Promise<void> {
  const items = await Browser.storage.sync.get({zaprecordingactive: false});
  recording = items.zaprecordingactive as boolean;
  if (recording && scriptLoaded) {
    messageElement.textContent = recordingNote(statementCount);
  }
  updateControls();
}

/** Whether the statements stored are the ones that are being shown already. */
function isShown(stored: unknown): boolean {
  if (!Array.isArray(stored) || stored.length !== statements.length) {
    return false;
  }
  try {
    return stored.every(
      (statement, i) =>
        JSON.stringify(JSON.parse(statement)) === JSON.stringify(statements[i])
    );
  } catch {
    return false;
  }
}

function refreshStoredScript(): void {
  refreshTimer = undefined;
  if (document.hidden) {
    // Not worth doing while it cannot be seen
    refreshWhenVisible = true;
    return;
  }
  refreshWhenVisible = false;
  loadScript();
}

/**
 * The script is changed by recording, which stores each statement as it is
 * recorded, so show it. The changes are gathered, as they can come quickly.
 */
function storedScriptChanged(stored: unknown): void {
  // The viewer's own changes, which it shows itself, need nothing more
  if (saving || player || isShown(stored)) {
    return;
  }
  // The script is not the one that the undo and redo steps are for
  undoStack = [];
  redoStack = [];
  updateControls();
  if (refreshTimer === undefined) {
    refreshTimer = setTimeout(refreshStoredScript, RECORDING_REFRESH_MSEC);
  }
}

Browser.storage.onChanged.addListener((changes, areaName) => {
  if (changes.zaprecordingactive) {
    recording = changes.zaprecordingactive.newValue === true;
    // The script is replaced by a new recording, so old undo states are stale
    undoStack = [];
    redoStack = [];
    selected = -1;
    if (recording) {
      // The script is about to be replaced, so no dialog for it can be used
      replaceScript();
      // Replaying would otherwise be recorded
      player?.stop();
      messageElement.textContent = recordingNote(statementCount);
      updateControls();
    } else {
      // Shown now, rather than when the changes that are waiting are gathered
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
      loadScript();
    }
  }
  if (areaName === 'local' && changes.zestStatements) {
    storedScriptChanged(changes.zestStatements.newValue);
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && refreshWhenVisible) {
    refreshWhenVisible = false;
    loadScript();
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
redoButton.addEventListener('click', redo);

// The same actions are available from the box shown in the page being replayed
Browser.runtime.onMessage.addListener(
  (message: unknown, sender: Runtime.MessageSender) => {
    const {type} = message as {type: string};
    if (type === REPLAY_NEXT || type === REPLAY_CANCEL) {
      // Every open viewer gets these, but only the one replaying in that tab
      // may act on them
      if (!player?.ownsTab(sender?.tab?.id)) {
        return;
      }
      if (type === REPLAY_NEXT) {
        player.next();
      } else {
        player.stop();
      }
    } else if (type === REFRESH_SCRIPT_VIEW && !player && !saving) {
      // The tab has been shown again, e.g. from the popup
      loadScript();
    }
  }
);

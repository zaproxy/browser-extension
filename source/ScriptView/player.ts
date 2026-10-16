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
import {sleep} from '../utils/util';
import {
  REPLAY_ABORT,
  REPLAY_FINISHED,
  REPLAY_PAUSE,
  REPLAY_STATEMENT,
  ZEST_CLIENT_LAUNCH,
  ZEST_CLIENT_WINDOW_CLOSE,
  ZEST_COMMENT,
} from '../utils/constants';
import i18n from '../utils/i18n';
import {isReplayableUrl} from '../utils/zestEdit';
import {summarizeStatement} from '../utils/zestSummary';
import type {
  ReplayDisplay,
  ReplayFinishDisplay,
  ReplayPauseDisplay,
  ReplayResult,
} from '../ContentScript/replayer';

type RunMode = 'window' | 'tab';

type StatementState = 'running' | 'ok' | 'failed' | 'skipped';

const TAB_LOAD_TIMEOUT_MSEC = 30000;
const SEND_RETRIES = 20;
const SEND_RETRY_MSEC = 250;
// Gives a page a chance to start navigating after an action
const SETTLE_MSEC = 200;

function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options) as string;
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer: {id?: ReturnType<typeof setTimeout>} = {};
    const listener = (id: number, info: {status?: string}): void => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer.id);
        Browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    timer.id = setTimeout(() => {
      Browser.tabs.onUpdated.removeListener(listener);
      reject(new Error(t('script.error.loadTimeout')));
    }, TAB_LOAD_TIMEOUT_MSEC);
    Browser.tabs.onUpdated.addListener(listener);
    Browser.tabs.get(tabId).then((tab) => listener(tabId, tab), reject);
  });
}

/**
 * Replays a Zest script in a new window or tab. The first launch statement
 * creates it and everything else runs against it. Window close and comment statements are ignored.
 */
class ScriptPlayer {
  private mode: RunMode;

  private stepThrough: boolean;

  private resumeNext?: () => void;

  /** Called when the player starts or stops waiting for the user to press Next. */
  onPauseChange?: (paused: boolean, nextStatement: string) => void;

  private stopped = false;

  private tabId?: number;

  constructor(mode: RunMode = 'window', stepThrough = false) {
    this.mode = mode;
    this.stepThrough = stepThrough;
  }

  stop(): void {
    this.stopped = true;
    this.resumeNext?.();
    if (this.tabId !== undefined) {
      // Stops a statement that is waiting for its element or about to act
      Browser.tabs
        .sendMessage(this.tabId, {type: REPLAY_ABORT})
        .catch(() => {});
    }
  }

  /** Runs the next statement when stepping through the script. */
  next(): void {
    this.resumeNext?.();
  }

  // Best effort - the controls are also available in the script tab
  private async showStepControls(display: ReplayPauseDisplay): Promise<void> {
    try {
      await waitForTabLoad(this.tabId as number);
      if (!this.resumeNext) {
        // Next or Stop was used while the page was loading
        return;
      }
      await Browser.tabs.sendMessage(this.tabId as number, {
        type: REPLAY_PAUSE,
        data: display,
      });
    } catch {
      // Ignore, e.g. the tab has been closed
    }
  }

  private async waitForNext(
    statementText: string,
    display: ReplayPauseDisplay
  ): Promise<void> {
    const resumed = new Promise<void>((resolve) => {
      this.resumeNext = resolve;
    });
    this.onPauseChange?.(true, statementText);
    this.showStepControls(display);
    await resumed;
    this.resumeNext = undefined;
    this.onPauseChange?.(false, statementText);
    this.checkNotStopped();
  }

  private async sendToTab(
    statement: RawStatement,
    display: ReplayDisplay
  ): Promise<ReplayResult> {
    let lastError: unknown;
    for (let i = 0; i < SEND_RETRIES; i += 1) {
      this.checkNotStopped();
      try {
        // eslint-disable-next-line no-await-in-loop
        return (await Browser.tabs.sendMessage(this.tabId as number, {
          type: REPLAY_STATEMENT,
          data: statement,
          display,
        })) as ReplayResult;
      } catch (e) {
        // The content script may not be ready yet
        lastError = e;
        // eslint-disable-next-line no-await-in-loop
        await sleep(SEND_RETRY_MSEC);
      }
    }
    throw new Error(t('script.error.talkFailed', {error: lastError}));
  }

  private checkNotStopped(): void {
    if (this.stopped) {
      throw new Error(t('script.error.stopped'));
    }
  }

  private async runStatement(
    statement: RawStatement,
    display: ReplayDisplay
  ): Promise<void> {
    this.checkNotStopped();
    if (statement.elementType === ZEST_CLIENT_LAUNCH) {
      const url = String(statement.url);
      if (!isReplayableUrl(url)) {
        throw new Error(t('script.error.badUrl', {url}));
      }
      if (this.tabId === undefined) {
        if (this.mode === 'window') {
          const win = await Browser.windows.create({url, focused: true});
          this.tabId = win.tabs?.[0]?.id;
        } else {
          const tab = await Browser.tabs.create({url, active: true});
          this.tabId = tab.id;
        }
        if (this.tabId === undefined) {
          throw new Error(t('script.error.openFailed'));
        }
      } else {
        await Browser.tabs.update(this.tabId, {url});
      }
      await waitForTabLoad(this.tabId as number);
      this.checkNotStopped();
      return;
    }
    if (this.tabId === undefined) {
      throw new Error(t('script.error.noLaunch'));
    }
    await waitForTabLoad(this.tabId);
    const result = await this.sendToTab(statement, display);
    // A statement that finished after the script was stopped is not a success
    this.checkNotStopped();
    if (!result.ok) {
      throw new Error(
        t(result.errorKey ?? 'script.error.unexpected', result.errorParams)
      );
    }
    await sleep(SETTLE_MSEC);
    this.checkNotStopped();
  }

  // Best effort - the overlay is purely informational
  private async notifyFinished(ok: boolean, message: string): Promise<void> {
    const display: ReplayFinishDisplay = {
      ok,
      message,
      title: t('script.overlayTitle'),
      heading: ok ? t('script.complete') : t('script.failedHeading'),
    };
    try {
      await waitForTabLoad(this.tabId as number);
      await Browser.tabs.sendMessage(this.tabId as number, {
        type: REPLAY_FINISHED,
        data: display,
      });
    } catch {
      // Ignore, e.g. the tab has been closed
    }
  }

  /**
   * Runs the statements in order, stopping at the first failure.
   * @returns true if all of the statements ran successfully.
   */
  async play(
    statements: RawStatement[],
    delayMsec: number,
    onState: (position: number, state: StatementState, message?: string) => void
  ): Promise<boolean> {
    this.stopped = false;
    this.tabId = undefined;
    let first = true;
    for (let i = 0; i < statements.length; i += 1) {
      const statement = statements[i];
      if (
        statement.enabled === false ||
        statement.elementType === ZEST_CLIENT_WINDOW_CLOSE ||
        statement.elementType === ZEST_COMMENT
      ) {
        onState(i, 'skipped');
      } else {
        onState(i, 'running');
        try {
          const text = summarizeStatement(statement);
          const counts = {position: i + 1, total: statements.length};
          const display: ReplayDisplay = {
            title: t('script.overlayTitle'),
            heading: t('script.step', counts),
            text,
          };
          if (!first && this.stepThrough) {
            // eslint-disable-next-line no-await-in-loop
            await this.waitForNext(text, {
              title: display.title,
              heading: t('script.stepPaused', counts),
              text: t('script.nextStatement', {statement: text}),
              nextLabel: t('script.next'),
              cancelLabel: t('script.cancel'),
            });
          } else if (!first && delayMsec > 0) {
            // eslint-disable-next-line no-await-in-loop
            await sleep(delayMsec);
            this.checkNotStopped();
          }
          first = false;
          // eslint-disable-next-line no-await-in-loop
          await this.runStatement(statement, display);
          onState(i, 'ok');
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          onState(i, 'failed', message);
          if (this.tabId !== undefined) {
            // eslint-disable-next-line no-await-in-loop
            await this.notifyFinished(false, message);
          }
          return false;
        }
      }
    }
    if (this.tabId !== undefined) {
      await this.notifyFinished(true, t('script.completed'));
    }
    return true;
  }
}

export default ScriptPlayer;
export type {RunMode, StatementState};

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
  REPLAY_PING,
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
// How long to wait for a page to load before showing how the script finished
const FINISH_WAIT_MSEC = 2000;

function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options) as string;
}

/**
 * Waits for the tab to finish loading, giving up if it takes too long or if
 * the signal is aborted. The timer and listener are always cleaned up.
 */
function waitForTabLoad(
  tabId: number,
  signal?: AbortSignal,
  timeoutMsec = TAB_LOAD_TIMEOUT_MSEC
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(t('script.error.stopped')));
      return;
    }
    const state: {
      timer?: ReturnType<typeof setTimeout>;
      onUpdated?: (id: number, info: {status?: string}) => void;
      onAbort?: () => void;
    } = {};
    const finish = (error?: Error): void => {
      clearTimeout(state.timer);
      if (state.onUpdated) {
        Browser.tabs.onUpdated.removeListener(state.onUpdated);
      }
      if (state.onAbort) {
        signal?.removeEventListener('abort', state.onAbort);
      }
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    state.onUpdated = (id, info): void => {
      if (id === tabId && info.status === 'complete') {
        finish();
      }
    };
    state.onAbort = (): void => finish(new Error(t('script.error.stopped')));
    state.timer = setTimeout(
      () => finish(new Error(t('script.error.loadTimeout'))),
      timeoutMsec
    );
    Browser.tabs.onUpdated.addListener(state.onUpdated);
    signal?.addEventListener('abort', state.onAbort);
    Browser.tabs.get(tabId).then(
      (tab) => state.onUpdated?.(tabId, tab),
      (error) => finish(error)
    );
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

  // Aborted when the script is stopped, to end any waits at once
  private aborter = new AbortController();

  private tabId?: number;

  constructor(mode: RunMode = 'window', stepThrough = false) {
    this.mode = mode;
    this.stepThrough = stepThrough;
  }

  stop(): void {
    this.stopped = true;
    this.aborter.abort();
    this.resumeNext?.();
    if (this.tabId !== undefined) {
      // Stops a statement that is waiting for its element or about to act
      Browser.tabs
        .sendMessage(this.tabId, {type: REPLAY_ABORT})
        .catch(() => {});
    }
  }

  /** Whether the tab is the one that this player is replaying the script in. */
  ownsTab(tabId?: number): boolean {
    return tabId !== undefined && tabId === this.tabId;
  }

  /** Runs the next statement when stepping through the script. */
  next(): void {
    this.resumeNext?.();
  }

  // Best effort - the controls are also available in the script tab
  private async showStepControls(
    display: ReplayPauseDisplay,
    signal: AbortSignal
  ): Promise<void> {
    try {
      await waitForTabLoad(this.tabId as number, signal);
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
    // Ends the wait for the page to show the buttons, once they are not needed
    const paused = new AbortController();
    this.showStepControls(display, paused.signal);
    await resumed;
    paused.abort();
    this.resumeNext = undefined;
    this.onPauseChange?.(false, statementText);
    this.checkNotStopped();
  }

  /**
   * Waits until the content script in the page answers. This is done with a
   * message that has no effect, so that it is safe to repeat.
   */
  private async waitForPage(): Promise<void> {
    let lastError: unknown;
    for (let i = 0; i < SEND_RETRIES; i += 1) {
      this.checkNotStopped();
      try {
        // eslint-disable-next-line no-await-in-loop
        await Browser.tabs.sendMessage(this.tabId as number, {
          type: REPLAY_PING,
        });
        return;
      } catch (e) {
        // The content script may not be ready yet
        lastError = e;
        // eslint-disable-next-line no-await-in-loop
        await sleep(SEND_RETRY_MSEC, this.aborter.signal);
      }
    }
    throw new Error(t('script.error.talkFailed', {error: lastError}));
  }

  private async tabExists(): Promise<boolean> {
    try {
      await Browser.tabs.get(this.tabId as number);
      return true;
    } catch {
      return false;
    }
  }

  private async sendToTab(
    statement: RawStatement,
    display: ReplayDisplay
  ): Promise<ReplayResult> {
    await this.waitForPage();
    this.checkNotStopped();
    // The statement is only ever sent once, as it may have had an effect, even
    // if there was no answer
    try {
      return (await Browser.tabs.sendMessage(this.tabId as number, {
        type: REPLAY_STATEMENT,
        data: statement,
        display,
      })) as ReplayResult;
    } catch (e) {
      if (await this.tabExists()) {
        // The page was replaced, e.g. by a click that loads another page, which
        // closes the channel the answer would have used
        return {ok: true};
      }
      throw new Error(t('script.error.talkFailed', {error: e}));
    }
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
      await waitForTabLoad(this.tabId as number, this.aborter.signal);
      this.checkNotStopped();
      return;
    }
    if (this.tabId === undefined) {
      throw new Error(t('script.error.noLaunch'));
    }
    await waitForTabLoad(this.tabId, this.aborter.signal);
    const result = await this.sendToTab(statement, display);
    // A statement that finished after the script was stopped is not a success
    this.checkNotStopped();
    if (!result.ok) {
      throw new Error(
        t(result.errorKey ?? 'script.error.unexpected', result.errorParams)
      );
    }
    await sleep(SETTLE_MSEC, this.aborter.signal);
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
      if (!this.stopped) {
        // Only for a short time, as nothing depends on this being shown
        await waitForTabLoad(this.tabId as number, undefined, FINISH_WAIT_MSEC);
      }
    } catch {
      // Try to show it anyway
    }
    try {
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
    this.aborter = new AbortController();
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
            await sleep(delayMsec, this.aborter.signal);
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

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

type OverlayState = 'running' | 'ok' | 'failed';

interface OverlayAction {
  label: string;
  onClick: () => void;
}

interface ReplayStatus {
  title: string;
  heading: string;
  text: string;
  state: OverlayState;
}

const POSITION_KEY = 'zapreplayoverlaypos';
const COLORS: Record<OverlayState, string> = {
  running: '#2979ff',
  ok: '#1a7f37',
  failed: '#e74c3c',
};
const STYLE = `
  :host { all: initial; }
  .box {
    box-sizing: border-box;
    width: 360px;
    padding: 10px 14px;
    background: #f9f9f9;
    color: #333;
    border: 2px solid #2979ff;
    border-radius: 5px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    font-family: Roboto, Arial, sans-serif;
    text-align: center;
    cursor: move;
    user-select: none;
    touch-action: none;
  }
  .title { font-weight: bold; font-size: 16px; }
  .heading { font-size: 13px; color: #666; margin: 2px 0; }
  .text { font-size: 15px; word-break: break-all; }
  .actions { display: flex; justify-content: center; gap: 10px; margin-top: 8px; }
  .actions button { font: inherit; font-size: 14px; padding: 4px 16px; cursor: pointer; }
`;

/**
 * A small movable box shown on the page being replayed.
 * It lives in a shadow root attached to the html element (not the body) so
 * that it cannot change, or be matched by, the locators used in the script.
 * Nothing in here is allowed to throw into the replay.
 */
class ReplayOverlay {
  private host?: HTMLElement;

  private box?: HTMLElement;

  private titleElement?: HTMLElement;

  private heading?: HTMLElement;

  private text?: HTMLElement;

  private actions?: HTMLElement;

  private hideTimer?: ReturnType<typeof setTimeout>;

  show(
    status: ReplayStatus,
    hideAfterMsec = 0,
    actions: OverlayAction[] = []
  ): void {
    try {
      this.ensureCreated();
      clearTimeout(this.hideTimer);
      (this.host as HTMLElement).style.display = 'block';
      (this.box as HTMLElement).style.borderColor = COLORS[status.state];
      (this.titleElement as HTMLElement).textContent = status.title;
      (this.heading as HTMLElement).textContent = status.heading;
      (this.text as HTMLElement).textContent = status.text;
      this.setActions(actions);
      if (hideAfterMsec > 0) {
        this.hideTimer = setTimeout(() => this.hide(), hideAfterMsec);
      }
    } catch (e) {
      console.log('ZAP replay overlay error', e);
    }
  }

  private setActions(actions: OverlayAction[]): void {
    const container = this.actions as HTMLElement;
    container.textContent = '';
    actions.forEach((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        // Only one choice can be made for each pause
        container.querySelectorAll('button').forEach((b) => {
          b.disabled = true;
        });
        action.onClick();
      });
      container.appendChild(button);
    });
  }

  hide(): void {
    if (this.host) {
      this.host.style.display = 'none';
    }
  }

  private ensureCreated(): void {
    if (this.host?.isConnected) {
      return;
    }
    const host = document.createElement('zap-replay-overlay');
    host.style.cssText =
      'all: initial; position: fixed; z-index: 2147483647; top: 16px; right: 16px;';
    const root = host.attachShadow({mode: 'closed'});
    const style = document.createElement('style');
    style.textContent = STYLE;
    const box = document.createElement('div');
    box.className = 'box';
    const title = document.createElement('div');
    title.className = 'title';
    const heading = document.createElement('div');
    heading.className = 'heading';
    const text = document.createElement('div');
    text.className = 'text';
    const actions = document.createElement('div');
    actions.className = 'actions';
    box.append(title, heading, text, actions);
    root.append(style, box);
    document.documentElement.appendChild(host);
    this.host = host;
    this.box = box;
    this.titleElement = title;
    this.heading = heading;
    this.text = text;
    this.actions = actions;
    this.makeDraggable(host, box);
    this.restorePosition(host);
  }

  private makeDraggable(host: HTMLElement, box: HTMLElement): void {
    let start: {x: number; y: number; left: number; top: number} | undefined;
    box.addEventListener('pointerdown', (e) => {
      // Let the buttons be clicked rather than dragged
      if ((e.target as Element).tagName === 'BUTTON') {
        return;
      }
      const rect = host.getBoundingClientRect();
      start = {x: e.clientX, y: e.clientY, left: rect.left, top: rect.top};
      box.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    box.addEventListener('pointermove', (e) => {
      if (!start) {
        return;
      }
      this.moveTo(
        host,
        start.left + e.clientX - start.x,
        start.top + e.clientY - start.y
      );
    });
    box.addEventListener('pointerup', () => {
      if (!start) {
        return;
      }
      start = undefined;
      this.savePosition(host);
    });
  }

  private moveTo(host: HTMLElement, left: number, top: number): void {
    const maxLeft = Math.max(window.innerWidth - host.offsetWidth, 0);
    const maxTop = Math.max(window.innerHeight - host.offsetHeight, 0);
    host.style.right = 'auto';
    host.style.left = `${Math.min(Math.max(left, 0), maxLeft)}px`;
    host.style.top = `${Math.min(Math.max(top, 0), maxTop)}px`;
  }

  // The position is kept as a fraction of the window so that it is remembered
  // from page to page.
  private savePosition(host: HTMLElement): void {
    const rect = host.getBoundingClientRect();
    Browser.storage.local
      .set({
        [POSITION_KEY]: {
          left: rect.left / window.innerWidth,
          top: rect.top / window.innerHeight,
        },
      })
      .catch(() => {});
  }

  private restorePosition(host: HTMLElement): void {
    Browser.storage.local
      .get(POSITION_KEY)
      .then((items) => {
        const pos = items[POSITION_KEY] as {left: number; top: number};
        if (pos && host.isConnected) {
          this.moveTo(
            host,
            pos.left * window.innerWidth,
            pos.top * window.innerHeight
          );
        }
      })
      .catch(() => {});
  }
}

export default ReplayOverlay;
export type {OverlayAction, ReplayStatus};

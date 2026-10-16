/*
 * Zed Attack Proxy (ZAP) and its related source files.
 *
 * ZAP is an HTTP/HTTPS proxy for assessing web application security.
 *
 * Copyright 2023 The ZAP Development Team
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
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n.use(LanguageDetector).init({
  resources: {
    en: {
      translation: {
        start: 'Start Recording',
        stop: 'Stop Recording',
        download: 'Download Script',
        view: 'View Script',
        options: 'Options',
        help: 'Help',
        loginUrl: 'Login URL',
        scriptName: 'Script Name',
        script: {
          untitled: 'Untitled script',
          defaultFileName: 'script',
          noStatements:
            'There are no statements. Record a script, or use Add to create one.',
          statementCount: '{{count}} statement(s)',
          loadScriptFailed: 'Failed to load script: {{error}}',
          saveFailed: 'Failed to save the changes: {{error}}',
          loaded: 'Loaded {{count}} statement(s) from {{file}}',
          loadFileFailed: 'Failed to load {{file}}: {{error}}',
          running: 'Running...',
          completed: 'Script completed successfully',
          failed: 'Script failed',
          paused: 'Paused. Next: {{statement}}',
          stopRecordingFirst: 'Stop recording before running the script',
          moveUp: 'Move up',
          moveDown: 'Move down',
          edit: 'Edit',
          delete: 'Delete',
          editTitle: 'Edit {{type}}',
          addTitle: 'Add {{type}}',
          deleteTitle: 'Delete statement',
          deleteMessage: 'Are you sure you want to delete this statement?',
          newTitle: 'New script',
          newMessage:
            'This will discard the current script and its {{count}} statement(s). Are you sure?',
          discard: 'Discard',
          new: 'New',
          load: 'Load...',
          save: 'Save',
          refresh: 'Refresh',
          run: 'Run',
          runInWindow: 'in New Window',
          runInTab: 'in New Tab',
          runModeTitle: 'Where to run the script',
          stepThrough: 'Step through',
          next: 'Next',
          stop: 'Stop',
          undo: 'Undo',
          add: 'Add',
          columnStatement: 'Statement',
          columnResult: 'Result',
          cancel: 'Cancel',
          pageTitle: 'ZAP Recorded Script',
          overlayTitle: 'ZAP Replay',
          step: 'Step {{position}} of {{total}}',
          stepPaused: 'Step {{position}} of {{total}} - paused',
          nextStatement: 'Next: {{statement}}',
          complete: 'Complete',
          failedHeading: 'Failed',
          error: {
            stopped: 'Stopped',
            noLaunch: 'The script must start with a launch statement',
            badUrl: 'Only http and https URLs can be launched: {{url}}',
            openFailed: 'Failed to open the page',
            talkFailed: 'Could not talk to the page: {{error}}',
            loadTimeout: 'Timed out waiting for the page to load',
            elementNotFound: 'Element not found: {{type}}: {{element}}',
            badLocator: 'Unsupported locator type: {{type}}',
            badStatement: 'Unsupported statement: {{type}}',
            optionNotFound: 'Option not found: {{option}}',
            frameNotFound: 'Frame not found: {{frame}}',
            frameCrossOrigin:
              'Cannot access frame {{frame}}, it may be cross origin',
            topWindow: 'Already in the top window',
            notInForm: 'Element is not in a form',
            unexpected: '{{message}}',
          },
        },
        summary: {
          launch: 'Launch {{browser}} {{url}}',
          click: 'Click element {{locator}}',
          scrollTo: 'Scroll to element {{locator}}',
          sendKeys: 'Send keys "{{keys}}" to element {{locator}}',
          submit: 'Submit element {{locator}}',
          clear: 'Clear element {{locator}}',
          mouseOver: 'Mouse over element {{locator}}',
          switchToFrame: 'Switch to frame {{frame}}',
          frameParent: 'parent',
          frameName: 'name {{name}}',
          frameIndex: 'index {{index}}',
          closeWindow: 'Close window {{handle}}',
          comment: 'Comment: {{comment}}',
          unknown: 'Unknown statement',
        },
        edit: {
          type: {
            launch: 'Launch',
            click: 'Click',
            sendKeys: 'Send keys',
            clear: 'Clear',
            submit: 'Submit',
            scrollTo: 'Scroll to',
            mouseOver: 'Mouse over',
            switchToFrame: 'Switch to frame',
            closeWindow: 'Close window',
            comment: 'Comment',
          },
          field: {
            locatorType: 'Locator type',
            locator: 'Locator',
            waitFor: 'Wait for (ms)',
            keys: 'Keys',
            browser: 'Browser',
            url: 'URL',
            frameIndex: 'Frame index (-1 for parent)',
            frameName: 'Frame name',
            sleep: 'Sleep (seconds)',
            comment: 'Comment',
            enabled: 'Enabled',
          },
          error: {
            required: '{{field}} is required',
            wholeNumber: '{{field}} must be a whole number',
            badUrl: 'URL must be a valid http or https URL',
            notJson: 'The file is not valid JSON',
            notZest: 'The file is not a Zest script',
            unsupportedMetadata:
              'The script uses features that cannot be preserved ({{features}})',
          },
          metadata: {
            type: 'script type',
            description: 'description',
            prefix: 'prefix',
            parameters: 'parameters',
            authentication: 'authentication',
          },
        },
      },
    },
  },
  defaultNS: 'translation',
  fallbackLng: 'en',
  debug: false,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;

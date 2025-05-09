# ZAP Browser Extensions

This repo defines 2 related ZAP browser extensions.

## The 'Full' Extension

A browser extension which allows [ZAP](https://www.zaproxy.org) to interact directly with the browser.
It also allows you to record whatever you do in a browser as [Zest](https://github.com/zaproxy/zest) scripts.
These can be used to handle complicated authentication flows or sequences of related actions.

[![ZAP Chat: Modern Apps Part 1](https://img.youtube.com/vi/Rq_d7OLmMfw/0.jpg)](https://www.youtube.com/watch?v=Rq_d7OLmMfw)

Works in both Firefox and Chrome.

Initially generated from https://github.com/abhijithvijayan/web-extension-starter/tree/react-typescript

Only Firefox and Chrome have been tested - Opera may or may not work :wink:

This extension is bundled in the ZAP [Client Side Integration](https://www.zaproxy.org/docs/desktop/addons/client-side-integration/)
add-on, so you typically do not need to install it manually.


The latest published extensions are still available via the relevant stores:

* Firefox [ZAP by Checkmarx Browser Extension](https://addons.mozilla.org/en-GB/firefox/addon/zap-browser-extension/)
* Chrome [ZAP by Checkmarx Browser Extension](https://chromewebstore.google.com/detail/zap-by-checkmarx-browser/cgkggmillbmmpokepnicllalaohphffo)

## The Recorder Extension

This extension only allows you to record [Zest](https://github.com/zaproxy/zest) scripts in the browser.
It will not interact with ZAP, even if you have it running.

You can use this extension to record Zest scripts on a system on which ZAP is not running.

The latest published extensions will be available via the relevant stores:

* Firefox - ZAP by Checkmarx Recorder TBA
* Chrome - ZAP by Checkmarx Recorder TBA

## Quick Start

Ensure you have

- [Node.js](https://nodejs.org) 16 or later installed
- [Yarn](https://yarnpkg.com) v1 or v2 installed

Then run the following:

- `yarn install` to install dependencies.
- `yarn run dev:chrome` to start the development server for the full chrome extension
- `yarn run dev:firefox` to start the development server for the full firefox addon
- `yarn run dev:opera` to start the development server for the full opera extension
- `yarn run build:ext:chrome` to build the full chrome extension
- `yarn run build:ext:firefox` to build the full firefox addon
- `yarn run build:ext:opera` to build the full opera extension
- `yarn run build:ext` builds and packs the full extensions all at once to extension/ directory
- `yarn run build:rec:chrome` to build the recorder chrome extension
- `yarn run build:rec:firefox` to build the recorder firefox addon
- `yarn run build:rec:opera` to build the recorder opera extension
- `yarn run build:rec` builds and packs the recorder extensions all at once to extension/ directory
- `yarn run build` builds and packs both the full and recorder extensions all at once to extension/ directory
- `yarn run lint` to lint the code
- `yarn run lint --fix` to fix any lint errors
- `yarn run test` to run the test suite (you should not have anything listening on port 8080)
  - Note that individual tests can be run like `yarn run test -t "Should report forms"`


### Development

- `yarn install` to install dependencies.
- To watch file changes in development

  - Chrome
    - `yarn run dev:chrome`
  - Firefox
    - `yarn run dev:firefox`
  - Opera
    - `yarn run dev:opera`

- **Load extension in browser**

- ### Chrome

  - Go to the browser address bar and type `chrome://extensions`
  - Check the `Developer Mode` button to enable it.
  - Click on the `Load Unpacked Extension…` button.
  - Select your browsers folder in `extension/`.

- ### Firefox

  - Load the Add-on via `about:debugging` as temporary Add-on.
  - Choose the `manifest.json` file in the extracted directory

- ### Opera

  - Load the extension via `opera:extensions`
  - Check the `Developer Mode` and load as unpacked from extension’s extracted directory.

### Production

- `yarn run build` builds the extension for all the browsers to `extension/BROWSER` directory respectively.


### Linting & TypeScript Config

- Shared Eslint & Prettier Configuration - [`@abhijithvijayan/eslint-config`](https://www.npmjs.com/package/@abhijithvijayan/eslint-config)
- Shared TypeScript Configuration - [`@abhijithvijayan/tsconfig`](https://www.npmjs.com/package/@abhijithvijayan/tsconfig)

## Licenses

### ZAP Code

All of the ZAP specific code is licensed under ApacheV2 © The ZAP Core Team

### Web Extension Starter

The Web Extension Starter is licensed under MIT © [Abhijith Vijayan](https://abhijithvijayan.in)
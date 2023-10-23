# ZAP Browser Extension

A browser extension which allows [ZAP](https://www.zaproxy.org) to interact directly with the browser.

Works in both Firefox and Chrome but does not provide any useful functionality unless it is used with ZAP.

Initially generated from https://github.com/abhijithvijayan/web-extension-starter/tree/react-typescript

Only Firefox and Chrome have been tested - Opera may or may not work :wink:

The latest published extensions are also available via the relevant stores:

* Firefox [ZAP Browser Extension](https://addons.mozilla.org/en-GB/firefox/addon/zap-browser-extension/)
* Chrome [ZAP Browser Extension](https://chrome.google.com/webstore/detail/zap-browser-extension/cnmficmodhagepcmhogkbdakncebckho)

## Quick Start

Ensure you have

- [Node.js](https://nodejs.org) 16 or later installed
- [Yarn](https://yarnpkg.com) v1 or v2 installed

Then run the following:

- `yarn install` to install dependencies.
- `yarn run dev:chrome` to start the development server for chrome extension
- `yarn run dev:firefox` to start the development server for firefox addon
- `yarn run dev:opera` to start the development server for opera extension
- `yarn run build:chrome` to build chrome extension
- `yarn run build:firefox` to build firefox addon
- `yarn run build:opera` to build opera extension
- `yarn run build` builds and packs extensions all at once to extension/ directory

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
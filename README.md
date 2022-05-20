# OWASP ZAP Browser Extension

A browser extension which allows [OWASP ZAP](https://www.zaproxy.org) to interact directly with the browser.

Works in both Firefox and Chrome but does not provide any useful functionality unless it is used with ZAP.

Initially generated from https://github.com/abhijithvijayan/web-extension-starter 

## Start Commands

```sh
npm install
npm run prebuild
npm run init:profile
npm run build:<browser_name> # brave | chrome | firefox
npm run start:<browser_name> # brave | chrome | firefox
```

After first run, you can just do `npm run start:<browser_name>`

## Commands

```sh
# Initial Setup
# Install packages
npm install

# Prebuild
npm run prebuild

# Init dirs for browser profiles
npm run init:profile

# Live Build for specific browser
# browser_name: chrome | firefox
npm run watch:<browser_name>

# Live Build for chrome
npm run watch:chrome

# Live Build and Reload for specific browser
# browser_name: chrome | firefox
npm run start:<browser_name>

# Live Build and Reload for chrome
npm run start:chrome

# Build for all Browsers
npm run build

# Build for specific browser
# browser_name: chrome | firefox
npm run build:<browser_name>

# Build for chrome
npm run build:chrome

# Run Tests with Mocha
npm run test

# Clean Builds
npm run clean
```


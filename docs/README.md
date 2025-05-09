# ZAP Browser Extension Store Docs

This directory contains the information and screenshots used for the browser stores:

* [Firefox Add-Ons](https://addons.mozilla.org/en-GB/firefox/addon/zap-browser-extension/)
* [Chrome Web Store](https://chrome.google.com/webstore/detail/zap-browser-extension/oeadiegekjdlhpooeidmimgnmbfllehp)

## Title

ZAP by Checkmarx Browser Extension

## Summary

Note that in the Chrome store the description in the manifest has a limit of 132 characters.

### Extension

A browser extension which allows ZAP to access the client side of a web app.

### Recorder

An extension for recording actions taken in the browser. It can be used to record things like auth scripts to be used in ZAP.

## Description

### Extension

ZAP by Checkmarx is a free OSS security tool which can be used to test the security of your web apps.
This browser extension will allow ZAP to gather more information about your app from the browser.
Most users should not install this extension.
It will be bundled in a ZAP add-on - this add-on will add the extension to Firefox/Chrome when it is launched from ZAP.

### Recorder

An extension for recording actions taken in the browser. It can be used to record things like auth scripts to be used in ZAP.

## Category

* Firefox: Privacy and Security
* Chrome: Developer Tools

## Additional Fields

Video: https://www.youtube.com/watch?v=Rq_d7OLmMfw

Homepage: https://github.com/zaproxy/browser-extension

Support URL: https://groups.google.com/group/zaproxy-users

## Chrome Privacy Practices

### Single Purpose

This extension is designed for people testing the security of their own apps. We do not expect people to install it in their main Chrome profile, at least not at this stage. We will be bundling it with ZAP which will then add it to the Chrome instances that it launches - these will be in a temporary profile.

### Permission Justification

#### Tabs Justification

As mentioned above, this is a security extension which we do not expect people to install in their main Chrome profile.
The extension streams a summary of the key events to ZAP - we do this by using event listeners and by polling, e.g. for storage changes. We need to know when the user leaves the current page in order to make a final check for things like local storage changes.

#### Cookies Justification

As a security tool it is essential to see and report what cookies are being set. This is a key feature of this extension.

#### Storage Justification

As a security tool it is essential to see and report what is being put in local storage. This is a key feature of this extension.

#### Host Permission Justification

It's a security tool :) We have no idea which sites a security person will want to test.

#### Privacy Policy URL

https://www.zaproxy.org/faq/what-data-does-zap-collect/

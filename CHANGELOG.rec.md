# Changelog
All notable changes to the recorder browser extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## Unreleased

### Fixed
- Record interactions on replaced frames.

## 0.1.5 - 2025-07-28

### Changed
- Do not record frame switches on mouse over events as they are not currently recorded.

### Fixed
- Include start URL loading time in `waitForMsec` of the first recorded action.
- Correct the position of the notification dialog when the page being recorded uses frames.
- Record submitted inputs dynamically added to frames.
- Correct recording of frames not immediately loaded.

## 0.1.4 - 2025-06-30

### Added
- Edge Add-ons Store details.

### Fixed
- Do not record empty elements.
- Correct `waitForMsec` for synthetic scroll to events.

## 0.1.3 - 2025-06-18

### Fixed
- Download on script completion on Chrome.
- Download file date string.
- Download via popup on Edge.
- Close notification dialog when script downloaded directly.

## 0.1.2 - 2025-06-17

### Added
- 'ZAP' prefix to all content script console.log messages.

### Fixed
- Recording could break when launched from ZAP.

## 0.1.1 - 2025-06-10

### Added
- Help for the notification panel.

### Fixed
- Ignore the ZAP notification panel when calculating xpaths of interacted elements.

## 0.1.0 - 2025-06-06

### Added
- Help screen

### Changed
- Auto-download the script if stopped from the notification panel.

## 0.0.3 - 2025-05-28

### Added
- Allow to provide the login URL through the recording panel.

## 0.0.2 - 2025-05-23

### Fixed
- Initialize the Zest script also when injecting the content script to record the page accessed after starting the recording, as opposed to starting after accessing the page.

## 0.0.1 - 2025-05-09

### Added
- First version, recorder split from full extension.

# Changelog
All notable changes to the full browser extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## Unreleased

### Added
- Support for dark mode

## 0.1.6 - 2025-08-04

### Fixed
- Record interactions on replaced frames.
- Correct recording with start URL in Chrome/Edge which could lead to missing browser launch.

## 0.1.5 - 2025-07-28

### Changed
- Do not record frame switches on mouse over events as they are not currently recorded.

### Fixed
- Include start URL loading time in `waitForMsec` of the first recorded action.
- Correct the position of the notification dialog when the page being recorded uses frames.
- Record submitted inputs dynamically added to frames.
- Correct recording of frames not immediately loaded.

## 0.1.4 - 2025-06-30

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

## 0.0.15 - 2025-05-28

### Added
- Allow to provide the login URL through the recording panel.

## 0.0.14 - 2025-05-23

### Fixed
- Initialize the Zest script also when injecting the content script to record the page accessed after starting the recording, as opposed to starting after accessing the page.

## 0.0.13 - 2025-05-09

### Added
- Zest comment including the extension version when recording.
- New recorder extension, which is a cut down version of the full one, without the capability to talk to ZAP.
- Support for incognito mode.

## 0.0.12 - 2025-05-05

### Changed
- When recording scroll to statements will be added prior to and associated with typing, clicks, and submissions.
- Where practical statements are now recorded including a waitForMsec property value rounded up to the nearest 5sec.

### Removed
- Clear statements before inputting text, they were not needed and could cause problems.

## 0.0.11 - 2025-01-17

### Added
- Option to start recording when the browser is launched.

### Changed
- The default to not send data to ZAP.

## 0.0.10 - 2024-12-20

### Changed
- Report index of the forms.

## 0.0.9 - 2024-11-28

### Added
- Support for Enter key in input fields.

### Changed
- Branding to ZAP by Checkmarx.

## 0.0.8 - 2023-12-01

### Added
- Input field type and form index.

### Changed
- Poll for storage changes.

## 0.0.7 - 2023-10-23

### Changed
- Init ZAP URL to http://zap/ instead of http://localhost:8080/

### Fixed
- Same links continually reported on domMutation events (Issue 81).

## 0.0.6 - 2023-09-19

### Fixed
- Storage events not being reported.

# Changelog
All notable changes to this add-on will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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

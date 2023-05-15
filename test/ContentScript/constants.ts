import path from 'path';

export const extensionPath = {
  CHROME: path.join(__dirname, '..', '..', 'extension', 'chrome'),
  FIREFOX: path.join(__dirname, '..', '..', 'extension', 'firefox.xpi'),
};

export const HTTPPORT = 1801;
export const JSONPORT = 8080;
export const BROWSERNAME = {
  CHROME: 'chrome',
  FIREFOX: 'firefox',
};

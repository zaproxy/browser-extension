const base = require('./base/v2');

module.exports = {
  ...base,
  browser_specific_settings: {
    gecko: {
      id: "browser-extension@zaproxy.org",
      strict_min_version: "91.0"
    }
  }
}
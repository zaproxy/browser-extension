const base = require('./base/v2');

module.exports = {
  ...base,
  applications: {
    gecko: {
      id: "browser-extension-unlisted@zaproxy.org",
      strict_min_version: "91.0"
    }
  }
}
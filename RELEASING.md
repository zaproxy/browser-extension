# Releasing the Extensions

1. Update the versions in `source/manifest.json` and `source/manifest.rec.json`
1. Update `CHANGELOG.md` with the new (full extension) version
1. Submit a PR with the above changes
1. Once the PR has been merged
  1. Tag the release e.g. `git tag -a v0.0.x -m "Release v0.0.x"`
  1. Push the tag e.g. `git push upstream v0.0.x`
1. Run `yarn run build`
1. Upload the extensions to Firefox Add-Ons and the Chrome Web Store
  1. https://addons.mozilla.org/en-GB/developers/addon/zap-browser-extension/edit
  1. https://chrome.google.com/webstore/devconsole
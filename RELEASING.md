# Releasing the Extensions

1. Update the versions in `source/manifest.json` and `source/manifest.rec.json`
1. Update `CHANGELOG.md` and `CHANGELOG.rec.md` with the new versions
1. Submit a PR with the above changes
1. Once the PR has been merged
  1. Tag the full release e.g. `git tag -a v0.1.x -m "Release Full v0.1.x"`
  1. Push the full tag e.g. `git push upstream v0.1.x`
  1. Tag the recorder release e.g. `git tag -a rec-v0.1.x -m "Release Recorder v0.1.x"`
  1. Push the recorder tag e.g. `git push upstream rec-v0.1.x`
1. Run `yarn run build`
1. Upload the extensions to Firefox Add-Ons, Chrome Web Store, and Edge Add-ons (Recorder only for now)
  1. https://addons.mozilla.org/en-GB/developers/addon/zap-browser-extension/edit
  1. https://addons.mozilla.org/en-GB/developers/addon/zap-by-checkmarx-recorder/edit
  1. https://chrome.google.com/webstore/devconsole
  1. https://partner.microsoft.com/en-us/dashboard/microsoftedge/overview
1. Update `CHANGELOG.md` and `CHANGELOG.rec.md` with a new Unreleased section
1. Submit a PR with the above changes

# Releasing greenroom

The Windows installer is built on a GitHub Actions Windows runner (no wine
needed) and published to GitHub Releases. The landing page links users to the
newest release.

## Cut a release

1. Bump the version in `apps/desktop/package.json` (e.g. `0.1.0` → `0.1.1`).
2. Commit it, then tag and push:
   ```bash
   git commit -am "release: v0.1.1"
   git tag v0.1.1
   git push origin main --tags
   ```
3. The `Release desktop app` workflow (`.github/workflows/release.yml`) runs on
   the `v*` tag: it installs deps, downloads ffmpeg, builds, and runs
   `electron-builder --publish always`. When it finishes, a public Release
   `v0.1.1` exists with:
   - `greenroom-Setup-x64.exe` - the NSIS installer
   - `latest.yml` + blockmap - the electron-updater feed

The tag version must match `package.json`'s `version`, or electron-builder will
publish to a different release than the tag.

You can also run the workflow manually from the Actions tab (workflow_dispatch),
but it only publishes when the ref is a version tag.

## Auto-update

Installed apps call `autoUpdater.checkForUpdatesAndNotify()` on launch
(packaged builds only - see `apps/desktop/src/main/index.ts`) and pull new
versions from this repo's Releases via the `publish` block in
`apps/desktop/package.json`. Shipping a higher version through the steps above is
all it takes; existing installs update themselves.

## GitHub Pages landing page

The site is a single static file at `docs/index.html`. Enable it once:

1. Repo **Settings → Pages**.
2. **Source: Deploy from a branch**, branch **`main`**, folder **`/docs`**, Save.
3. It publishes at `https://edwarddjss.github.io/greenroom/`.

The page's Download buttons point at
`https://github.com/edwarddjss/greenroom/releases/latest`, which always
resolves to the newest release, so the site needs no redeploy when you ship a new
version.

## Notes

- **Unsigned builds.** There's no code-signing certificate, so Windows shows a
  SmartScreen prompt on first run (More info → Run anyway). Real signing needs a
  paid cert; add it to the `win` config and CI secrets later if desired.
- **ffmpeg is not committed.** It's 134 MB (over GitHub's 100 MB limit), so the
  workflow downloads a Windows build at package time. Local packaging expects
  `apps/desktop/resources/bin/ffmpeg.exe` to already be present.
- **Building on WSL2/Linux fails at signing** (needs wine). Use the CI workflow,
  or run `pnpm --filter @greenroom/desktop package` on Windows directly.

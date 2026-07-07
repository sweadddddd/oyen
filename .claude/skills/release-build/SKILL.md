---
name: release-build
description: Cut a new Oyen release — bump the version and tag it so CI builds and publishes the portable .exe.
disable-model-invocation: true
---

# Cutting an Oyen release

The portable `.exe` is only reproducible on a real Windows machine (native modules `uiohook-napi`/`active-win` must be rebuilt for the exact Electron ABI), so releases are built by CI (`.github/workflows/build-windows.yml`) on `windows-latest`, not locally.

1. Bump `"version"` in `package.json` (semver).
2. Commit that change.
3. Confirm with the user before doing anything below — pushing a tag triggers a public GitHub Actions run and publishes a GitHub Release with a permanent download URL, which isn't reversible in the way a local commit is.
4. `git tag vX.Y.Z && git push origin main && git push origin vX.Y.Z` (adjust branch name if not `main`).
5. Point the user to the Actions tab to watch the build; the workflow uploads `dist/*.exe` and publishes it to the Release for that tag once green.

Alternative: trigger the workflow manually from the Actions tab (`workflow_dispatch`) with a chosen tag to get an artifact-only build without publishing a Release — useful for a test build before committing to a public release.

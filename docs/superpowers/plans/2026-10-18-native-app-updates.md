# Native App Download and Installation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task after user review. Steps use checkbox syntax for tracking. No parallel delegation is needed.

**Goal:** Checking for an update downloads the new macOS app automatically and lets the user restart to install it without visiting GitHub or opening a DMG.

**Architecture:** Keep Electron's native `autoUpdater`, Forge packaging, and GitHub Releases. Make the main process own update state and broadcast it to all windows. Use the signed ZIP for native installation. The app never offers a manual download link; the DMG remains a distribution artifact only.

**Tech Stack:** Electron 42, Electron Forge 7, TypeScript, React 19, Vitest, Squirrel.Mac.

**Spec:** The design and acceptance criteria below capture the user's request; this is a proposed plan, not an approved implementation or release.

## Design and scope

The screenshot actually shows the existing native updater's downloaded state: “ready to install” and “Restart”. That is different from the manual “Download” state. The source already calls `quitAndInstall()`, so downloading and installing need to be made reliable rather than introduced from scratch. The screenshot alone does not establish why restarting may fail.

Observed source problems:
- `simple-editor.tsx` unconditionally assigns manual-download state after checks, including startup, file opening and dropping files. This can overwrite a downloaded notification.
- `auto-updater.ts` never clears `updateCheckStarted`; an error permanently sets `nativeUpdateFailed`. A failed attempt cannot recover within the session.
- Download/error state is not exposed to the renderer. New windows can miss the downloaded event entirely.
- `update-checker.ts` treats network failures as “no update”, and requires a DMG even for a native ZIP update.
- `window-close-handler.ts` prevents closure asynchronously and accepts the next global `save-complete` event regardless of sender. The editor also acknowledges saving an untitled note without writing it. Both matter when installing closes every window.
- Local releases generate `update.json`; the manual GitHub workflow runs Forge publish directly and does not run the manifest normalizer.

**Recommended approach:** Repair the existing native lifecycle. Migrating to electron-updater/electron-builder would change packaging without first resolving the existing state and shutdown defects. Downloading and replacing the app with a custom shell script would duplicate the native installer's responsibilities.

**Assumptions:** This plan targets packaged macOS builds, matching the screenshot and active release pipeline. Download automatically after a check finds a newer compatible version. Show “Restart & Install” when ready; do not interrupt editing with a forced restart. Check automatically once per newly launched app process after updater initialization. In an already running instance, clicking the “Check for Updates” toolbar icon triggers the same check-and-download flow. Additional document windows, renderer remounts, file opening and file drops do not trigger checks; they read the shared state. Do not introduce periodic polling. Windows/Linux native updating is separate work; show explicit unsupported status there.

## Global constraints

- Preserve Forge and Electron's native updater; add no updater dependency.
- Only install after a native `update-downloaded` event and successful unsaved-document handling.
- The app owns downloading, app replacement and relaunch; the user only chooses when to restart.
- Never show a manual Download link, including on errors or unsupported platforms. Failed updates show an error and Retry; the toolbar icon also retries.
- Start one automatic check per app launch in the main process; use the same service for explicit toolbar checks.
- Use an indeterminate “Downloading…” status; do not invent percentage progress.
- Publish signed, notarized macOS builds with stable signing identity and bundle identity.
- Select update metadata for the running architecture; never silently install an incompatible ZIP.
- Keep the existing `update.json` endpoint compatible for installed clients during rollout.
- Do not implement, bump versions, publish, or modify installed applications as part of this planning task.

## Review focus

1. A delayed check response must not overwrite a ready-to-install state (Task 2).
2. Offline or failed checks must permit a later retry without app restart (Task 1).
3. Save cancellation, save errors and unrelated window acknowledgements must not cause data loss (Task 3).
4. A new window must recover current download state even if it missed an event (Task 2).
5. Missing, mismatched or partially published update artifacts must not be offered for installation (Tasks 1 and 4).

## Task 1: Make update state authoritative and retryable

**Files:** Create `src/update-state.ts`; modify `src/auto-updater.ts`, `src/update-checker.ts`, `src/main.ts`; update `src/__tests__/auto-updater.test.ts`, `src/__tests__/update-checker.test.ts`, `src/__tests__/update-fallback.test.ts`.

**Interfaces:** Define a shared discriminated `UpdateState` union with `status`: `idle`, `checking`, `downloading`, `ready`, `installing`, `up-to-date`, `unsupported`, `error`. Include monotonic `revision` on all variants; `version` on downloading/ready/installing; `message` and `retryable` on error. Do not expose a manual download URL in update state. Expose `getUpdateState(): UpdateState` and `checkForNativeUpdate(): Promise<UpdateState>`. Refactor `checkForUpdate()` to return a newer release descriptor or null for genuinely current, and throw on failed lookup. Descriptor fields: `version`, architecture-compatible `feedUrl`. Remove the obsolete manual `downloadUrl` contract from the updater and bridge.

- [ ] Write regression tests for one concurrent check/download, no native request when current, failed fetch versus current version, retry after synchronous throw/native error, rejected incompatible assets, and repeated checks preserving `ready`. Assert one automatic check after main-process initialization per app launch, an explicit toolbar IPC check after startup completes, and no duplicate native operation when startup and toolbar checks overlap.
- [ ] Run `npm test -- src/__tests__/auto-updater.test.ts src/__tests__/update-checker.test.ts src/__tests__/update-fallback.test.ts`; confirm the new cases fail for the intended reasons.
- [ ] Replace permanent flags with explicit transitions. Register native listeners once before checking. On newer release, set a feed URL pinned to that release and architecture, then call `checkForUpdates()`. Transition through downloading to ready only on native events. Release the in-flight check on terminal outcomes; errors remain retryable. Do not accept a second native operation while one is pending.
- [ ] Resolve version and architecture together from GitHub release metadata; use the release's immutable tag URL for the feed rather than combining an API result with a moving latest feed. Do not require a DMG to download a valid native update. Handle native `update-not-available` without leaving a permanent busy state.
- [ ] Broadcast every transition to all windows. Change main-process check IPC to use this service and remove `hasNativeUpdateFailed()` gating. Start the launch check from main-process app-ready initialization after configuring listeners; catch errors into shared state even if no renderer has loaded yet.
- [ ] Run the focused tests and commit the passing lifecycle changes.

## Task 2: Show automatic download and installation state consistently

**Files:** Modify `src/preload.ts`, `src/types/electron.d.ts`, `src/components/tiptap-templates/simple/simple-editor.tsx`, `src/components/tiptap-ui/check-update-button/check-update-button.tsx`, `src/handle-file-drop.ts`; create `src/hooks/use-app-update.ts`, `src/components/update-banner.tsx`, `src/__tests__/update-banner.test.tsx`; update `src/__tests__/handle-file-drop.test.ts` and `src/__tests__/update-fallback.test.ts`.

**Interfaces:** Bridge `getUpdateState(): Promise<UpdateState>`, `checkForUpdate(): Promise<UpdateState>`, `onUpdateStateChanged(callback: (state: UpdateState) => void): () => void`. Hook `useAppUpdate()` returns `{ state, check, install }`; install uses Task 3's bridge. `UpdateBanner` receives state and action callbacks.

- [ ] Add tests asserting: checking → downloading → ready text; ready action says “Restart & Install”; no manual Download link or update-related browser navigation in any state; error offers Retry only; unsupported does not claim success or offer a download link. Assert the toolbar invokes the check service and renderer mount, file-open and file-drop do not initiate checks. Assert an older revision cannot replace newer ready state, including a delayed initial snapshot.
- [ ] Run `npm test -- src/__tests__/update-banner.test.tsx src/__tests__/handle-file-drop.test.ts src/__tests__/update-fallback.test.ts` and confirm regressions fail.
- [ ] Subscribe before reading the initial snapshot; accept only newer revisions. Remove renderer-initiated startup checks and all update checks/manual-state assignments from file-open and drop callbacks; remove obsolete update callbacks from the file-drop helper and its callers. Remove the update banner’s external-download action while retaining unrelated external-link support. Preserve unrelated file handling. Newly created windows render the main-process snapshot.
- [ ] Use copy: “Checking for updates…”, “Downloading M Note v{version}…”, “M Note v{version} is ready to install.”, “Installing update…”, and “You're up to date.” Show actionable error text. Keep installation status authoritative when a banner is dismissed and later reopened.
- [ ] Drive toolbar busy/success states from real update state; do not display a success checkmark from a `finally` block after failure. Disable duplicate install requests.
- [ ] Run the focused tests and commit the renderer/IPC changes.

## Task 3: Save safely before native replacement and relaunch

**Files:** Modify `src/window-close-handler.ts`, `src/main.ts`, `src/auto-updater.ts`, `src/preload.ts`, `src/types/electron.d.ts`, `src/components/tiptap-templates/simple/simple-editor.tsx`; create `src/update-installation.ts`, `src/__tests__/update-installation.test.ts`; update `src/__tests__/window-close-handler.test.ts`, `src/__tests__/quit-on-last-window-closed.test.ts`.

**Interfaces:** `prepareWindowsForUpdate(windows: BrowserWindow[]): Promise<boolean>` resolves true only after all windows consent and required saves succeed. `installNativeUpdate(): Promise<{ status: 'installing' | 'cancelled' | 'error'; message?: string }>` rejects installation unless state is ready. Bridge `installUpdate()` returns that result. Save request/reply carries a unique request ID; main verifies the replying sender matches the requesting window.

- [ ] Test clean windows, Save/Don't Save/Cancel, save rejection, untitled dirty notes, mismatched sender/request ID, renderer destruction, double-click installation, and install-before-ready. Cancellation must leave all windows open and update ready; no call to `quitAndInstall()` is allowed after failed preparation.
- [ ] Run `npm test -- src/__tests__/update-installation.test.ts src/__tests__/window-close-handler.test.ts src/__tests__/quit-on-last-window-closed.test.ts` and confirm intended failures.
- [ ] Refactor the existing close decision so preparation can save/ask without closing windows. An untitled Save must use a main-process Save As dialog, write the selected file and acknowledge only after success; cancelling the dialog cancels installation. Keep failed notes dirty and surface the write error. Register replies before sending save requests and clean listeners on completion or cancellation.
- [ ] Freeze editor input only during final preparation/install, so acknowledged content cannot change before shutdown; unfreeze on cancellation/error. If a window appears during preparation, abort safely and ask for retry rather than omit it. Treat an unresponsive renderer as a failed preparation after a bounded 30-second reply wait, excluding time spent in a native save dialog.
- [ ] Once every window is prepared, mark only those windows as approved to close and call `quitAndInstall()` once. Prevent the ordinary `window-all-closed` quit handler from competing with native updater shutdown while installation is committed. Restore normal close handling if installation errors.
- [ ] Run the focused tests and commit the safe restart changes. Packaged-app verification in Task 5 is required because mocks cannot prove Squirrel relaunch behaviour.

## Task 4: Publish complete, compatible update artifacts

**Files:** Modify `scripts/fix-mac-update-manifest.mjs`, `scripts/release.sh`, `.github/workflows/build.yml`, `src/__tests__/fix-mac-update-manifest.test.ts`, `README.md`; add `scripts/validate-update-release.mjs`, `src/__tests__/validate-update-release.test.ts`. Change `forge.config.ts` only if artifact inspection reveals a necessary packaging adjustment.

**Interfaces:** `validateUpdateRelease({ version, arch, assets, feed })` throws on mismatched version, architecture, missing ZIP, or feed URL not matching the exact versioned uploaded ZIP. The script also has a CLI for validating built metadata before publication. Emit `update-darwin-{arch}.json` for each architecture actually built; retain legacy `update.json` for the existing release architecture.

- [ ] Add fixture tests for normalized filenames, tag-pinned URLs, wrong architecture/version, missing ZIP, missing feed fields and a complete release. Run `npm test -- src/__tests__/fix-mac-update-manifest.test.ts src/__tests__/validate-update-release.test.ts` and confirm intended failures.
- [ ] Generate version-specific feed URLs and architecture-specific feed filenames. Reject absent or incompatible artifacts before treating a release as complete; do not assume the first ZIP/manifest under `out` belongs to this build. Preserve existing normalization tests and legacy feed compatibility.
- [ ] Make local release steps fail immediately on test/build/normalization/validation failure. Build/upload to a draft, validate the uploaded asset inventory and downloaded feed contents, then publish only when complete. Do not silently clobber an already complete public release with different binaries.
- [ ] Make the manually triggered workflow follow the same make → normalize → validate → draft upload → publish sequence instead of raw Forge publish. Share the validation code; document signing credentials and release commands without storing secrets. Validate downloaded ZIP bundle version, architecture and signing identity as a release gate.
- [ ] Run focused tests and `bash -n scripts/release.sh`; commit release-pipeline changes. Do not publish a release as part of this task without release authorization.

## Task 5: Verify an actual installed upgrade

**Files:** Add `docs/testing/native-updates.md`; update `README.md` with the user-facing update flow.

- [ ] Run `npm test` and `npm run lint`. Record outcomes and distinguish pre-existing failures from regressions.
- [ ] Build two successive signed/notarized versions using the same identity. Use an isolated test release/feed and installed test app so validation does not replace the user's everyday installation or publish a production release.
- [ ] Install version A in a writable Applications location, make B available before launching A, and confirm the launch automatically checks and downloads. Separately launch A while current, make B available while A stays open, and click the Check for Updates icon to trigger the same flow. Confirm a ZIP downloads without a browser, status becomes ready, Restart & Install replaces A and relaunches B, and B's subsequent check says up to date. Record version, architecture, feed URL and relevant native logs.
- [ ] Repeat with an edited note, multiple windows, untitled note, Save As cancellation, failed save and Cancel. Confirm no edits are silently lost, cancellation leaves windows open, and the staged update can be installed later.
- [ ] Exercise offline check then retry, interrupted download then retry, missing/bad feed, wrong-architecture metadata, and app launched from a read-only DMG. Expect a visible recoverable error or installation-location guidance, never false “up to date”, false completion, or a manual Download link. Confirm Retry and the toolbar icon can recover without restarting the app. Validate each architecture claimed as supported.
- [ ] Record whether the currently shipped client can consume the new release. If its updater is broken, document a one-time manual upgrade to the fixed version; code in a future binary cannot repair a client that cannot install it.
- [ ] Commit the verified runbook and user documentation. Do not mark native updating complete based only on unit tests.

## Acceptance criteria

A supported installed macOS app downloads a compatible newer binary itself, accurately shows download/readiness/errors, and installs/relaunches through the native updater after the user's restart action. Each new app process checks automatically; the toolbar icon triggers checks in an existing instance. Opening additional document windows or files does not trigger checks. No manual Download link appears in any state, including failures. No browser or DMG interaction is required for in-app updating. Retries work, all windows agree on state, unsaved edits are protected, and the published feed refers to a complete signed release.

## Documentation consulted

Verified through Context7 on 2026-10-18:
- [Electron autoUpdater API](https://github.com/electron/electron/blob/main/docs/api/auto-updater.md): macOS signing requirement and native lifecycle.
- [Electron update tutorial](https://github.com/electron/electron/blob/main/docs/tutorial/updates.md): downloaded notification followed by `quitAndInstall()`.
- [Native quit-and-install orchestration](https://github.com/electron/electron/blob/main/shell/browser/api/electron_api_auto_updater.cc): windows close before platform installation.

These sources support retaining the native updater. The precise failure on the user's installed build remains to be reproduced during Task 5.

## Implementation record (2026-10-18)

Tasks 1–4 are implemented on `fix-download`. Automated coverage includes native lifecycle/retries, pinned feed content, launch and toolbar triggers, renderer subscription/snapshots, safe multi-window preparation, correlated save replies, untitled saving, pending editor activity and release validation. The release gate now also pins the existing signing team and bundle ID, and clean builds prevent stale artifacts from being selected.

Task 5: automated tests, type checking, lint, renderer build and shell syntax verification have been performed. The installed signed A→B replacement/relaunch and real failure-injection matrix remain an explicit pre-release gate in `docs/testing/native-updates.md`; no production release or installed-app replacement has been performed.

Review-driven adjustments: editor freeze/unfreeze suppresses synthetic update events; pending uploads, reads and saves block installation until finished; renderer calls have bounded waits. Existing Forge signing-ignore and test-fixture typings were corrected to make type checking pass. Changes are delivered as one integrated commit because main/renderer IPC and shutdown interfaces change together.

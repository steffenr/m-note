# Native update verification

The app checks once at process startup. The toolbar and Retry action use the same native updater. Additional document windows and file drops do not check. No update state offers a manual download link. The signed ZIP is staged by Squirrel.Mac; Restart & Install saves or discards notes with the user's consent, replaces the app and relaunches it.

## Automated verification

Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `bash -n scripts/release.sh`. Tests cover retry, concurrent checks, stale state, architecture selection, no download links, launch triggers, save acknowledgements and release metadata.

## Packaged acceptance gate — not yet performed

Unit tests do not prove native replacement or relaunch. Before shipping:

1. Build two successive signed and notarized versions with the same bundle ID and signing identity, using an isolated test feed and app installation. Do not publish test versions to the production latest feed.
2. Install A in a writable Applications location. Publish B to the test feed. Launch A and verify automatic downloading without a browser, then Restart & Install. Verify the relaunched process runs B and its check reports up to date.
3. Repeat with A already open before B becomes available: click the toolbar icon and verify the same flow. Open another document while downloading and verify consistent state without another request.
4. Test multiple dirty windows, untitled notes and Save As, Save/Don't Save/Cancel, save failure and renderer non-response. Cancel must leave all windows open and the staged update ready. No failed save may close its note.
5. Test offline/retry, interrupted download, invalid or missing feed, wrong architecture and a read-only DMG launch. Confirm a recoverable error, no false completion and no Download link.
6. Record versions, architecture, bundle ID, signing team, feed URLs, app location, logs and observed relaunch. Validate every architecture claimed as supported.
7. Check compatibility from the currently shipped client. If its updater cannot install the fixed client, document a one-time out-of-app upgrade; never add a manual download action back to the app.

Production publication is separate from this implementation. `scripts/release.sh` builds and verifies the ZIP's version, architecture, signature, established signing team (`G569HDEERH`), bundle ID (`com.electron.m-note`) and notarization assessment, stages a draft, downloads and validates uploaded metadata and payload, then publishes. An existing public version is never overwritten.

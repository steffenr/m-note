#!/usr/bin/env bash
# Build locally or in CI; validate and upload a draft before publishing.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
ARCH=$(node -p 'process.arch')
TAG="v${VERSION}"
RELEASE_NOTE="${1:-}"
if gh release view "$TAG" --json isDraft -q '.isDraft' > /dev/null 2>&1; then
  if [ "$(gh release view "$TAG" --json isDraft -q '.isDraft')" != true ]; then
    echo "Release $TAG is already public; bump the version to publish new binaries."
    exit 0
  fi
fi
npm test
if [ -z "$RELEASE_NOTE" ]; then read -rp 'Release statement: ' RELEASE_NOTE; fi
if [ ! -f resources/icon.icns ]; then sh scripts/generate-icon.sh; fi
# Never let a stale artifact from a prior make satisfy this release.
rm -rf out/
npx electron-forge make
ZIP_PATH=$(find out/make/zip -name "*-darwin-${ARCH}-${VERSION}.zip" -print -quit)
MANIFEST="$(dirname "$ZIP_PATH")/RELEASES.json"
DMG_PATH=$(find out/make -name "*${VERSION}*.dmg" -print -quit)
[ -n "$ZIP_PATH" ] && [ -f "$MANIFEST" ] && [ -n "$DMG_PATH" ]
ZIP_PATH=$(node scripts/fix-mac-update-manifest.mjs "$MANIFEST" "$ZIP_PATH")
STAGING=$(mktemp -d)
trap 'rm -rf "$STAGING"' EXIT
cp "$ZIP_PATH" "$DMG_PATH" "$MANIFEST" "$(dirname "$MANIFEST")/update.json" "$(dirname "$MANIFEST")/update-darwin-${ARCH}.json" "$STAGING/"
node scripts/validate-update-release.mjs "$STAGING" "$VERSION" "$ARCH"
# Verify the actual ZIP payload, not just the surrounding metadata.
ditto -x -k "$ZIP_PATH" "$STAGING/unpacked"
APP_PATH=$(find "$STAGING/unpacked" -maxdepth 1 -name '*.app' -print -quit)
[ -n "$APP_PATH" ]
[ "$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$APP_PATH/Contents/Info.plist")" = "$VERSION" ]
EXECUTABLE=$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$APP_PATH/Contents/Info.plist")
MACH_ARCH="$ARCH"
if [ "$ARCH" = x64 ]; then MACH_ARCH=x86_64; fi
lipo "$APP_PATH/Contents/MacOS/$EXECUTABLE" -verify_arch "$MACH_ARCH"
codesign --verify --deep --strict "$APP_PATH"
TEAM=$(codesign -dv "$APP_PATH" 2>&1 | sed -n 's/^TeamIdentifier=//p')
BUNDLE_ID=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP_PATH/Contents/Info.plist")
node scripts/validate-update-release.mjs "$STAGING" "$VERSION" "$ARCH" "$TEAM" "$BUNDLE_ID"
spctl --assess --type execute "$APP_PATH"
if ! git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then git tag -a "$TAG" -m "$RELEASE_NOTE"; fi
git push origin "$TAG"
if ! gh release view "$TAG" >/dev/null 2>&1; then
  gh release create "$TAG" --draft --title "$TAG" --notes "$RELEASE_NOTE"
fi
gh release upload "$TAG" "$STAGING"/*.zip "$STAGING"/*.dmg "$STAGING"/*.json --clobber
mkdir "$STAGING/downloaded"
gh release download "$TAG" --dir "$STAGING/downloaded"
node scripts/validate-update-release.mjs "$STAGING/downloaded" "$VERSION" "$ARCH"
# The uploaded ZIP must be the exact signed payload validated above.
cmp "$ZIP_PATH" "$STAGING/downloaded/$(basename "$ZIP_PATH")"
gh release edit "$TAG" --draft=false --latest --notes "$RELEASE_NOTE"
echo "Released $TAG"

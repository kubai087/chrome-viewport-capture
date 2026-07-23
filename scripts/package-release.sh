#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PROJECT_DIR/dist"
PACKAGE_NAME="chrome-viewport-capture"
ARCHIVE_NAME="chrome-viewport-capture.zip"
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/chrome-viewport-capture-release.XXXXXX")"
PACKAGE_DIR="$STAGE_DIR/$PACKAGE_NAME"

cleanup() {
  rm -rf -- "$STAGE_DIR"
}
trap cleanup EXIT

mkdir -p "$PACKAGE_DIR" "$DIST_DIR"

runtime_files=(
  AGENT_INSTALL_PROMPT.md
  README.md
  background.js
  capture-core.js
  manifest.json
  popup.css
  popup.html
  popup.js
)

for file in "${runtime_files[@]}"; do
  cp "$PROJECT_DIR/$file" "$PACKAGE_DIR/$file"
done
cp -R "$PROJECT_DIR/icons" "$PACKAGE_DIR/icons"

TEMP_ARCHIVE="$STAGE_DIR/$ARCHIVE_NAME"
(
  cd "$STAGE_DIR"
  COPYFILE_DISABLE=1 zip -q -r -X "$TEMP_ARCHIVE" "$PACKAGE_NAME"
)

mv -f "$TEMP_ARCHIVE" "$DIST_DIR/$ARCHIVE_NAME"
(
  cd "$DIST_DIR"
  shasum -a 256 "$ARCHIVE_NAME" > "$ARCHIVE_NAME.sha256"
)

VERSION="$(node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).version)' "$PROJECT_DIR/manifest.json")"
echo "Built $DIST_DIR/$ARCHIVE_NAME (v$VERSION)"
echo "Checksum: $DIST_DIR/$ARCHIVE_NAME.sha256"

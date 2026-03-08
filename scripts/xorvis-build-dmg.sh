#!/usr/bin/env bash
# Xorvis IDE — macOS DMG Build Script
#
# Usage: ./scripts/xorvis-build-dmg.sh
#
# Performs a clean, full production build and packages it as a distributable
# .dmg file for macOS. The output is written to dist/ in the repo root.
#
# Prerequisites (macOS only):
#   - Xcode Command Line Tools  (xcode-select --install)
#   - Node.js >= 20             (node --version)
#   - Python >= 3.10            (python3 --version) — for dmgbuild
#   - git                       (git --version)
#
# The resulting DMG is named:
#   dist/Xorvis-IDE-<arch>-<YYYYMMDD>.dmg
#
# Share this file with your client. When they open it, they get a completely
# fresh Xorvis IDE with no inherited settings (data stored in ~/.xorvis/).

set -euo pipefail

# ── Resolve repo root ─────────────────────────────────────────────────────────
realpath_compat() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
ROOT=$(dirname "$(dirname "$(realpath_compat "$0")")")

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${CYAN}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✔ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
die()  { echo -e "${RED}✖ $1${NC}" >&2; exit 1; }

# ── Guard: macOS only ─────────────────────────────────────────────────────────
[[ "$OSTYPE" == darwin* ]] || die "DMG creation requires macOS. This script cannot run on $(uname -s)."

cd "$ROOT"

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║    Xorvis IDE — macOS DMG Build          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"

# ── Detect architecture ───────────────────────────────────────────────────────
RAW_ARCH=$(uname -m)
if [ "$RAW_ARCH" = "arm64" ]; then
	ARCH="arm64"
	ARCH_LABEL="Apple Silicon (arm64)"
else
	ARCH="x64"
	ARCH_LABEL="Intel (x64)"
fi
echo -e "  Architecture : ${ARCH_LABEL}"
echo -e "  Repo root    : ${ROOT}"

# ── Check prerequisites ───────────────────────────────────────────────────────
step "Checking prerequisites"

command -v node  >/dev/null 2>&1 || die "node not found. Install Node.js >= 20."
command -v git   >/dev/null 2>&1 || die "git not found."
command -v python3 >/dev/null 2>&1 || die "python3 not found. Install Python >= 3.10 (e.g. brew install python@3.12)."

NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
ok "Node.js $NODE_VER"

PYTHON_VER=$(python3 --version 2>&1 | awk '{print $2}')
ok "Python $PYTHON_VER"

# ── Ensure node_modules ───────────────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
	step "Installing dependencies (npm ci)"
	npm ci
	ok "Dependencies installed"
else
	ok "node_modules present"
fi

# ── Clean previous build artifacts ───────────────────────────────────────────
# This guarantees the DMG always contains the latest code — no stale cache.
step "Cleaning previous build artifacts (ensures fresh build)"
rm -rf \
	out \
	out-build \
	out-vscode \
	out-vscode-min \
	out-vscode-reh \
	out-vscode-reh-min \
	out-vscode-reh-web \
	out-vscode-reh-web-min \
	.build/extensions

ok "Build artifacts cleaned"

# ── Full production build + package ──────────────────────────────────────────
# gulp vscodedarwin-{arch} runs internally:
#   1. compile-build-with-mangling  — TypeScript → JS (production, mangled)
#   2. compile-extensions-build     — built-in extensions
#   3. compile-extension-media      — extension assets
#   4. bundle-vscode / esbuild      — bundle all JS into final chunks
#   5. package-darwin-{arch}        — assemble the .app bundle
#
# Output: <repo-parent>/VSCode-darwin-{arch}/Xorvis IDE.app
step "Running full production build — this takes 10–20 min on first run"
echo -e "  gulp task: ${CYAN}vscodedarwin-${ARCH}${NC}"
echo ""

npm run gulp "vscodedarwin-${ARCH}"

# ── Locate the packaged .app ──────────────────────────────────────────────────
# The gulp packaging task writes to the *parent* directory of the repo root.
BUILD_DIR=$(dirname "$ROOT")
APP_BUNDLE_DIR="$BUILD_DIR/VSCode-darwin-${ARCH}"
APP_NAME=$(node -p "require('./product.json').nameLong")

if [ ! -d "$APP_BUNDLE_DIR/$APP_NAME.app" ]; then
	die "Expected .app not found at: $APP_BUNDLE_DIR/$APP_NAME.app\nCheck the gulp build output above for errors."
fi

ok ".app bundle ready: $APP_BUNDLE_DIR/$APP_NAME.app"

# ── Create the DMG ────────────────────────────────────────────────────────────
step "Creating DMG"

mkdir -p "$ROOT/dist"
OUT_DIR="$ROOT/dist"
DATE=$(date +%Y%m%d)
FINAL_DMG_NAME="Xorvis-IDE-${ARCH}-${DATE}.dmg"
FINAL_DMG_PATH="$OUT_DIR/$FINAL_DMG_NAME"

# create-dmg.ts produces: $OUT_DIR/VSCode-darwin-${ARCH}.dmg
VSCODE_ARCH="$ARCH" \
VSCODE_QUALITY="stable" \
	node build/darwin/create-dmg.ts "$BUILD_DIR" "$OUT_DIR"

RAW_DMG="$OUT_DIR/VSCode-darwin-${ARCH}.dmg"
if [ ! -f "$RAW_DMG" ]; then
	die "DMG was not created at expected path: $RAW_DMG"
fi

# Rename to Xorvis branding
mv "$RAW_DMG" "$FINAL_DMG_PATH"

# ── Done ──────────────────────────────────────────────────────────────────────
SIZE=$(du -sh "$FINAL_DMG_PATH" | cut -f1)

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅  DMG ready!                                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  File : ${CYAN}dist/${FINAL_DMG_NAME}${NC}  (${SIZE})"
echo ""
echo -e "  Share ${CYAN}dist/${FINAL_DMG_NAME}${NC} with your client."
echo -e "  When they open it:"
echo -e "    • Drag 'Xorvis IDE' to Applications"
echo -e "    • Settings stored in ${CYAN}~/.xorvis/${NC} (fresh on first launch)"
echo ""

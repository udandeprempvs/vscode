#!/usr/bin/env bash
# Xorvis IDE — Development Mode
#
# Usage: ./scripts/xorvis-dev.sh [vscode-args...]
#
# Starts the TypeScript file watcher in the background, then launches the IDE.
# After you edit a .ts file, the watcher recompiles it automatically.
# Restart the IDE to pick up the changes.
#
# Logs from the watcher are written to .xorvis-watch.log in the repo root.

set -e

# ── Resolve repo root (handles symlinks; provides macOS realpath polyfill) ──
if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
fi
ROOT=$(dirname "$(dirname "$(realpath "$0")")")

PID_FILE="$ROOT/.xorvis-watch.pid"
LOG_FILE="$ROOT/.xorvis-watch.log"

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
	if [ -f "$PID_FILE" ]; then
		WPID=$(cat "$PID_FILE")
		if kill -0 "$WPID" 2>/dev/null; then
			echo ""
			echo -e "${YELLOW}Stopping watcher (PID $WPID)...${NC}"
			kill "$WPID" 2>/dev/null || true
		fi
		rm -f "$PID_FILE"
	fi
}
trap cleanup EXIT

cd "$ROOT"

echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Xorvis IDE — Dev Mode          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Ensure node_modules are installed ────────────────────────────────────────
if [ ! -d "node_modules" ]; then
	echo -e "${CYAN}Installing dependencies (npm ci)...${NC}"
	npm ci
fi

# ── Start file watcher (skip if already running) ─────────────────────────────
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
	echo -e "${YELLOW}Watcher already running (PID $(cat "$PID_FILE")). Reusing it.${NC}"
else
	echo -e "${CYAN}Starting TypeScript watcher...${NC}"
	npm run watch > "$LOG_FILE" 2>&1 &
	echo $! > "$PID_FILE"
	echo -e "  Watcher PID: $(cat "$PID_FILE")"
	echo -e "  Logs:        $LOG_FILE"
fi

echo ""

# ── Wait for initial compilation (only needed on very first run) ──────────────
if [ ! -d "out" ]; then
	echo -e "${CYAN}Waiting for initial compilation (this takes ~60s the first time)...${NC}"
	WAIT=0
	while [ ! -d "out" ] && [ "$WAIT" -lt 180 ]; do
		sleep 3
		WAIT=$((WAIT + 3))
		printf "."
	done
	echo ""
	if [ ! -d "out" ]; then
		echo "Error: Compilation did not finish within 3 minutes."
		echo "Check $LOG_FILE for details."
		exit 1
	fi
	# Give the watcher a moment to finish writing files
	sleep 2
fi

# ── Launch the IDE ────────────────────────────────────────────────────────────
echo -e "${GREEN}Launching Xorvis IDE in development mode...${NC}"
echo -e "${CYAN}  Tip: Edit TypeScript files, then restart the IDE to see changes.${NC}"
echo -e "${CYAN}  Watcher log: tail -f $LOG_FILE${NC}"
echo ""

./scripts/code.sh "$@"

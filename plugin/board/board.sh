#!/bin/bash
# Crew Room board control: start | stop | status | export | task | handbacks.
# The server (with its pollers) runs detached so it outlives the session that started it.
# Every path it builds is under the plugin root (this file's parent) or the data folder: $CLAUDE_PLUGIN_DATA,
# or BOARD_LOG_DIR when a developer names one (tests, the demo). Both must be absolute; there is no home-folder fallback.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# The plugin root is always this file's own parent, never an inherited CLAUDE_PLUGIN_ROOT.
CLAUDE_PLUGIN_ROOT="$(cd "$HERE/.." && pwd)"
export CLAUDE_PLUGIN_ROOT
NODE=(node --no-warnings)

data_dir() {
  local d="${BOARD_LOG_DIR:-${CLAUDE_PLUGIN_DATA:-}}"
  case "$d" in
    /*) printf '%s\n' "$d" ;;
    *) return 1 ;;
  esac
}

# Prints the pid when server.json names a live board server, and nothing else: a pid read from the file never
# reaches `kill` unless that process runs a board/server.ts. Any version's, so a board started before an update
# (from the old cache folder) can still be stopped.
running_pid() {
  [ -f "$SERVER_JSON" ] || return 1
  local pid cmd; pid=$("${NODE[@]}" -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pid;if(!Number.isSafeInteger(p)||p<=1)process.exit(1);process.stdout.write(String(p))' "$SERVER_JSON" 2>/dev/null) || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  cmd=$(ps -p "$pid" -o command= 2>/dev/null) || return 1
  case "$cmd" in
    *node*/board/server.ts*) echo "$pid" ;;
    *) return 1 ;;
  esac
}

case "${1:-status}" in
  # Always under CLAUDE_PLUGIN_DATA (never BOARD_LOG_DIR): the guard allows hand-back files only there. handbacks.ts checks it.
  handbacks) shift; exec "${NODE[@]}" "$HERE/handbacks.ts" "$@" ;;
  start|stop|status|export|task) ;;
  *) echo "usage: $0 start|stop|status|export [--dry]|task add|start|done|drop|list|handbacks dir|list"; exit 2 ;;
esac

if ! LOG_DIR=$(data_dir); then
  echo 'CLAUDE_PLUGIN_DATA is not set to an absolute folder. Run this as CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" bash "${CLAUDE_PLUGIN_ROOT}/board/board.sh" ...'
  exit 2
fi
export BOARD_LOG_DIR="$LOG_DIR"
SERVER_JSON="$LOG_DIR/server.json"

case "${1:-status}" in
  start)
    if pid=$(running_pid); then echo "already running (pid $pid): $(cat "$SERVER_JSON")"; exit 0; fi
    mkdir -p "$LOG_DIR"
    nohup "${NODE[@]}" "$HERE/server.ts" >> "$LOG_DIR/server.log" 2>&1 < /dev/null &
    for _ in 1 2 3 4 5 6 7 8 9 10; do sleep 0.3; [ -f "$SERVER_JSON" ] && break; done
    cat "$SERVER_JSON" 2>/dev/null || { echo "did not start; see $LOG_DIR/server.log"; exit 1; } ;;
  stop)
    if pid=$(running_pid); then kill "$pid" && echo "stopped pid $pid"; else echo "not running"; rm -f "$SERVER_JSON"; fi ;;
  status)
    if pid=$(running_pid); then echo "running: $(cat "$SERVER_JSON")"; else echo "not running"; fi ;;
  export) shift; "${NODE[@]}" "$HERE/export.ts" "$@" ;;
  task) shift; "${NODE[@]}" "$HERE/task.ts" "$@" ;;
esac

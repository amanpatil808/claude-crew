#!/bin/bash
# Crew Room board control: start | stop | status | export | test.
# The server (with its pollers) runs detached so it outlives the session that started it.
# Log and state go to $CLAUDE_PLUGIN_DATA, or ~/.toon-crew when started by hand; override with BOARD_LOG_DIR.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export CLAUDE_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$HERE/.." && pwd)}"
LOG_DIR="${BOARD_LOG_DIR:-${CLAUDE_PLUGIN_DATA:-$HOME/.toon-crew}}"
export BOARD_LOG_DIR="$LOG_DIR"
SERVER_JSON="$LOG_DIR/server.json"
NODE=(node --no-warnings)

# Prints the pid when server.json names a live process.
running_pid() {
  [ -f "$SERVER_JSON" ] || return 1
  local pid; pid=$("${NODE[@]}" -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pid))' "$SERVER_JSON" 2>/dev/null) || return 1
  kill -0 "$pid" 2>/dev/null && echo "$pid"
}

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
  test) BOARD_LOG_DIR="$(mktemp -d)" "${NODE[@]}" --test "$HERE"/test/*.test.ts ;;
  *) echo "usage: $0 start|stop|status|export [--dry]|test"; exit 2 ;;
esac

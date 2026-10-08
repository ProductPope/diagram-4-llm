#!/usr/bin/env bash
# Runs the desktop end-to-end tests on Linux. Needs a built app in
# DESKTOP_APP, tauri-driver and WebKitWebDriver, gnome-keyring, secret-tool,
# dbus-run-session and xvfb-run.
set -euo pipefail
cd "$(dirname "$0")"

if [[ "${1:-}" != "--inside" ]]; then
  exec xvfb-run -a dbus-run-session -- "$PWD/run.sh" --inside
fi

# A keychain of its own, unlocked with a throwaway password, so that the
# tests never touch the user's.
export XDG_DATA_HOME
XDG_DATA_HOME="$(mktemp -d)"
printf 'test' | gnome-keyring-daemon --unlock --components=secrets >/dev/null

tauri-driver --port 4444 >/dev/null 2>&1 &
driver=$!
# The driver may already have exited.
trap 'kill "$driver" 2>/dev/null || true' EXIT
for _ in $(seq 50); do
  curl -s http://127.0.0.1:4444/status >/dev/null && break
  sleep 0.1
done

# The tests share one driver, so they run one at a time.
node --test --test-concurrency=1 keychain.test.ts local-server.test.ts

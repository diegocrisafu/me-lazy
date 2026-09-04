#!/bin/bash
# Installs the daemon and dashboard as launchd agents so they start at login
# and restart if they die. Uninstall with tools/uninstall-daemon.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$AGENTS" "$ROOT/data/logs"

make_plist () {
  local label="$1" script="$2" extra="$3" extra_args="$4"
  cat > "$AGENTS/$label.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>$extra_args<string>$NODE</string><string>$ROOT/$script</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$ROOT/data/logs/$label.log</string>
  <key>StandardErrorPath</key><string>$ROOT/data/logs/$label.err</string>
  $extra
</dict>
</plist>
PLIST
}

# The daemon only runs while the machine is awake, and a laptop on battery
# sleeps within minutes. caffeinate -i holds off idle sleep for as long as the
# daemon lives, which is the difference between a handful of applications a day
# and the configured cap. It does not override closing the lid.
CAFFEINATE="$(command -v caffeinate)"
if [ -n "$CAFFEINATE" ]; then
  DAEMON_ARGS="<string>$CAFFEINATE</string><string>-i</string>"
else
  DAEMON_ARGS=""
fi

make_plist "com.acc.daemon"    "daemon/index.js"  "" "$DAEMON_ARGS"
make_plist "com.acc.dashboard" "daemon/server.js" "" ""

for L in com.acc.daemon com.acc.dashboard; do
  launchctl unload "$AGENTS/$L.plist" 2>/dev/null || true
  launchctl load  "$AGENTS/$L.plist"
  echo "loaded $L"
done

echo
echo "Daemon and dashboard are running and will restart at login."
echo "  dashboard : http://localhost:7777"
echo "  logs      : $ROOT/data/logs/"
echo "  stop      : tools/uninstall-daemon.sh"
echo
if [ -n "$CAFFEINATE" ]; then
  echo "Idle sleep is held off while the daemon runs, so it keeps applying"
  echo "unattended. Closing the lid still sleeps the machine — leave it open,"
  echo "and plugged in if you want a full day of throughput."
fi

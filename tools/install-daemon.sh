#!/bin/bash
# Installs the daemon and dashboard as launchd agents so they start at login
# and restart if they die. Uninstall with tools/uninstall-daemon.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$AGENTS" "$ROOT/data/logs"

make_plist () {
  local label="$1" script="$2" extra="$3"
  cat > "$AGENTS/$label.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$ROOT/$script</string></array>
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

make_plist "com.acc.daemon"    "daemon/index.js"  ""
make_plist "com.acc.dashboard" "daemon/server.js" ""

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
echo "The runner itself is still OFF. Turn it on from the dashboard once your"
echo "profile is complete."

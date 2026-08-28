#!/bin/bash
AGENTS="$HOME/Library/LaunchAgents"
for L in com.acc.daemon com.acc.dashboard; do
  launchctl unload "$AGENTS/$L.plist" 2>/dev/null && echo "stopped $L"
  rm -f "$AGENTS/$L.plist"
done
echo "Removed. Your data in data/ is untouched."

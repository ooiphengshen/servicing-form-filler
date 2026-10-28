#!/bin/zsh
# Double-click to open the Nomination Form app in Safari. Close this window to stop it.
cd "$(dirname "$0")"
if lsof -nP -iTCP:4580 -sTCP:LISTEN >/dev/null 2>&1; then
  open "http://localhost:4580"
else
  node server.js
fi

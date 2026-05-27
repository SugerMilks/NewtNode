#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT_DIR/.newtnode_logs"
URL="http://127.0.0.1:5173/"
API_HEALTH_URL="http://127.0.0.1:3333/api/health"

# Finder and Dock launches do not always inherit Homebrew's Node.js path.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$ROOT_DIR"
mkdir -p "$LOG_DIR"

if ! lsof -ti tcp:3333 >/dev/null 2>&1; then
  npm run server > "$LOG_DIR/server.log" 2>&1 &
fi

if ! lsof -ti tcp:5173 >/dev/null 2>&1; then
  npm run client > "$LOG_DIR/client.log" 2>&1 &
fi

for _ in {1..80}; do
  if curl -fsS "$URL" >/dev/null 2>&1 && curl -fsS "$API_HEALTH_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --new-window "$URL" --window-size=1280,900 --window-position=120,80 --disable-pinch
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -na "Microsoft Edge" --args --new-window "$URL" --window-size=1280,900 --window-position=120,80 --disable-pinch
else
  open "$URL"
fi

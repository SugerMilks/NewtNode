#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT_DIR/.newtnode_logs"
CLIENT_PORT=5176
API_PORT=3336
URL="http://127.0.0.1:$CLIENT_PORT/"
API_HEALTH_URL="http://127.0.0.1:$API_PORT/api/health"

# Finder and Dock launches do not always inherit Homebrew's Node.js path.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$ROOT_DIR"
mkdir -p "$LOG_DIR"
export PORT="$API_PORT"
export VITE_API_PORT="$API_PORT"
export VITE_CLIENT_PORT="$CLIENT_PORT"

BUILD_REQUIRED=0
if [ ! -f "$ROOT_DIR/dist/index.html" ]; then
  BUILD_REQUIRED=1
elif find "$ROOT_DIR/src" "$ROOT_DIR/public" -type f -newer "$ROOT_DIR/dist/index.html" -print -quit 2>/dev/null | grep -q .; then
  BUILD_REQUIRED=1
elif [ "$ROOT_DIR/index.html" -nt "$ROOT_DIR/dist/index.html" ] || [ "$ROOT_DIR/vite.config.js" -nt "$ROOT_DIR/dist/index.html" ] || [ "$ROOT_DIR/package.json" -nt "$ROOT_DIR/dist/index.html" ]; then
  BUILD_REQUIRED=1
fi

if [ "$BUILD_REQUIRED" -eq 1 ]; then
  npm run build > "$LOG_DIR/build.log" 2>&1
fi

if ! curl -fsS "$API_HEALTH_URL" >/dev/null 2>&1; then
  nohup node scripts/localServerSupervisor.mjs > "$LOG_DIR/server.log" 2>&1 &
fi

if ! curl -fsS "$URL" >/dev/null 2>&1; then
  nohup npm run preview -- --port "$CLIENT_PORT" --strictPort > "$LOG_DIR/client.log" 2>&1 &
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

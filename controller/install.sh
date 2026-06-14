#!/bin/bash
set -e

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${PYTHON_BIN:-}" ]; then
  if [ -x "/www/server/panel/pyenv/bin/python3" ]; then
    PYTHON_BIN="/www/server/panel/pyenv/bin/python3"
  else
    PYTHON_BIN="$(command -v python3)"
  fi
fi

if [ -z "$PYTHON_BIN" ]; then
  echo "python3 not found. Please install Python 3 first."
  exit 1
fi

if [ ! -f "$BASE_DIR/controller/config.json" ]; then
  cp "$BASE_DIR/controller/config.example.json" "$BASE_DIR/controller/config.json"
  chmod 600 "$BASE_DIR/controller/config.json"
  echo "Controller config created: $BASE_DIR/controller/config.json"
  echo "Please edit bot_token or set TELEGRAM_BOT_TOKEN before starting."
fi

"$PYTHON_BIN" "$BASE_DIR/controller/telegram_controller.py" --init-db

CRON_LINE="* * * * * $PYTHON_BIN $BASE_DIR/controller/telegram_controller.py >> $BASE_DIR/runtime/controller.log 2>&1"
if crontab -l 2>/dev/null | grep -F "$BASE_DIR/controller/telegram_controller.py" >/dev/null 2>&1; then
  echo "Controller crontab already exists."
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "Controller crontab installed."
fi

echo "Start manually now with: nohup $PYTHON_BIN $BASE_DIR/controller/telegram_controller.py >> $BASE_DIR/runtime/controller.log 2>&1 &"

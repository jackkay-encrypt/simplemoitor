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
CONTROLLER_URL="${1:-http://127.0.0.1:8765}"

if [ -z "$PYTHON_BIN" ]; then
  echo "python3 not found. Please install Python 3 first."
  exit 1
fi

"$PYTHON_BIN" "$BASE_DIR/agent/server_agent.py" --init-config --controller-url "$CONTROLLER_URL"

cat > /www/srvid <<EOF
#!/bin/bash
$PYTHON_BIN $BASE_DIR/agent/server_agent.py id "\$@"
EOF
chmod 755 /www/srvid

echo "Short srv_id command installed: /www/srvid"

CRON_LINE="* * * * * $PYTHON_BIN $BASE_DIR/agent/server_agent.py --once >> $BASE_DIR/runtime/agent.log 2>&1"
LOG_CLEANUP_LINE="7 * * * * $PYTHON_BIN $BASE_DIR/scripts/cleanup_logs.py --runtime-dir $BASE_DIR/runtime --hours 24 >> $BASE_DIR/runtime/log_cleanup.log 2>&1"
if crontab -l 2>/dev/null | grep -F "$BASE_DIR/agent/server_agent.py" >/dev/null 2>&1; then
  echo "Agent crontab already exists."
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "Agent crontab installed."
fi

if crontab -l 2>/dev/null | grep -F "$BASE_DIR/scripts/cleanup_logs.py" >/dev/null 2>&1; then
  echo "Log cleanup crontab already exists."
else
  (crontab -l 2>/dev/null; echo "$LOG_CLEANUP_LINE") | crontab -
  echo "Log cleanup crontab installed."
fi

echo "Local logs retention: 24 hours"

echo "Please click [绑定服务器] in Telegram, then paste the output from: /www/srvid"

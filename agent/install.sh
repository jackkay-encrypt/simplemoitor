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
CONTROLLER_URL="${1:-https://simple.robot.lsmodjeskostatic666.com}"
BIND_PORT="${BIND_PORT:-${2:-}}"
BIND_IP="${BIND_IP:-${3:-}}"

if [ -z "$PYTHON_BIN" ]; then
  echo "[错误] 未找到 python3，请先安装 Python 3。"
  exit 1
fi

echo "=========================================="
echo "  simplemoitor Agent 安装程序"
echo "=========================================="
echo ""

# ── 1. 初始化配置 ──
echo "[1/4] 初始化 Agent 配置..."
INIT_ARGS=(--init-config --controller-url "$CONTROLLER_URL")
if [ -n "$BIND_PORT" ]; then
  INIT_ARGS+=(--bind-port "$BIND_PORT")
fi
if [ -n "$BIND_IP" ]; then
  INIT_ARGS+=(--bind-ip "$BIND_IP")
fi
"$PYTHON_BIN" "$BASE_DIR/agent/server_agent.py" "${INIT_ARGS[@]}"
echo ""

# ── 2. 安装快捷命令 ──
echo "[2/4] 安装快捷命令..."
cat > /www/srvid <<EOF
#!/bin/bash
$PYTHON_BIN $BASE_DIR/agent/server_agent.py id "\$@"
EOF
chmod 755 /www/srvid
echo "  ✓ /www/srvid"

cat > /www/simple <<EOF
#!/bin/bash
$PYTHON_BIN $BASE_DIR/scripts/simple_menu.py "\$@"
EOF
chmod 755 /www/simple

if [ -d "/usr/local/bin" ] && [ -w "/usr/local/bin" ]; then
  cat > /usr/local/bin/simple <<EOF
#!/bin/bash
$PYTHON_BIN $BASE_DIR/scripts/simple_menu.py "\$@"
EOF
  chmod 755 /usr/local/bin/simple
  echo "  ✓ simple (全局命令)"
else
  echo "  ✓ /www/simple"
fi
echo ""

# ── 3. 安装定时任务 ──
echo "[3/4] 安装定时任务..."
CRON_LINE="* * * * * $PYTHON_BIN $BASE_DIR/agent/server_agent.py --once >> $BASE_DIR/runtime/agent.log 2>&1"
LOG_CLEANUP_LINE="7 * * * * $PYTHON_BIN $BASE_DIR/scripts/cleanup_logs.py --runtime-dir $BASE_DIR/runtime --hours 24 >> $BASE_DIR/runtime/log_cleanup.log 2>&1"
if crontab -l 2>/dev/null | grep -F "$BASE_DIR/agent/server_agent.py" >/dev/null 2>&1; then
  echo "  ✓ Agent 定时任务已存在，跳过"
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "  ✓ Agent 每分钟上报"
fi

if crontab -l 2>/dev/null | grep -F "$BASE_DIR/scripts/cleanup_logs.py" >/dev/null 2>&1; then
  echo "  ✓ 日志清理已存在，跳过"
else
  (crontab -l 2>/dev/null; echo "$LOG_CLEANUP_LINE") | crontab -
  echo "  ✓ 日志清理（每24小时）"
fi
echo ""

# ── 4. 显示 Telegram 绑定指令 ──
echo "[4/4] 生成 Telegram 绑定指令..."
echo ""
echo "=========================================="
echo "  ↓ 请在 Telegram 中点击 [绑定服务器]"
echo "  ↓ 然后粘贴以下内容："
echo "=========================================="
echo ""
"$PYTHON_BIN" "$BASE_DIR/agent/server_agent.py" id
echo ""
echo "=========================================="
echo "  安装完成！"
echo "  控制器地址: $CONTROLLER_URL"
echo "  菜单命令:   simple"
echo "=========================================="

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

# ── 1. 生成随机端口并开放防火墙 ──
echo "[1/5] 分配通信端口..."

# 如果未手动指定端口，则自动生成随机端口
if [ -z "$BIND_PORT" ]; then
  while true; do
    RAND_PORT=$((RANDOM % 50001 + 10000))
    # 检查端口是否已被占用
    if ! ss -tlnp | grep -q ":${RAND_PORT} " 2>/dev/null; then
      BIND_PORT="$RAND_PORT"
      break
    fi
  done
  AUTO_PORT=true
else
  AUTO_PORT=false
fi

echo "  ✓ 分配端口: $BIND_PORT"

# 开放防火墙
if command -v ufw >/dev/null 2>&1; then
  if ufw status 2>/dev/null | grep -q "^${BIND_PORT}/tcp"; then
    echo "  ✓ 防火墙规则已存在，跳过"
  else
    ufw allow "${BIND_PORT}/tcp" >/dev/null 2>&1
    echo "  ✓ UFW 已开放端口 $BIND_PORT/tcp"
  fi
elif command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="${BIND_PORT}/tcp" >/dev/null 2>&1
  firewall-cmd --reload >/dev/null 2>&1
  echo "  ✓ firewalld 已开放端口 $BIND_PORT/tcp"
elif command -v iptables >/dev/null 2>&1; then
  if ! iptables -C INPUT -p tcp --dport "$BIND_PORT" -j ACCEPT >/dev/null 2>&1; then
    iptables -I INPUT -p tcp --dport "$BIND_PORT" -j ACCEPT
    echo "  ✓ iptables 已开放端口 $BIND_PORT/tcp"
  else
    echo "  ✓ iptables 规则已存在，跳过"
  fi
else
  echo "  ! 未检测到防火墙工具，请手动开放端口 $BIND_PORT/tcp"
fi
echo ""

# ── 2. 初始化配置 ──
echo "[2/5] 初始化 Agent 配置..."
INIT_ARGS=(--init-config --controller-url "$CONTROLLER_URL" --bind-port "$BIND_PORT")
if [ -n "$BIND_IP" ]; then
  INIT_ARGS+=(--bind-ip "$BIND_IP")
fi
"$PYTHON_BIN" "$BASE_DIR/agent/server_agent.py" "${INIT_ARGS[@]}"
echo ""

# ── 3. 安装快捷命令 ──
echo "[3/5] 安装快捷命令..."
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

# ── 4. 安装定时任务 ──
echo "[4/5] 安装定时任务..."
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

# ── 5. 同步端口到 Controller ──
echo "[5/5] 同步绑定信息到 Controller..."
if "$PYTHON_BIN" "$BASE_DIR/agent/server_agent.py" --once 2>/dev/null; then
  echo "  ✓ 已成功同步到 Controller"
else
  echo "  ! 同步失败（Controller 可能未启动），端口信息将在下次定时任务时自动同步"
fi
echo ""

# ── 显示 Telegram 绑定指令 ──
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
echo "  通信端口:   $BIND_PORT"
echo "  菜单命令:   simple"
echo "=========================================="

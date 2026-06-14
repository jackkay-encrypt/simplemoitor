# Server Telegram Monitor

一个基于 Telegram Bot 的多服务器状态监控系统，支持服务器绑定、解绑、状态汇报、汇报间隔设置、备注编辑和按钮化管理。

## 功能特性

- 多服务器统一管理
- Telegram Inline Keyboard 按钮交互
- 每台服务器自动生成 `srv_id` 和绑定码
- 通过 Telegram 绑定/解绑服务器
- 汇报 CPU、负载、内存、IP、主机名、运行时长
- 支持设置每台服务器汇报间隔
- 支持服务器备注名称
- 支持 `/www/srvid` 一键查看服务器 ID 和绑定码
- 解绑服务器后停止该服务器一切汇报

## 架构说明

项目分为两部分：

```text
server-monitor/
├── controller/    # Telegram Bot 控制端，只需要部署一份
├── agent/         # 服务器 Agent，每台被监控服务器部署一份
├── common/        # 公共模块
└── runtime/       # 运行时文件，不能提交到 GitHub
```

- **Controller**：负责 Telegram Bot 交互、服务器绑定关系、命令队列、状态消息发送。
- **Agent**：部署到每台服务器，负责采集 CPU、负载、内存等状态并主动连接 Controller。

## 安全说明

请不要提交真实配置文件：

- `agent/config.json`
- `controller/config.json`
- `runtime/*`
- `.env`

这些文件已经写入 `.gitignore`。

Telegram Bot Token 支持两种配置方式：

1. 环境变量 `TELEGRAM_BOT_TOKEN`
2. `controller/config.json` 文件

推荐使用环境变量。

## 环境要求

- Linux
- Python 3.7+
- cron / crontab
- 可访问 Telegram API：`https://api.telegram.org`

`psutil` 是可选依赖；未安装时程序会自动使用 `/proc` 读取基础指标。

## 快速开始

### 1. 创建 Telegram Bot

在 Telegram 中打开 `@BotFather`：

```text
/newbot
```

按提示创建机器人，并保存 Bot Token。

### 2. 部署 Controller

Controller 只需要部署一台，建议部署在公网可访问服务器。

一串命令安装：

```bash
git clone https://github.com/YOUR_GITHUB_USER/simplemoitor.git /opt/simplemoitor && cd /opt/simplemoitor && bash controller/install.sh
```

配置 Bot Token：

```bash
export TELEGRAM_BOT_TOKEN="你的Telegram Bot Token"
```

或者编辑：

```bash
/opt/simplemoitor/controller/config.json
```

启动 Controller：

```bash
nohup python3 /opt/simplemoitor/controller/telegram_controller.py >> /opt/simplemoitor/runtime/controller.log 2>&1 &
```

如果使用宝塔环境，也可以使用：

```bash
nohup /www/server/panel/pyenv/bin/python3 /opt/simplemoitor/controller/telegram_controller.py >> /opt/simplemoitor/runtime/controller.log 2>&1 &
```

### 3. 部署 Agent

在每台被监控服务器执行一串安装命令：

```bash
git clone https://github.com/YOUR_GITHUB_USER/simplemoitor.git /opt/simplemoitor && cd /opt/simplemoitor && bash agent/install.sh http://YOUR_CONTROLLER_IP:8765
```

安装后会自动创建短命令：

```bash
/www/srvid
```

执行后输出类似：

```text
srv_id: srv_ab12cd34
bind_code: 839201
Telegram 绑定输入: srv_ab12cd34 839201
```

### 4. Telegram 绑定服务器

打开你的 Telegram Bot：

1. 点击【服务器列表】
2. 点击【绑定服务器】
3. 粘贴 `/www/srvid` 输出里的“Telegram 绑定输入”

例如：

```text
srv_ab12cd34 839201
```

绑定完成后，服务器会出现在列表中。

## Telegram 菜单结构

首页：

- 【服务器列表】
- 【使用说明】

服务器列表页：

- 显示已绑定服务器数量
- 按编号展示服务器
- 【绑定服务器】
- 【解绑服务器】
- 【编辑服务器】
- 【返回首页】

编辑服务器页：

- 【编辑备注】
- 【设置汇报间隔】
- 【预警汇报】
  - CPU预警
  - 内存预警
  - 负载预警
- 【展示编辑】
  - 显示 srv_id
  - 显示备注名称
- 【返回】

## 常用命令

### 查看当前服务器 ID

```bash
/www/srvid
```

等价命令：

```bash
python3 /opt/simplemoitor/agent/server_agent.py id
```

### 手动运行 Agent 一次

```bash
python3 /opt/simplemoitor/agent/server_agent.py --once
```

### 初始化 Controller 数据库

```bash
python3 /opt/simplemoitor/controller/telegram_controller.py --init-db
```

### 健康检查

```bash
curl http://127.0.0.1:8765/health
```

返回：

```json
{"ok": true}
```

## 配置说明

### Controller 配置

参考：

```bash
controller/config.example.json
```

字段说明：

- `bot_token`：Telegram Bot Token，建议使用环境变量 `TELEGRAM_BOT_TOKEN`
- `api_base`：Telegram API 地址，默认 `https://api.telegram.org`
- `allowed_chat_ids`：允许使用该 Bot 的 Chat ID 列表，空数组表示不限制
- `listen_host`：Controller HTTP API 监听地址
- `listen_port`：Controller HTTP API 监听端口
- `db_path`：SQLite 数据库路径
- `poll_timeout`：Telegram long polling 超时时间

### Agent 配置

参考：

```bash
agent/config.example.json
```

Agent 首次启动会自动生成：

- `server_id`
- `bind_code`
- `agent_secret`

## 故障排查

### Telegram 没有响应

检查 Controller 是否运行：

```bash
pgrep -f telegram_controller.py
```

检查日志：

```bash
tail -n 100 /opt/simplemoitor/runtime/controller.log
```

### 服务器不汇报

检查 Agent crontab：

```bash
crontab -l
```

检查 Agent 日志：

```bash
tail -n 100 /opt/simplemoitor/runtime/agent.log
```

### 解绑后仍然汇报

请确认没有旧版单机监控任务：

```bash
crontab -l | grep system_health_telegram.py
```

正常情况下不应该有输出。

## 发布到 GitHub

本地仓库已提供安全发布脚本，脚本只从环境变量读取 GitHub Token，不会把 Token 写入文件或 remote URL。

```bash
cd /www/server/panel/script/server-monitor
GITHUB_TOKEN="你的GitHub Token" bash scripts/publish_github.sh simplemoitor
```

发布成功后，仓库地址格式为：

```text
https://github.com/YOUR_GITHUB_USER/simplemoitor
```

发布完成后请立即撤销临时 GitHub Token，或至少降低 Token 权限。

## GitHub 上传前检查

```bash
git status --ignored
```

确认以下文件没有进入待提交列表：

- `agent/config.json`
- `controller/config.json`
- `runtime/*`
- `.env`

## License

MIT

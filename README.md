# SimpleMoitor v1.0

轻量级 Telegram 服务器监控系统。通过 Bot 实时接收服务器状态汇报和预警通知。

## 架构

```
被监控服务器 (Agent/Python)
       ↓ HTTPS
Cloudflare Worker (Controller/TypeScript)
       ↓ Webhook
Telegram Bot
```

## 快速安装

在被监控服务器上执行：

```bash
git clone https://github.com/jackkay-encrypt/simplemoitor.git /simplemoitor && cd /simplemoitor && bash agent/install.sh https://YOUR_CONTROLLER_URL
```

安装完成后执行 `/www/srvid` 获取绑定信息，然后在 Telegram Bot 中点击【绑定服务器】粘贴即可。

## 功能

**服务器监控**
- 自动采集 CPU、内存、负载、运行时长等指标
- 可配置汇报间隔（1/5/10/30分钟或自定义，0 为关闭）
- CPU/内存/负载预警（VIP 功能）

**Telegram Bot**
- 服务器列表管理（绑定/解绑/编辑）
- 账户信息查看
- 充值 VIP（USDT TRC20 自动收款）
- 兑换码兑换 VIP
- 反馈提交

**管理 Bot（需登录）**
- VIP 会员管理（查看/搜索/延期/删除）
- 兑换码生成（1/3/7/30/90天或自定义）
- 收款地址和价格配置
- 留言管理与回复

## 终端命令

| 命令 | 说明 |
|------|------|
| `simple` | 管理菜单 |
| `/www/srvid` | 查看 srv_id 和绑定码 |
| `crontab -l` | 查看定时任务 |

## 项目结构

```
simplemoitor/
├── agent/           # Agent 监控程序 (Python)
├── common/          # 公共模块
├── scripts/         # 管理脚本
├── cf-worker/       # CF Worker Controller (TypeScript)
│   ├── src/         # 源码
│   └── migrations/  # D1 数据库迁移
└── requirements.txt
```

## 环境要求

- Agent: Linux + Python 3.7+ + cron
- Controller: Cloudflare Workers + D1

## License

MIT

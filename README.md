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

## 终端命令

| 命令 | 说明 |
|------|------|
| `simple` | 管理菜单 |
| `/www/srvid` | 查看 srv_id 和绑定码 |
| `crontab -l` | 查看定时任务 |

## 环境要求

- Agent: Linux + Python 3.7+ + cron
- Controller: Cloudflare Workers + D1

## License

MIT

# SimpleMoitor Agent v1.0

轻量级 Telegram 服务器监控 Agent。安装到被监控服务器后，自动采集系统指标并通过 Telegram Bot 汇报。

## 架构

```
被监控服务器 (本程序 Agent/Python)
       ↓ HTTPS
Cloudflare Worker (Controller)
       ↓ Webhook
Telegram Bot
```

## 快速安装

```bash
git clone https://github.com/jackkay-encrypt/simplemoitor.git /simplemoitor && cd /simplemoitor && bash agent/install.sh https://YOUR_CONTROLLER_URL
```

安装完成后执行 `/www/srvid` 获取绑定信息，然后在 Telegram Bot 中点击【绑定服务器】粘贴即可。

## 功能

- 自动采集 CPU、内存、负载、运行时长等指标
- 可配置汇报间隔（1/5/10/30分钟或自定义，0 为关闭）
- CPU/内存/负载预警（VIP 功能）
- 通过 Telegram Bot 绑定/解绑/编辑服务器
- 充值 VIP、兑换码、反馈提交

## 终端命令

| 命令 | 说明 |
|------|------|
| `simple` | 管理菜单 |
| `/www/srvid` | 查看 srv_id 和绑定码 |
| `crontab -l` | 查看定时任务 |

## 环境要求

- Linux + Python 3.7+ + cron
- 服务器可访问 Controller 地址

## License

MIT

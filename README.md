# SimpleMoitor v1.0

轻量级服务器安全汇报工具。安装到服务器后，自动采集系统指标并通过 Telegram Bot 定时汇报。

## 快速安装

```bash
git clone https://github.com/jackkay-encrypt/simplemoitor.git /simplemoitor && cd /simplemoitor && bash agent/install.sh https://simplemoitor.jackkay8826.workers.dev
```

安装完成后执行 `/www/srvid` 获取绑定信息，然后在 Telegram Bot 中点击【绑定服务器】粘贴即可。

## 功能

- 自动采集 CPU、内存、负载、运行时长等指标
- 可配置汇报间隔（1/5/10/30分钟或自定义，0 为关闭）
- CPU/内存/负载异常预警（VIP 功能）
- 通过 Telegram Bot 绑定/解绑/编辑服务器
- 充值 VIP、兑换码、反馈提交

## 终端管理菜单

执行 `simple` 进入管理菜单：

```
=== simplemoitor 管理菜单 ===
1. 查看 Telegram 的绑定指令
2. 查看 srv_id
3. 查看 bind_code
4. 自动更新程序
5. 修改通信端口
6. 删除插件
0. 退出
```

| 选项 | 说明 |
|------|------|
| 1 | 显示绑定指令和可直接粘贴的绑定信息 |
| 2 | 只显示当前服务器的 srv_id |
| 3 | 只显示当前服务器的绑定码 |
| 4 | 从 GitHub 下载最新版并自动更新，保留当前配置 |
| 5 | 修改通信端口，修改后自动同步 |
| 6 | 完全卸载程序（需输入 YES 确认） |

## 常用命令

| 命令 | 说明 |
|------|------|
| `simple` | 管理菜单 |
| `/www/srvid` | 查看 srv_id 和绑定码 |
| `crontab -l` | 查看定时任务 |

## 环境要求

- Linux + Python 3.7+ + cron

## License

MIT

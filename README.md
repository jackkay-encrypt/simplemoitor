# SimpleMoitor v1.2

轻量级服务器安全汇报工具。安装到服务器后，自动采集系统指标并通过 Telegram Bot 定时汇报。

## 快速安装

在终端直接输入命令即可完成安装。

```bash
git clone https://github.com/jackkay-encrypt/simplemoitor.git /simplemoitor && cd /simplemoitor && bash agent/install.sh https://simplemoitor.jackkay8826.workers.dev
```

安装完成后自动获取绑定信息，然后在 Telegram Bot 【@simplemoitor_bot】中点击【绑定服务器】粘贴即可。

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

## 更新日志

### v1.2 (2026-06-16)
- 服务器离线检测：超过 5 分钟未汇报显示异常并建议解绑
- simple 管理菜单显示当前程序版本号

### v1.1 (2026-06-16)
- 新增内置 DNS 回退解析，无系统 DNS 也能正常连接 Controller
- CPU 采样间隔从 1s 优化至 0.1s，Agent 执行速度提升约 60%
- 已绑定服务器跳过 register 调用，减少 1 次 HTTP 请求
- 安装脚本不再隐藏注册错误信息，便于排查问题
- `simple` 管理菜单新增「删除插件」功能（需输入 YES 确认）
- 绑定指令精简为 `srv_id + bind_code`，不再需要 IP 和端口

### v1.0 (2026-06-15)
- 首次发布
- Agent 自动采集 CPU、内存、负载、运行时长等指标
- 通过 Telegram Bot 绑定/解绑/管理服务器
- 可配置汇报间隔和异常预警
- 内置 DNS 回退解析，不依赖系统 resolv.conf

## License

MIT

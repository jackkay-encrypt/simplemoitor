# 服务器监控接入说明

这是用于接入统一 Telegram 服务器监控机器人的 Agent 程序。客户只需要在自己的服务器上安装本程序，然后把服务器绑定到指定的 Telegram 机器人即可。

客户不需要创建 Telegram 机器人，也不需要配置 Bot Token。机器人入口对所有 Telegram 用户开放，但所有服务器状态都会按绑定用户隔离：每个 Telegram 用户只能看到自己绑定的服务器。

## 功能说明

- 自动采集服务器 CPU、负载、内存、IP、主机名、运行时长等信息
- 每台服务器自动生成唯一 `srv_id` 和绑定码
- 支持通过 Telegram 按钮绑定、解绑和管理服务器
- 支持设置服务器备注名称
- 支持设置服务器状态汇报间隔
- 支持设置 CPU、负载、内存预警阈值，超过阈值后向绑定用户发送预警提示
- 支持 `/www/srvid` 一键查看服务器 ID 和绑定码
- 解绑服务器后，该服务器会停止向机器人发送汇报

## 数据隔离说明

本机器人按 Telegram 用户进行服务器隔离，不通过固定 Chat ID 白名单限制入口：

- 每个用户只能看到自己绑定的服务器
- 用户 A 看不到用户 B 绑定的服务器
- 用户 B 也看不到用户 A 绑定的服务器
- 服务器列表、编辑服务器、解绑服务器等操作都只作用于当前用户自己的服务器
- 管理员账号也不会在普通服务器列表里看到其他客户绑定的服务器
- 每台服务器必须使用自己的 `srv_id` 和绑定码完成绑定

也就是说，同一个机器人可以服务多个客户，但每个客户看到的都是自己的服务器列表。

## 环境要求

- Linux 服务器
- Python 3.7+
- cron / crontab
- 服务器可以访问监控 Controller 地址

程序会优先使用宝塔环境 Python：

```bash
/www/server/panel/pyenv/bin/python3
```

如果服务器不是宝塔环境，会自动尝试使用系统 `python3`。

## 一键安装

请在需要监控的服务器上执行下面命令。

```bash
git clone https://github.com/jackkay-encrypt/simplemoitor.git /opt/simplemoitor && cd /opt/simplemoitor && bash agent/install.sh http://YOUR_CONTROLLER_IP:8765
```

请把命令中的：

```text
http://YOUR_CONTROLLER_IP:8765
```

替换为服务方提供的 Controller 地址。

安装完成后，程序会自动：

- 生成当前服务器的 `srv_id`
- 生成绑定码
- 创建 Agent 配置文件
- 添加 crontab 定时任务
- 创建快捷命令 `/www/srvid`

## 获取服务器 ID

安装完成后，在服务器终端执行：

```bash
/www/srvid
```

输出示例：

```text
srv_id: srv_ab12cd34
bind_code: 839201
Telegram 绑定输入: srv_ab12cd34 839201
```

请复制最后一行中的绑定输入：

```text
srv_ab12cd34 839201
```

## 在 Telegram 机器人里绑定服务器

打开服务方提供的 Telegram 机器人，然后按下面步骤操作：

1. 点击【服务器列表】
2. 点击【绑定服务器】
3. 粘贴 `/www/srvid` 输出的“Telegram 绑定输入”
4. 绑定成功后，服务器会出现在你的服务器列表中

绑定后，只有当前 Telegram 用户可以看到这台服务器。

## Telegram 按钮功能

首页按钮：

- 【服务器列表】
- 【使用说明】

服务器列表页面：

- 查看自己已绑定的服务器数量
- 查看自己已绑定的服务器列表
- 【绑定服务器】
- 【解绑服务器】
- 【编辑服务器】
- 【返回首页】

编辑服务器页面：

- 【编辑备注】
- 【设置汇报间隔】
- 【预警汇报】
  - CPU 预警：可开启/关闭，并设置 70%、80%、90%、95% 阈值
  - 内存预警：可开启/关闭，并设置 70%、80%、90%、95% 阈值
  - 负载预警：可开启/关闭，并设置 1、2、5、10 阈值
- 【展示编辑】
- 【返回】

## 常用命令

### 查看服务器 ID 和绑定码

```bash
/www/srvid
```

### 手动运行 Agent 一次

```bash
python3 /opt/simplemoitor/agent/server_agent.py --once
```

如果是宝塔环境，也可以使用：

```bash
/www/server/panel/pyenv/bin/python3 /opt/simplemoitor/agent/server_agent.py --once
```

### 查看 Agent 定时任务

```bash
crontab -l
```

正常情况下会看到类似任务：

```text
* * * * * python3 /opt/simplemoitor/agent/server_agent.py --once >> /opt/simplemoitor/runtime/agent.log 2>&1
```

## 故障排查

### 执行 `/www/srvid` 提示文件不存在

请确认安装命令是否执行成功。如果没有成功，可以重新执行安装命令。

### 服务器没有出现在机器人列表

请检查：

- 是否已经在机器人里点击【绑定服务器】
- 是否完整粘贴了 `/www/srvid` 输出中的绑定输入
- Controller 地址是否填写正确
- Agent 是否已经写入 crontab

### 服务器不再汇报

请检查 Agent 日志：

```bash
tail -n 100 /opt/simplemoitor/runtime/agent.log
```

也可以手动运行一次 Agent：

```bash
python3 /opt/simplemoitor/agent/server_agent.py --once
```

### 解绑后是否还会汇报

正常情况下，解绑服务器后，该服务器会停止发送定时汇报。

如果仍然收到汇报，请检查服务器上是否存在旧版单机监控任务：

```bash
crontab -l | grep system_health_telegram.py
```

正常情况下不应该有输出。

## 安全说明

请不要公开或提交以下文件：

- `agent/config.json`
- `runtime/*`
- `.env`

这些文件可能包含服务器身份信息、绑定信息或运行日志。

## License

MIT

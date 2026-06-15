# 服务器监控接入说明

这是用于接入统一 Telegram 服务器监控机器人的 Agent 程序。客户只需要在自己的服务器上安装本程序，然后把服务器绑定到指定的 Telegram 机器人即可。

客户不需要创建 Telegram 机器人，也不需要配置 Bot Token。机器人入口对所有 Telegram 用户开放，但所有服务器状态都会按绑定用户隔离：每个 Telegram 用户只能看到自己绑定的服务器。

## 功能说明

- 自动采集服务器 CPU、负载、内存、IP、主机名、运行时长等信息
- 每台服务器自动生成唯一 `srv_id`、绑定码，并使用 `IP + 端口 + srv_id + bind_code` 四参数绑定
- 支持通过 Telegram 按钮绑定、解绑和管理服务器
- 支持首页【反馈】入口，用户输入内容后可转发给管理员反馈机器人
- 支持设置服务器备注名称
- 支持设置服务器状态汇报间隔，可选择预设时间、自定义分钟数，也可设置 `0` 分钟关闭定时汇报
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
git clone https://github.com/jackkay-encrypt/simplemoitor.git /simplemoitor && cd /simplemoitor && bash agent/install.sh http://YOUR_CONTROLLER_IP:8765 CUSTOM_BIND_PORT
```

请把命令中的：

```text
http://YOUR_CONTROLLER_IP:8765
```

替换为服务方提供的 Controller 地址；把 `CUSTOM_BIND_PORT` 替换为本服务器自定义绑定端口，例如 `22018`。不同服务器可使用不同端口，避免全部服务器使用同一个固定端口。

安装完成后，程序会自动：

- 生成当前服务器的 `srv_id`
- 生成绑定码
- 保存绑定 IP 和自定义绑定端口
- 创建 Agent 配置文件
- 添加 crontab 定时任务
- 添加本地日志 24 小时保留清理任务
- 创建快捷命令 `/www/srvid`
- 创建管理菜单命令 `simple`，如果当前系统不允许写入 PATH，则可使用 `/www/simple`

## 获取服务器 ID

安装完成后，在服务器终端执行：

```bash
/www/srvid
```

输出示例：

```text
bind_ip: 1.2.3.4
bind_port: 22018
srv_id: srv_ab12cd34
bind_code: 839201
Telegram 绑定输入: 1.2.3.4 22018 srv_ab12cd34 839201
```

请复制最后一行中的绑定输入：

```text
1.2.3.4 22018 srv_ab12cd34 839201
```

## 终端管理菜单

安装完成后，在服务器终端执行：

```bash
simple
```

会弹出管理菜单，输入编号执行对应功能，执行完成后会自动退出：

```text
1. 查看 Telegram 的绑定指令
2. 查看 srv_id
3. 查看 bind_code
4. 自动更新程序
5. 查看程序端口
6. 编辑绑定端口
0. 退出
```

如果当前系统没有把 `simple` 写入 PATH，可以执行：

```bash
/www/simple
```

菜单说明：

- **1 查看 Telegram 的绑定指令**：显示 `/bind IP 端口 srv_id bind_code` 和可直接粘贴的绑定输入。
- **2 查看 srv_id**：只显示当前服务器的 `srv_id`。
- **3 查看 bind_code**：只显示当前服务器绑定码。
- **4 自动更新程序**：自动从 GitHub 下载最新版，保留当前配置，重新安装，安装完成后自动删除临时安装文件。
- **5 查看程序端口**：显示当前 `bind_port`。
- **6 编辑绑定端口**：输入新端口后自动保存，并立即执行一次 Agent 同步到 Controller。

## 在 Telegram 机器人里绑定服务器

打开服务方提供的 Telegram 机器人，然后按下面步骤操作：

1. 点击【服务器列表】
2. 点击【绑定服务器】
3. 粘贴 `/www/srvid` 输出的“Telegram 绑定输入”，格式为 `IP 端口 srv_id bind_code`
4. 绑定成功后，服务器会出现在你的服务器列表中

绑定后，只有当前 Telegram 用户可以看到这台服务器。

## Telegram 按钮功能

首页按钮：

- 【服务器列表】
- 【使用说明】
- 【反馈】

反馈功能：

- 用户点击【反馈】后可直接输入反馈内容
- 反馈内容会转发给管理员配置的反馈机器人接收人
- 反馈机器人支持【刷新】查看未回复留言条数和留言用户数
- 反馈机器人支持【留言】逐条查看未回复留言
- 管理员可点击单条留言下方【回复】，输入内容后会同步发送给原用户
- 使用反馈功能前，管理员需要在 Controller 配置中设置 `feedback_bot_token` 和 `feedback_chat_id`

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
  - 可选择 1、5、10、30 分钟
  - 可点击【自定义时间】输入分钟数
  - 可点击【取消定时汇报】或输入 `0` 分钟关闭定时状态汇报
- 【预警汇报】
  - CPU 预警：可开启/关闭，并设置 70%、80%、90%、95% 阈值
  - 内存预警：可开启/关闭，并设置 70%、80%、90%、95% 阈值
  - 负载预警：可开启/关闭，并设置 1、2、5、10 阈值
- 【展示编辑】
- 【返回】

## 常用命令

### 打开管理菜单

```bash
simple
```

如果 `simple` 不可用，请执行：

```bash
/www/simple
```

### 查看服务器 ID 和绑定码

```bash
/www/srvid
```

### 手动运行 Agent 一次

```bash
python3 /simplemoitor/agent/server_agent.py --once
```

如果是宝塔环境，也可以使用：

```bash
/www/server/panel/pyenv/bin/python3 /simplemoitor/agent/server_agent.py --once
```

### 自动更新程序

```bash
simple
```

然后输入 `4`。

程序会下载最新版，保留当前配置，重新安装，并在安装完成后自动删除临时安装文件。

### 编辑绑定端口

```bash
simple
```

然后输入 `6`，按提示输入新的绑定端口即可。

### 设置汇报间隔

在 Telegram 机器人中进入：

```text
服务器列表 → 编辑服务器 → 选择服务器 → 设置汇报间隔
```

可选择预设的 1、5、10、30 分钟，也可以点击【自定义时间】后输入分钟数。

如果输入：

```text
0
```

则表示关闭这台服务器的定时状态汇报。关闭后，手动刷新状态和预警功能仍然可以继续使用。

### 查看 Agent 定时任务

```bash
crontab -l
```

正常情况下会看到类似任务：

```text
* * * * * python3 /simplemoitor/agent/server_agent.py --once >> /simplemoitor/runtime/agent.log 2>&1
7 * * * * python3 /simplemoitor/scripts/cleanup_logs.py --runtime-dir /simplemoitor/runtime --hours 24 >> /simplemoitor/runtime/log_cleanup.log 2>&1
```

日志清理任务每小时执行一次，本地日志只保留最近 24 小时内容。

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

请检查最近 24 小时内的 Agent 日志：

```bash
tail -n 100 /simplemoitor/runtime/agent.log
```

也可以手动运行一次 Agent：

```bash
python3 /simplemoitor/agent/server_agent.py --once
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

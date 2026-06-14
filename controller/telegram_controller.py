#!/www/server/panel/pyenv/bin/python3
# coding: utf-8

import argparse
import atexit
import html
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from common.metrics import build_text_report
from common.storage import MonitorStore
from common.telegram import TelegramClient

DEFAULT_CONFIG_PATH = os.path.join(BASE_DIR, 'controller', 'config.json')
DEFAULT_DB_PATH = os.path.join(BASE_DIR, 'runtime', 'monitor.db')
DEFAULT_PID_PATH = os.path.join(BASE_DIR, 'runtime', 'controller.pid')


def write_log(message):
    line = '[{}] {}'.format(time.strftime('%Y-%m-%d %H:%M:%S'), message)
    print(line)


def load_json(path):
    if not os.path.exists(path):
        return {}
    with open(path, 'r', encoding='utf-8') as fp:
        return json.load(fp)


def save_json(path, data, mode=0o600):
    folder = os.path.dirname(path)
    if folder and not os.path.exists(folder):
        os.makedirs(folder)
    with open(path, 'w', encoding='utf-8') as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)
    os.chmod(path, mode)


def load_config(path):
    config = load_json(path)
    if os.environ.get('TELEGRAM_BOT_TOKEN'):
        config['bot_token'] = os.environ.get('TELEGRAM_BOT_TOKEN')
    if os.environ.get('TELEGRAM_ALLOWED_CHAT_IDS'):
        config['allowed_chat_ids'] = [x.strip() for x in os.environ.get('TELEGRAM_ALLOWED_CHAT_IDS').split(',') if x.strip()]
    config.setdefault('api_base', 'https://api.telegram.org')
    config.setdefault('listen_host', '127.0.0.1')
    config.setdefault('listen_port', 8765)
    config.setdefault('db_path', DEFAULT_DB_PATH)
    config.setdefault('poll_timeout', 25)
    config.setdefault('allowed_chat_ids', [])
    return config


def init_config(path):
    if os.path.exists(path):
        write_log('配置文件已存在：{}'.format(path))
        return
    sample = {
        'bot_token': '请填写Telegram Bot Token，或使用环境变量 TELEGRAM_BOT_TOKEN',
        'api_base': 'https://api.telegram.org',
        'allowed_chat_ids': [],
        'listen_host': '127.0.0.1',
        'listen_port': 8765,
        'db_path': DEFAULT_DB_PATH,
        'poll_timeout': 25
    }
    save_json(path, sample)
    write_log('已生成配置模板：{}'.format(path))


def is_pid_running(pid):
    try:
        pid = int(pid)
    except Exception:
        return False
    return pid > 0 and os.path.exists('/proc/{}'.format(pid))


def acquire_pidfile(pid_path):
    folder = os.path.dirname(pid_path)
    if folder and not os.path.exists(folder):
        os.makedirs(folder)
    if os.path.exists(pid_path):
        try:
            old_pid = open(pid_path, 'r', encoding='utf-8').read().strip()
        except Exception:
            old_pid = ''
        if is_pid_running(old_pid):
            write_log('Controller 已运行，pid={}'.format(old_pid))
            return False
    with open(pid_path, 'w', encoding='utf-8') as fp:
        fp.write(str(os.getpid()))

    def cleanup():
        try:
            if os.path.exists(pid_path):
                current = open(pid_path, 'r', encoding='utf-8').read().strip()
                if current == str(os.getpid()):
                    os.remove(pid_path)
        except Exception:
            pass

    atexit.register(cleanup)
    return True


def json_response(handler, code, payload):
    body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    handler.send_response(code)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Content-Length', str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_request_json(handler):
    length = int(handler.headers.get('Content-Length', 0) or 0)
    raw = handler.rfile.read(length).decode('utf-8') if length else '{}'
    return json.loads(raw or '{}')


class MonitorController(object):
    def __init__(self, config):
        self.config = config
        self.store = MonitorStore(config['db_path'])
        self.telegram = TelegramClient(config.get('bot_token'), config.get('api_base'), timeout=35)

    def is_chat_allowed(self, chat_id):
        allowed = [str(x) for x in self.config.get('allowed_chat_ids') or []]
        return not allowed or str(chat_id) in allowed

    def main_keyboard(self):
        return {'inline_keyboard': [
            [{'text': '服务器列表', 'callback_data': 'menu:list'}],
            [{'text': '使用说明', 'callback_data': 'menu:help'}]
        ]}

    def list_action_keyboard(self):
        return {'inline_keyboard': [
            [{'text': '绑定服务器', 'callback_data': 'menu:bind'},
             {'text': '解绑服务器', 'callback_data': 'menu:unbind_menu'}],
            [{'text': '编辑服务器', 'callback_data': 'menu:edit_menu'}],
            [{'text': '返回首页', 'callback_data': 'menu:home'}]
        ]}

    def server_keyboard(self, server_id):
        return {'inline_keyboard': [
            [{'text': '编辑备注', 'callback_data': 'srv:rename_hint:{}'.format(server_id)}],
            [{'text': '设置汇报间隔', 'callback_data': 'srv:interval_menu:{}'.format(server_id)}],
            [{'text': '预警汇报', 'callback_data': 'srv:warning_menu:{}'.format(server_id)}],
            [{'text': '展示编辑', 'callback_data': 'srv:display_menu:{}'.format(server_id)}],
            [{'text': '返回', 'callback_data': 'menu:edit_menu'}]
        ]}

    def interval_keyboard(self, server_id):
        return {'inline_keyboard': [
            [{'text': '1分钟', 'callback_data': 'srv:set_interval:{}:60'.format(server_id)},
             {'text': '5分钟', 'callback_data': 'srv:set_interval:{}:300'.format(server_id)}],
            [{'text': '10分钟', 'callback_data': 'srv:set_interval:{}:600'.format(server_id)},
             {'text': '30分钟', 'callback_data': 'srv:set_interval:{}:1800'.format(server_id)}],
            [{'text': '返回', 'callback_data': 'srv:edit:{}'.format(server_id)}]
        ]}

    def warning_keyboard(self, server_id):
        return {'inline_keyboard': [
            [{'text': 'CPU预警', 'callback_data': 'srv:warning:{}:cpu'.format(server_id)}],
            [{'text': '内存预警', 'callback_data': 'srv:warning:{}:memory'.format(server_id)}],
            [{'text': '负载预警', 'callback_data': 'srv:warning:{}:load'.format(server_id)}],
            [{'text': '返回', 'callback_data': 'srv:edit:{}'.format(server_id)}]
        ]}

    def display_keyboard(self, server_id):
        return {'inline_keyboard': [
            [{'text': '显示 srv_id', 'callback_data': 'srv:set_display:{}:server_id'.format(server_id)}],
            [{'text': '显示备注名称', 'callback_data': 'srv:set_display:{}:server_name'.format(server_id)}],
            [{'text': '返回', 'callback_data': 'srv:edit:{}'.format(server_id)}]
        ]}

    def get_display_mode(self, chat_id):
        return self.store.get_setting('display_mode:{}'.format(chat_id), 'server_id') or 'server_id'

    def set_display_mode(self, chat_id, mode):
        if mode not in ('server_id', 'server_name'):
            mode = 'server_id'
        self.store.set_setting('display_mode:{}'.format(chat_id), mode)

    def server_label(self, chat_id, server):
        mode = self.get_display_mode(chat_id)
        server_id = server.get('server_id') or ''
        server_name = server.get('server_name') or ''
        if mode == 'server_name':
            return (server_name or server_id)[:32]
        return server_id[:32]

    def server_summary_line(self, idx, server):
        server_id = html.escape(str(server.get('server_id') or ''))
        server_name = html.escape(str(server.get('server_name') or ''))
        suffix = '-【{}】'.format(server_name) if server_name else ''
        return '{}、{}{}'.format(idx, server_id, suffix)

    def server_select_keyboard(self, chat_id, servers, action, back='menu:list'):
        rows = []
        for server in servers[:20]:
            server_id = server.get('server_id')
            rows.append([{'text': self.server_label(chat_id, server), 'callback_data': 'srv:{}:{}'.format(action, server_id)}])
        rows.append([{'text': '返回', 'callback_data': back}])
        return {'inline_keyboard': rows}

    def list_keyboard(self, servers):
        return self.list_action_keyboard()

    def pending_key(self, chat_id):
        return 'pending_action:{}'.format(chat_id)

    def set_pending(self, chat_id, action, server_id=None):
        data = {'action': action, 'server_id': server_id, 'created_at': int(time.time())}
        self.store.set_setting(self.pending_key(chat_id), json.dumps(data, ensure_ascii=False))

    def get_pending(self, chat_id):
        raw = self.store.get_setting(self.pending_key(chat_id))
        if not raw:
            return None
        try:
            data = json.loads(raw)
        except Exception:
            self.clear_pending(chat_id)
            return None
        if int(time.time()) - int(data.get('created_at') or 0) > 600:
            self.clear_pending(chat_id)
            return None
        return data

    def clear_pending(self, chat_id):
        self.store.set_setting(self.pending_key(chat_id), '')

    def prompt_bind(self, chat_id):
        self.set_pending(chat_id, 'bind')
        text = '\n'.join([
            '<b>绑定新服务器</b>',
            '',
            '请把新服务器安装后显示的 server_id 和 bind_code 粘贴给我。',
            '格式示例：',
            '<code>srv_ab12cd34 839201</code>'
        ])
        self.telegram.send_message(chat_id, text, reply_markup=self.main_keyboard())

    def prompt_rename(self, chat_id, server_id):
        server = self.store.get_bound_server(server_id, chat_id)
        if not server:
            self.telegram.send_message(chat_id, '未找到已绑定的服务器。', reply_markup=self.main_keyboard())
            return
        self.set_pending(chat_id, 'rename', server_id)
        self.telegram.send_message(chat_id, '请直接发送新的服务器名称。', reply_markup=self.server_keyboard(server_id))

    def handle_pending_text(self, chat_id, text):
        pending = self.get_pending(chat_id)
        if not pending:
            return False
        action = pending.get('action')
        if action == 'bind':
            self.handle_pending_bind(chat_id, text)
            return True
        if action == 'rename':
            self.handle_pending_rename(chat_id, pending.get('server_id'), text)
            return True
        self.clear_pending(chat_id)
        return False

    def handle_pending_bind(self, chat_id, text):
        tokens = text.replace(':', ' ').replace('：', ' ').replace('\n', ' ').split()
        server_id = None
        bind_code = None
        for token in tokens:
            if token.startswith('srv_'):
                server_id = token
            elif token.isdigit() and len(token) >= 4:
                bind_code = token
        if not server_id or not bind_code:
            self.telegram.send_message(chat_id, '没有识别到完整的 server_id 和 bind_code，请重新粘贴。', reply_markup=self.main_keyboard())
            return
        ok, result = self.store.bind_server(server_id, bind_code, chat_id)
        if not ok:
            self.telegram.send_message(chat_id, result, reply_markup=self.main_keyboard())
            return
        self.clear_pending(chat_id)
        fresh = self.store.get_bound_server(server_id, chat_id)
        self.telegram.send_message(
            chat_id,
            '绑定成功：{}\n当前汇报间隔：{} 秒'.format(server_id, fresh.get('report_interval')),
            reply_markup=self.server_keyboard(server_id)
        )

    def handle_pending_rename(self, chat_id, server_id, text):
        server_name = text.strip()
        if not server_name:
            self.telegram.send_message(chat_id, '名称不能为空，请重新输入。', reply_markup=self.server_keyboard(server_id))
            return
        ok, result = self.store.rename_server(server_id, chat_id, server_name)
        if not ok:
            self.telegram.send_message(chat_id, result, reply_markup=self.main_keyboard())
            return
        self.clear_pending(chat_id)
        self.telegram.send_message(chat_id, '已重命名为 {}。'.format(html.escape(str(result))), reply_markup=self.server_keyboard(server_id))

    def official_home(self, chat_id):
        text = '\n'.join([
            '<b>服务器监控管理中心</b>',
            '',
            '欢迎使用服务器监控机器人。',
            '你可以通过下方按钮管理服务器、查看绑定列表、设置汇报间隔和预警项目。'
        ])
        self.telegram.send_message(chat_id, text, reply_markup=self.main_keyboard())

    def auth_request(self, handler):
        server_id = handler.headers.get('X-Server-Id')
        agent_secret = handler.headers.get('X-Agent-Secret')
        if not server_id or not agent_secret:
            return None
        return self.store.auth_server(server_id, agent_secret)

    def handle_register(self, payload):
        required = ['server_id', 'bind_code', 'agent_secret']
        for key in required:
            if not payload.get(key):
                return {'ok': False, 'error': '缺少参数：{}'.format(key)}
        ok, msg = self.store.register_server(
            payload.get('server_id'),
            payload.get('server_name') or payload.get('server_id'),
            payload.get('bind_code'),
            payload.get('agent_secret'),
            int(payload.get('report_interval') or 300),
            payload.get('metrics') or {}
        )
        return {'ok': ok, 'message': msg}

    def handle_heartbeat(self, server, payload):
        self.store.update_heartbeat(server['server_id'], payload.get('metrics') or {})
        fresh = self.store.auth_server(server['server_id'], payload.get('agent_secret') or '') or server
        return {
            'ok': True,
            'server_name': fresh.get('server_name'),
            'report_interval': int(fresh.get('report_interval') or 300),
            'bound': bool(fresh.get('chat_id'))
        }

    def handle_pull_commands(self, server):
        fresh = self.store.get_bound_server(server['server_id']) or server
        return {
            'ok': True,
            'server_name': fresh.get('server_name'),
            'report_interval': int(fresh.get('report_interval') or 300),
            'bound': bool(fresh.get('chat_id')),
            'commands': self.store.consume_commands(server['server_id'])
        }

    def handle_report(self, server, payload):
        metrics = payload.get('metrics') or {}
        reason = payload.get('reason') or 'scheduled'
        bound_server = self.store.update_report(server['server_id'], metrics)
        if not bound_server or not bound_server.get('chat_id'):
            return {'ok': True, 'sent': False, 'message': '服务器尚未绑定 Telegram'}
        text = build_text_report(bound_server, metrics, reason=reason)
        self.telegram.send_message(bound_server['chat_id'], text, reply_markup=self.server_keyboard(bound_server['server_id']))
        return {'ok': True, 'sent': True}

    def handle_telegram_update(self, update):
        if update.get('callback_query'):
            self.handle_callback_query(update.get('callback_query') or {})
            return
        message = update.get('message') or update.get('edited_message') or {}
        text = (message.get('text') or '').strip()
        chat = message.get('chat') or {}
        chat_id = chat.get('id')
        if not text or not chat_id:
            return
        if not self.is_chat_allowed(chat_id):
            self.telegram.send_message(chat_id, '当前 Chat ID 未授权使用该监控机器人。')
            return
        chat_id = str(chat_id)
        if text.startswith('/'):
            self.handle_command(chat_id, text)
            return
        if self.handle_pending_text(chat_id, text):
            return
        self.telegram.send_message(chat_id, '请选择下方按钮操作。', reply_markup=self.main_keyboard())

    def handle_callback_query(self, callback_query):
        callback_id = callback_query.get('id')
        data = callback_query.get('data') or ''
        message = callback_query.get('message') or {}
        chat = message.get('chat') or {}
        chat_id = chat.get('id')
        if callback_id:
            self.telegram.answer_callback_query(callback_id, '处理中')
        if not chat_id or not self.is_chat_allowed(chat_id):
            return
        chat_id = str(chat_id)
        parts = data.split(':')
        if data == 'menu:home':
            self.official_home(chat_id)
            return
        if data == 'menu:bind':
            self.prompt_bind(chat_id)
            return
        if data == 'menu:list':
            self.cmd_list(chat_id)
            return
        if data == 'menu:unbind_menu':
            self.show_unbind_menu(chat_id)
            return
        if data == 'menu:edit_menu':
            self.show_edit_menu(chat_id)
            return
        if data == 'menu:help':
            self.reply_help(chat_id)
            return
        if len(parts) < 3 or parts[0] != 'srv':
            self.telegram.send_message(chat_id, '按钮数据无效。', reply_markup=self.main_keyboard())
            return
        action = parts[1]
        server_id = parts[2]
        if action == 'status':
            self.queue_status(chat_id, server_id)
        elif action == 'edit':
            self.show_server_edit(chat_id, server_id)
        elif action == 'interval_menu':
            self.show_interval_menu(chat_id, server_id)
        elif action == 'set_interval' and len(parts) == 4:
            self.set_interval_from_button(chat_id, server_id, parts[3])
        elif action == 'rename_hint':
            self.prompt_rename(chat_id, server_id)
        elif action == 'warning_menu':
            self.show_warning_menu(chat_id, server_id)
        elif action == 'warning' and len(parts) == 4:
            self.show_warning_item(chat_id, server_id, parts[3])
        elif action == 'display_menu':
            self.show_display_menu(chat_id, server_id)
        elif action == 'set_display' and len(parts) == 4:
            self.set_display_from_button(chat_id, server_id, parts[3])
        elif action == 'unbind_confirm':
            keyboard = {'inline_keyboard': [
                [{'text': '确认解绑', 'callback_data': 'srv:unbind:{}'.format(server_id)}],
                [{'text': '取消', 'callback_data': 'menu:unbind_menu'}]
            ]}
            self.telegram.send_message(chat_id, '确认解绑服务器 {}？'.format(server_id), reply_markup=keyboard)
        elif action == 'unbind':
            ok, result = self.store.unbind_server(server_id, chat_id)
            self.telegram.send_message(chat_id, '已解绑 {}。'.format(server_id) if ok else result, reply_markup=self.list_action_keyboard())
        else:
            self.telegram.send_message(chat_id, '暂不支持该按钮操作。', reply_markup=self.main_keyboard())

    def poll_telegram_once(self):
        offset_value = self.store.get_setting('telegram_offset')
        offset = int(offset_value) if offset_value else None
        updates = self.telegram.get_updates(offset=offset, timeout=int(self.config.get('poll_timeout') or 25))
        for update in updates:
            self.handle_telegram_update(update)
            self.store.set_setting('telegram_offset', int(update['update_id']) + 1)

    def handle_command(self, chat_id, text):
        parts = text.split()
        command = parts[0].split('@', 1)[0].lower()
        try:
            if command == '/start':
                self.official_home(chat_id)
            elif command == '/help':
                self.reply_help(chat_id)
            elif command == '/bind':
                self.cmd_bind(chat_id, parts)
            elif command == '/list':
                self.cmd_list(chat_id)
            elif command == '/status':
                self.cmd_status(chat_id, parts)
            elif command == '/interval':
                self.cmd_interval(chat_id, parts)
            elif command == '/rename':
                self.cmd_rename(chat_id, parts, text)
            elif command == '/unbind':
                self.cmd_unbind(chat_id, parts)
            else:
                self.telegram.send_message(chat_id, '请选择下方按钮操作。', reply_markup=self.main_keyboard())
        except Exception as error:
            self.telegram.send_message(chat_id, '操作执行失败：{}'.format(error), reply_markup=self.main_keyboard())

    def reply_help(self, chat_id):
        text = '\n'.join([
            '<b>使用说明</b>',
            '',
            '首页提供两个入口：',
            '1、服务器列表：查看已绑定服务器，并进入绑定、解绑、编辑。',
            '2、使用说明：查看当前说明。',
            '',
            '在服务器列表中点击“编辑服务器”，再选择某台服务器即可编辑备注、汇报间隔、预警项目和展示名称。',
            '',
            '<b>如何重新获取 srv_id</b>',
            '在服务器执行：',
            '<code>/www/srvid</code>',
            '',
            '执行后把显示的“Telegram 绑定输入”复制到【绑定服务器】流程里即可。'
        ])
        self.telegram.send_message(chat_id, text, reply_markup=self.main_keyboard())

    def cmd_bind(self, chat_id, parts):
        if len(parts) != 3:
            self.prompt_bind(chat_id)
            return
        ok, result = self.store.bind_server(parts[1], parts[2], chat_id)
        if not ok:
            self.telegram.send_message(chat_id, result, reply_markup=self.main_keyboard())
            return
        fresh = self.store.get_bound_server(parts[1], chat_id)
        self.telegram.send_message(
            chat_id,
            '绑定成功：{}\n当前汇报间隔：{} 秒'.format(parts[1], fresh.get('report_interval')),
            reply_markup=self.server_keyboard(parts[1])
        )

    def cmd_list(self, chat_id):
        servers = self.store.list_servers(chat_id)
        lines = ['<b>服务器列表</b>', '已绑定了 {} 台服务器'.format(len(servers))]
        if servers:
            for idx, server in enumerate(servers, 1):
                lines.append(self.server_summary_line(idx, server))
        else:
            lines.append('暂无已绑定服务器。')
        self.telegram.send_message(chat_id, '\n'.join(lines), reply_markup=self.list_keyboard(servers))

    def show_unbind_menu(self, chat_id):
        servers = self.store.list_servers(chat_id)
        if not servers:
            self.telegram.send_message(chat_id, '暂无可解绑服务器。', reply_markup=self.list_action_keyboard())
            return
        self.telegram.send_message(
            chat_id,
            '请选择需要解绑的服务器：',
            reply_markup=self.server_select_keyboard(chat_id, servers, 'unbind_confirm')
        )

    def show_edit_menu(self, chat_id):
        servers = self.store.list_servers(chat_id)
        if not servers:
            self.telegram.send_message(chat_id, '暂无可编辑服务器。', reply_markup=self.list_action_keyboard())
            return
        mode_text = 'srv_id' if self.get_display_mode(chat_id) == 'server_id' else '备注名称'
        self.telegram.send_message(
            chat_id,
            '请选择需要编辑的服务器：\n当前按钮展示：{}'.format(mode_text),
            reply_markup=self.server_select_keyboard(chat_id, servers, 'edit')
        )

    def show_server_edit(self, chat_id, server_id):
        server = self.store.get_bound_server(server_id, chat_id)
        if not server:
            self.telegram.send_message(chat_id, '未找到已绑定的服务器。', reply_markup=self.list_action_keyboard())
            return
        server_name = html.escape(str(server.get('server_name') or ''))
        text = '\n'.join([
            '<b>编辑服务器</b>',
            'srv_id：{}'.format(html.escape(str(server_id))),
            '备注：{}'.format(server_name or '未设置')
        ])
        self.telegram.send_message(chat_id, text, reply_markup=self.server_keyboard(server_id))

    def queue_status(self, chat_id, server_id):
        server = self.store.get_bound_server(server_id, chat_id)
        if not server:
            self.telegram.send_message(chat_id, '未找到已绑定的服务器。', reply_markup=self.main_keyboard())
            return
        self.store.enqueue_command(server_id, 'report_now', {'reason': 'manual'})
        self.telegram.send_message(chat_id, '已提交状态刷新请求：{}\nAgent 下一次轮询后会推送最新状态。'.format(server_id), reply_markup=self.server_keyboard(server_id))

    def show_interval_menu(self, chat_id, server_id):
        server = self.store.get_bound_server(server_id, chat_id)
        if not server:
            self.telegram.send_message(chat_id, '未找到已绑定的服务器。', reply_markup=self.list_action_keyboard())
            return
        self.telegram.send_message(
            chat_id,
            '请选择 {} 的汇报间隔：\n当前间隔：{} 秒'.format(server_id, server.get('report_interval')),
            reply_markup=self.interval_keyboard(server_id)
        )

    def show_warning_menu(self, chat_id, server_id):
        server = self.store.get_bound_server(server_id, chat_id)
        if not server:
            self.telegram.send_message(chat_id, '未找到已绑定的服务器。', reply_markup=self.list_action_keyboard())
            return
        self.telegram.send_message(
            chat_id,
            '请选择 {} 的预警汇报项目：'.format(server_id),
            reply_markup=self.warning_keyboard(server_id)
        )

    def show_warning_item(self, chat_id, server_id, warning_type):
        names = {'cpu': 'CPU预警', 'memory': '内存预警', 'load': '负载预警'}
        name = names.get(warning_type, '预警')
        text = '\n'.join([
            '<b>{}</b>'.format(name),
            '',
            '该入口已预留，后续可继续配置阈值、开关和触发后的汇报策略。'
        ])
        self.telegram.send_message(chat_id, text, reply_markup=self.warning_keyboard(server_id))

    def show_display_menu(self, chat_id, server_id):
        mode_text = 'srv_id' if self.get_display_mode(chat_id) == 'server_id' else '备注名称'
        self.telegram.send_message(
            chat_id,
            '请选择“编辑服务器”列表里的按钮展示名称：\n当前展示：{}'.format(mode_text),
            reply_markup=self.display_keyboard(server_id)
        )

    def set_display_from_button(self, chat_id, server_id, mode):
        self.set_display_mode(chat_id, mode)
        mode_text = 'srv_id' if mode == 'server_id' else '备注名称'
        self.telegram.send_message(
            chat_id,
            '已设置编辑服务器列表展示：{}'.format(mode_text),
            reply_markup=self.server_keyboard(server_id)
        )

    def set_interval_from_button(self, chat_id, server_id, seconds):
        try:
            seconds = int(seconds)
        except Exception:
            self.telegram.send_message(chat_id, '间隔参数无效。', reply_markup=self.server_keyboard(server_id))
            return
        ok, result = self.store.update_interval(server_id, chat_id, seconds)
        if not ok:
            self.telegram.send_message(chat_id, result, reply_markup=self.list_action_keyboard())
            return
        self.telegram.send_message(chat_id, '已设置 {} 的汇报间隔为 {} 秒。'.format(server_id, result), reply_markup=self.server_keyboard(server_id))

    def cmd_status(self, chat_id, parts):
        if len(parts) != 2:
            self.cmd_list(chat_id)
            return
        self.queue_status(chat_id, parts[1])

    def cmd_interval(self, chat_id, parts):
        if len(parts) == 2:
            self.show_interval_menu(chat_id, parts[1])
            return
        if len(parts) != 3:
            self.cmd_list(chat_id)
            return
        seconds = int(parts[2])
        if seconds < 60:
            self.telegram.send_message(chat_id, '汇报间隔不能小于 60 秒。', reply_markup=self.interval_keyboard(parts[1]))
            return
        ok, result = self.store.update_interval(parts[1], chat_id, seconds)
        if not ok:
            self.telegram.send_message(chat_id, result, reply_markup=self.main_keyboard())
            return
        self.telegram.send_message(chat_id, '已设置 {} 的汇报间隔为 {} 秒。'.format(parts[1], result), reply_markup=self.server_keyboard(parts[1]))

    def cmd_rename(self, chat_id, parts, text):
        if len(parts) < 3:
            self.cmd_list(chat_id)
            return
        server_id = parts[1]
        server_name = text.split(None, 2)[2]
        ok, result = self.store.rename_server(server_id, chat_id, server_name)
        if not ok:
            self.telegram.send_message(chat_id, result, reply_markup=self.main_keyboard())
            return
        self.telegram.send_message(chat_id, '已重命名 {} 为 {}。'.format(server_id, html.escape(str(result))), reply_markup=self.server_keyboard(server_id))

    def cmd_unbind(self, chat_id, parts):
        if len(parts) != 2:
            self.cmd_list(chat_id)
            return
        server_id = parts[1]
        keyboard = {'inline_keyboard': [
            [{'text': '确认解绑', 'callback_data': 'srv:unbind:{}'.format(server_id)}],
            [{'text': '取消', 'callback_data': 'menu:unbind_menu'}]
        ]}
        self.telegram.send_message(chat_id, '确认解绑服务器 {}？'.format(server_id), reply_markup=keyboard)


def make_handler(controller):
    class MonitorRequestHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == '/health':
                json_response(self, 200, {'ok': True})
                return
            json_response(self, 404, {'ok': False, 'error': 'not found'})

        def do_POST(self):
            try:
                payload = read_request_json(self)
                if self.path == '/api/register':
                    json_response(self, 200, controller.handle_register(payload))
                    return
                server = controller.auth_request(self)
                if not server:
                    json_response(self, 401, {'ok': False, 'error': 'unauthorized'})
                    return
                if self.path == '/api/heartbeat':
                    payload['agent_secret'] = self.headers.get('X-Agent-Secret')
                    json_response(self, 200, controller.handle_heartbeat(server, payload))
                elif self.path == '/api/pull_commands':
                    json_response(self, 200, controller.handle_pull_commands(server))
                elif self.path == '/api/report':
                    json_response(self, 200, controller.handle_report(server, payload))
                else:
                    json_response(self, 404, {'ok': False, 'error': 'not found'})
            except Exception as error:
                json_response(self, 500, {'ok': False, 'error': str(error)})

        def log_message(self, fmt, *args):
            write_log('{} - {}'.format(self.address_string(), fmt % args))

    return MonitorRequestHandler


def run_http_server(controller):
    host = controller.config.get('listen_host') or '127.0.0.1'
    port = int(controller.config.get('listen_port') or 8765)
    server = ThreadingHTTPServer((host, port), make_handler(controller))
    write_log('Controller HTTP API listening on {}:{}'.format(host, port))
    server.serve_forever()


def main():
    parser = argparse.ArgumentParser(description='Telegram 多服务器监控 Controller')
    parser.add_argument('--config', default=DEFAULT_CONFIG_PATH)
    parser.add_argument('--init-config', action='store_true')
    parser.add_argument('--init-db', action='store_true')
    parser.add_argument('--once', action='store_true', help='只轮询一次 Telegram 更新')
    parser.add_argument('--pidfile', default=DEFAULT_PID_PATH)
    args = parser.parse_args()

    if args.init_config:
        init_config(args.config)
        return 0

    config = load_config(args.config)
    if args.init_db:
        MonitorStore(config['db_path'])
        write_log('数据库初始化完成：{}'.format(config['db_path']))
        return 0

    if not args.once:
        if not acquire_pidfile(args.pidfile):
            return 0

    controller = MonitorController(config)
    if args.once:
        controller.poll_telegram_once()
        return 0

    thread = threading.Thread(target=run_http_server, args=(controller,))
    thread.daemon = True
    thread.start()
    write_log('Controller Telegram polling started')
    while True:
        try:
            controller.poll_telegram_once()
        except Exception as error:
            write_log('Telegram polling failed: {}'.format(error))
            time.sleep(5)


if __name__ == '__main__':
    sys.exit(main())

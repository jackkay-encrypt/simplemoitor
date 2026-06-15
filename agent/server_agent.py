#!/www/server/panel/pyenv/bin/python3
# coding: utf-8

import argparse
import json
import os
import secrets
import socket
import sys
import time
import traceback
import urllib.parse
import urllib.request
import ssl

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from common.metrics import build_status_payload, get_primary_ip

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

DEFAULT_CONFIG_PATH = os.path.join(BASE_DIR, 'agent', 'config.json')
DEFAULT_LOG_PATH = os.path.join(BASE_DIR, 'runtime', 'agent.log')


def write_log(message):
    line = '[{}] {}\n'.format(time.strftime('%Y-%m-%d %H:%M:%S'), message)
    try:
        log_dir = os.path.dirname(DEFAULT_LOG_PATH)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir)
        with open(DEFAULT_LOG_PATH, 'a', encoding='utf-8') as fp:
            fp.write(line)
    except Exception:
        pass
    print(line, end='')


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


def make_server_id():
    return 'srv_{}'.format(secrets.token_hex(4))


def make_bind_code():
    return str(secrets.randbelow(900000) + 100000)


def get_default_bind_host(controller_url):
    parsed = urllib.parse.urlparse(controller_url or '')
    host = parsed.hostname or ''
    if host and host not in ('127.0.0.1', 'localhost'):
        return host
    return get_primary_ip()


def get_default_bind_port(controller_url):
    parsed = urllib.parse.urlparse(controller_url or '')
    if parsed.port:
        return str(parsed.port)
    if parsed.scheme == 'https':
        return '443'
    if parsed.scheme == 'http':
        return '80'
    return '8765'


def normalize_bind_port(value):
    port = str(value or '').strip()
    if not port.isdigit():
        raise ValueError('绑定端口必须是数字')
    port_number = int(port)
    if port_number < 1 or port_number > 65535:
        raise ValueError('绑定端口必须在 1-65535 之间')
    return str(port_number)


def init_config(path, controller_url=None, server_name=None, bind_ip=None, bind_port=None, show_bind_info=True):
    if os.path.exists(path):
        config = load_json(path)
    else:
        config = {}
    changed = False
    if not config.get('server_id'):
        config['server_id'] = make_server_id()
        changed = True
    if not config.get('bind_code'):
        config['bind_code'] = make_bind_code()
        changed = True
    if not config.get('agent_secret'):
        config['agent_secret'] = secrets.token_urlsafe(32)
        changed = True
    if controller_url:
        config['controller_url'] = controller_url.rstrip('/')
        changed = True
    config.setdefault('controller_url', 'http://127.0.0.1:8765')
    if bind_ip:
        config['bind_ip'] = str(bind_ip).strip()
        changed = True
    if bind_port:
        config['bind_port'] = normalize_bind_port(bind_port)
        changed = True
    if not config.get('bind_ip'):
        config['bind_ip'] = get_default_bind_host(config.get('controller_url'))
        changed = True
    if not config.get('bind_port'):
        config['bind_port'] = get_default_bind_port(config.get('controller_url'))
        changed = True
    config.setdefault('server_name', server_name or socket.gethostname())
    config.setdefault('report_interval', 300)
    config.setdefault('poll_interval', 60)
    config.setdefault('last_report_at', 0)
    if changed or not os.path.exists(path):
        save_json(path, config)
    if show_bind_info:
        print_bind_info(config)
    return config


def print_bind_info(config):
    print('bind_ip: {}'.format(config.get('bind_ip')))
    print('bind_port: {}'.format(config.get('bind_port')))
    print('server_id: {}'.format(config.get('server_id')))
    print('bind_code: {}'.format(config.get('bind_code')))
    print('Telegram 绑定命令: /bind {} {} {} {}'.format(config.get('bind_ip'), config.get('bind_port'), config.get('server_id'), config.get('bind_code')))


def print_server_id_info(config):
    print('bind_ip: {}'.format(config.get('bind_ip')))
    print('bind_port: {}'.format(config.get('bind_port')))
    print('srv_id: {}'.format(config.get('server_id')))
    print('bind_code: {}'.format(config.get('bind_code')))
    print('Telegram 绑定输入: {} {} {} {}'.format(config.get('bind_ip'), config.get('bind_port'), config.get('server_id'), config.get('bind_code')))


def api_request(config, path, payload=None, auth=True, timeout=20):
    url = config['controller_url'].rstrip('/') + path
    data = json.dumps(payload or {}, ensure_ascii=False).encode('utf-8')
    headers = {'Content-Type': 'application/json'}
    if auth:
        headers['X-Server-Id'] = str(config.get('server_id'))
        headers['X-Agent-Secret'] = str(config.get('agent_secret'))
    request = urllib.request.Request(url, data=data, headers=headers, method='POST')
    with urllib.request.urlopen(request, timeout=timeout, context=_SSL_CTX) as response:
        body = response.read().decode('utf-8')
    result = json.loads(body)
    if not result.get('ok'):
        raise RuntimeError(result.get('error') or result.get('message') or body)
    return result


def register(config):
    payload = {
        'server_id': config['server_id'],
        'bind_code': config['bind_code'],
        'bind_ip': config.get('bind_ip'),
        'bind_port': config.get('bind_port'),
        'agent_secret': config['agent_secret'],
        'server_name': config.get('server_name'),
        'report_interval': int(config.get('report_interval') if config.get('report_interval') is not None else 300),
        'metrics': build_status_payload()
    }
    result = api_request(config, '/api/register', payload, auth=False)
    write_log('注册/同步成功：{}'.format(result.get('message')))
    return result


def heartbeat(config, config_path=DEFAULT_CONFIG_PATH):
    payload = {'metrics': build_status_payload()}
    result = api_request(config, '/api/heartbeat', payload)
    apply_server_config(config, result, config_path)
    return result


def pull_commands(config, config_path=DEFAULT_CONFIG_PATH):
    result = api_request(config, '/api/pull_commands', {})
    apply_server_config(config, result, config_path)
    return result.get('commands') or []


def report(config, reason='scheduled'):
    payload = {
        'reason': reason,
        'metrics': build_status_payload()
    }
    result = api_request(config, '/api/report', payload)
    write_log('状态上报完成，sent={}'.format(result.get('sent')))
    return result


def apply_server_config(config, result, config_path=DEFAULT_CONFIG_PATH):
    changed = False
    if result.get('server_name') and result.get('server_name') != config.get('server_name'):
        config['server_name'] = result.get('server_name')
        changed = True
    if 'report_interval' in result and result.get('report_interval') is not None and int(result.get('report_interval')) != int(config.get('report_interval') if config.get('report_interval') is not None else 300):
        config['report_interval'] = int(result.get('report_interval'))
        changed = True
    if 'bound' in result and bool(result.get('bound')) != bool(config.get('bound')):
        config['bound'] = bool(result.get('bound'))
        changed = True
    if changed:
        save_json(config_path, config)


def handle_commands(config, commands, config_path=DEFAULT_CONFIG_PATH):
    should_save = False
    for item in commands:
        command = item.get('command')
        payload = item.get('payload') or {}
        if command == 'report_now':
            if not config.get('bound'):
                write_log('服务器未绑定 Telegram，忽略手动状态刷新请求')
                continue
            report(config, reason=payload.get('reason') or 'manual')
        elif command == 'set_interval':
            if 'report_interval' in payload and payload.get('report_interval') is not None:
                config['report_interval'] = int(payload.get('report_interval'))
            else:
                config['report_interval'] = int(config.get('report_interval') or 300)
            should_save = True
            write_log('已更新汇报间隔：{} 秒'.format(config['report_interval']))
        elif command == 'rename':
            config['server_name'] = payload.get('server_name') or config.get('server_name')
            should_save = True
            write_log('已更新服务器名称：{}'.format(config['server_name']))
    if should_save:
        save_json(config_path, config)


def run_once(config_path):
    config = init_config(config_path, show_bind_info=False)
    register(config)
    heartbeat(config, config_path)
    commands = pull_commands(config, config_path)
    handle_commands(config, commands, config_path)
    now = int(time.time())
    report_interval = int(config.get('report_interval') if config.get('report_interval') is not None else 300)
    last_report_at = int(config.get('last_report_at') or 0)
    if not config.get('bound'):
        write_log('服务器未绑定 Telegram，跳过定时状态汇报')
        return True
    if report_interval == 0:
        write_log('定时状态汇报已关闭')
        return True
    report_interval = max(report_interval, 60)
    if now - last_report_at >= report_interval:
        report(config, reason='scheduled')
        config['last_report_at'] = now
        save_json(config_path, config)
    return True


def run_daemon(config_path):
    config = init_config(config_path, show_bind_info=False)
    poll_interval = max(int(config.get('poll_interval') or 60), 10)
    write_log('Agent 常驻运行，轮询间隔 {} 秒'.format(poll_interval))
    while True:
        try:
            run_once(config_path)
        except Exception as error:
            write_log('执行失败：{}\n{}'.format(error, traceback.format_exc()))
        time.sleep(poll_interval)


def main():
    parser = argparse.ArgumentParser(description='多服务器 Telegram 监控 Agent')
    parser.add_argument('command', nargs='?', choices=['id', 'bind-info'], help='id: 显示 srv_id 和绑定码；bind-info: 显示完整绑定信息')
    parser.add_argument('--config', default=DEFAULT_CONFIG_PATH)
    parser.add_argument('--init-config', action='store_true')
    parser.add_argument('--controller-url', default=None)
    parser.add_argument('--server-name', default=None)
    parser.add_argument('--bind-ip', default=None)
    parser.add_argument('--bind-port', default=None)
    parser.add_argument('--print-bind', action='store_true')
    parser.add_argument('--show-id', action='store_true')
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--daemon', action='store_true')
    args = parser.parse_args()

    if args.init_config:
        init_config(args.config, controller_url=args.controller_url, server_name=args.server_name, bind_ip=args.bind_ip, bind_port=args.bind_port, show_bind_info=True)
        return 0
    if args.print_bind or args.command == 'bind-info':
        print_bind_info(init_config(args.config, show_bind_info=False))
        return 0
    if args.show_id or args.command == 'id':
        print_server_id_info(init_config(args.config, show_bind_info=False))
        return 0
    try:
        if args.daemon:
            run_daemon(args.config)
        else:
            run_once(args.config)
        return 0
    except Exception as error:
        write_log('执行失败：{}\n{}'.format(error, traceback.format_exc()))
        return 1


if __name__ == '__main__':
    sys.exit(main())

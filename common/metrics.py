# coding: utf-8

APP_NAME = 'SimpleMoitor'
APP_VERSION = 'v1.0'

import datetime
import html
import os
import socket
import time

try:
    import psutil
except Exception:
    psutil = None


def read_meminfo():
    result = {}
    try:
        with open('/proc/meminfo', 'r', encoding='utf-8') as fp:
            for line in fp:
                parts = line.split(':', 1)
                if len(parts) != 2:
                    continue
                key = parts[0]
                value = parts[1].strip().split()[0]
                result[key] = int(value) * 1024
    except Exception:
        pass
    return result


def format_bytes(size):
    value = float(size or 0)
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if value < 1024 or unit == 'TB':
            if unit == 'B':
                return '{} {}'.format(int(value), unit)
            return '{:.2f} {}'.format(value, unit)
        value = value / 1024


def get_memory_info():
    if psutil:
        memory = psutil.virtual_memory()
        return {
            'total': int(memory.total),
            'used': int(memory.used),
            'available': int(memory.available),
            'percent': float(memory.percent)
        }

    meminfo = read_meminfo()
    total = meminfo.get('MemTotal', 0)
    available = meminfo.get('MemAvailable', meminfo.get('MemFree', 0))
    used = max(total - available, 0)
    percent = round((used / total) * 100, 2) if total else 0
    return {
        'total': total,
        'used': used,
        'available': available,
        'percent': percent
    }


def get_cpu_percent(interval=1):
    if psutil:
        return float(psutil.cpu_percent(interval=interval))

    def read_cpu_stat():
        with open('/proc/stat', 'r', encoding='utf-8') as fp:
            values = fp.readline().split()[1:]
        values = [int(x) for x in values]
        idle = values[3] + (values[4] if len(values) > 4 else 0)
        total = sum(values)
        return idle, total

    idle_1, total_1 = read_cpu_stat()
    time.sleep(interval)
    idle_2, total_2 = read_cpu_stat()
    idle_delta = idle_2 - idle_1
    total_delta = total_2 - total_1
    if total_delta <= 0:
        return 0.0
    return round((1 - idle_delta / total_delta) * 100, 2)


def get_loadavg():
    load_1, load_5, load_15 = os.getloadavg()
    return {
        'load_1': load_1,
        'load_5': load_5,
        'load_15': load_15
    }


def get_primary_ip():
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(('8.8.8.8', 80))
        return sock.getsockname()[0]
    except Exception:
        return '127.0.0.1'
    finally:
        if sock:
            sock.close()


def get_uptime():
    try:
        with open('/proc/uptime', 'r', encoding='utf-8') as fp:
            seconds = int(float(fp.readline().split()[0]))
    except Exception:
        return '未知'

    days = seconds // 86400
    hours = (seconds % 86400) // 3600
    minutes = (seconds % 3600) // 60
    if days:
        return '{}天{}小时{}分钟'.format(days, hours, minutes)
    if hours:
        return '{}小时{}分钟'.format(hours, minutes)
    return '{}分钟'.format(minutes)


def build_status_payload():
    load = get_loadavg()
    memory = get_memory_info()
    payload = {
        'hostname': socket.gethostname(),
        'ip': get_primary_ip(),
        'time': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'cpu_percent': get_cpu_percent(),
        'cpu_count': os.cpu_count() or 1,
        'memory': memory,
        'uptime': get_uptime()
    }
    payload.update(load)
    return payload


def build_text_report(server, metrics, reason='scheduled'):
    server_name = html.escape(str(server.get('server_name') or metrics.get('hostname') or server.get('server_id')))
    server_id = html.escape(str(server.get('server_id') or ''))
    reason_text = '手动查询' if reason == 'manual' else '定时汇报'
    lines = [
        '<b>服务器状态汇报</b>',
        '',
        '<b>服务器：</b>{} ({})'.format(server_name, server_id),
        '<b>类型：</b>{}'.format(reason_text),
        '<b>主机：</b>{}'.format(html.escape(str(metrics.get('hostname', '未知')))),
        '<b>IP：</b>{}'.format(html.escape(str(metrics.get('ip', '未知')))),
        '<b>时间：</b>{}'.format(html.escape(str(metrics.get('time', '未知')))),
        '<b>运行时长：</b>{}'.format(html.escape(str(metrics.get('uptime', '未知')))),
        '',
        '<b>CPU：</b>{:.1f}%（{} 核）'.format(float(metrics.get('cpu_percent', 0)), int(metrics.get('cpu_count', 1))),
        '<b>负载：</b>{:.2f} / {:.2f} / {:.2f}'.format(
            float(metrics.get('load_1', 0)),
            float(metrics.get('load_5', 0)),
            float(metrics.get('load_15', 0))
        ),
        '<b>内存：</b>{:.1f}%（已用 {} / 总计 {}，可用 {}）'.format(
            float(metrics.get('memory', {}).get('percent', 0)),
            format_bytes(metrics.get('memory', {}).get('used', 0)),
            format_bytes(metrics.get('memory', {}).get('total', 0)),
            format_bytes(metrics.get('memory', {}).get('available', 0))
        )
    ]
    return '\n'.join(lines)

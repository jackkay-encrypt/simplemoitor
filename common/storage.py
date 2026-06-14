# coding: utf-8

import hashlib
import json
import os
import sqlite3
import time


def now_ts():
    return int(time.time())


def hash_secret(value):
    value = str(value or '').encode('utf-8')
    return hashlib.sha256(value).hexdigest()


class MonitorStore(object):
    def __init__(self, db_path):
        self.db_path = db_path
        db_dir = os.path.dirname(db_path)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir)
        self.init_db()

    def connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self):
        conn = self.connect()
        try:
            conn.executescript('''
CREATE TABLE IF NOT EXISTS servers (
    server_id TEXT PRIMARY KEY,
    server_name TEXT,
    chat_id TEXT,
    bind_code_hash TEXT,
    agent_secret_hash TEXT NOT NULL,
    report_interval INTEGER NOT NULL DEFAULT 300,
    last_seen INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    bound_at INTEGER,
    status_json TEXT
);
CREATE TABLE IF NOT EXISTS commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    command TEXT NOT NULL,
    payload TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    consumed_at INTEGER
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
''')
            conn.commit()
        finally:
            conn.close()

    def get_setting(self, key, default=None):
        conn = self.connect()
        try:
            row = conn.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
            return row['value'] if row else default
        finally:
            conn.close()

    def set_setting(self, key, value):
        conn = self.connect()
        try:
            conn.execute('REPLACE INTO settings(key,value) VALUES(?,?)', (key, str(value)))
            conn.commit()
        finally:
            conn.close()

    def register_server(self, server_id, server_name, bind_code, agent_secret, report_interval=300, status=None):
        ts = now_ts()
        bind_code_hash = hash_secret(bind_code)
        agent_secret_hash = hash_secret(agent_secret)
        status_json = json.dumps(status or {}, ensure_ascii=False)
        conn = self.connect()
        try:
            row = conn.execute('SELECT * FROM servers WHERE server_id=?', (server_id,)).fetchone()
            if row:
                if row['agent_secret_hash'] != agent_secret_hash:
                    return False, 'server_id 已存在且密钥不匹配'
                conn.execute('''
UPDATE servers SET server_name=?, report_interval=?, last_seen=?, updated_at=?, status_json=?
WHERE server_id=?
''', (server_name, int(report_interval), ts, ts, status_json, server_id))
            else:
                conn.execute('''
INSERT INTO servers(server_id, server_name, chat_id, bind_code_hash, agent_secret_hash, report_interval, last_seen, created_at, updated_at, bound_at, status_json)
VALUES(?,?,?,?,?,?,?,?,?,?,?)
''', (server_id, server_name, None, bind_code_hash, agent_secret_hash, int(report_interval), ts, ts, ts, None, status_json))
            conn.commit()
            return True, 'ok'
        finally:
            conn.close()

    def auth_server(self, server_id, agent_secret):
        conn = self.connect()
        try:
            row = conn.execute('SELECT * FROM servers WHERE server_id=?', (server_id,)).fetchone()
            if not row:
                return None
            if row['agent_secret_hash'] != hash_secret(agent_secret):
                return None
            return dict(row)
        finally:
            conn.close()

    def bind_server(self, server_id, bind_code, chat_id):
        conn = self.connect()
        try:
            row = conn.execute('SELECT * FROM servers WHERE server_id=?', (server_id,)).fetchone()
            if not row:
                return False, '未找到该服务器，请确认 Agent 已启动注册。'
            if row['chat_id']:
                return False, '该服务器已经绑定。'
            if row['bind_code_hash'] != hash_secret(bind_code):
                return False, '绑定码错误。'
            ts = now_ts()
            conn.execute('UPDATE servers SET chat_id=?, bind_code_hash=NULL, bound_at=?, updated_at=? WHERE server_id=?',
                         (str(chat_id), ts, ts, server_id))
            conn.commit()
            return True, dict(row)
        finally:
            conn.close()

    def unbind_server(self, server_id, chat_id):
        conn = self.connect()
        try:
            row = conn.execute('SELECT * FROM servers WHERE server_id=? AND chat_id=?', (server_id, str(chat_id))).fetchone()
            if not row:
                return False, '未找到已绑定的服务器。'
            conn.execute('UPDATE servers SET chat_id=NULL, bound_at=NULL, updated_at=? WHERE server_id=?', (now_ts(), server_id))
            conn.execute('UPDATE commands SET status=?, consumed_at=? WHERE server_id=? AND status=?',
                         ('cancelled', now_ts(), server_id, 'pending'))
            conn.commit()
            return True, 'ok'
        finally:
            conn.close()

    def list_servers(self, chat_id):
        conn = self.connect()
        try:
            rows = conn.execute('SELECT * FROM servers WHERE chat_id=? ORDER BY created_at ASC', (str(chat_id),)).fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def get_bound_server(self, server_id, chat_id=None):
        conn = self.connect()
        try:
            if chat_id is None:
                row = conn.execute('SELECT * FROM servers WHERE server_id=? AND chat_id IS NOT NULL', (server_id,)).fetchone()
            else:
                row = conn.execute('SELECT * FROM servers WHERE server_id=? AND chat_id=?', (server_id, str(chat_id))).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    def update_interval(self, server_id, chat_id, seconds):
        seconds = max(int(seconds), 60)
        server = self.get_bound_server(server_id, chat_id)
        if not server:
            return False, '未找到已绑定的服务器。'
        conn = self.connect()
        try:
            conn.execute('UPDATE servers SET report_interval=?, updated_at=? WHERE server_id=?', (seconds, now_ts(), server_id))
            conn.commit()
        finally:
            conn.close()
        self.enqueue_command(server_id, 'set_interval', {'report_interval': seconds})
        return True, seconds

    def rename_server(self, server_id, chat_id, server_name):
        server_name = str(server_name or '').strip()
        if not server_name:
            return False, '服务器名称不能为空。'
        server = self.get_bound_server(server_id, chat_id)
        if not server:
            return False, '未找到已绑定的服务器。'
        conn = self.connect()
        try:
            conn.execute('UPDATE servers SET server_name=?, updated_at=? WHERE server_id=?', (server_name, now_ts(), server_id))
            conn.commit()
        finally:
            conn.close()
        self.enqueue_command(server_id, 'rename', {'server_name': server_name})
        return True, server_name

    def enqueue_command(self, server_id, command, payload=None):
        conn = self.connect()
        try:
            conn.execute('INSERT INTO commands(server_id, command, payload, status, created_at) VALUES(?,?,?,?,?)',
                         (server_id, command, json.dumps(payload or {}, ensure_ascii=False), 'pending', now_ts()))
            conn.commit()
        finally:
            conn.close()

    def consume_commands(self, server_id, limit=20):
        conn = self.connect()
        try:
            rows = conn.execute('SELECT * FROM commands WHERE server_id=? AND status=? ORDER BY id ASC LIMIT ?',
                                (server_id, 'pending', int(limit))).fetchall()
            ids = [row['id'] for row in rows]
            if ids:
                placeholders = ','.join(['?'] * len(ids))
                conn.execute('UPDATE commands SET status=?, consumed_at=? WHERE id IN ({})'.format(placeholders),
                             tuple(['consumed', now_ts()] + ids))
                conn.commit()
            result = []
            for row in rows:
                item = dict(row)
                try:
                    item['payload'] = json.loads(item.get('payload') or '{}')
                except Exception:
                    item['payload'] = {}
                result.append(item)
            return result
        finally:
            conn.close()

    def update_heartbeat(self, server_id, metrics=None):
        conn = self.connect()
        try:
            conn.execute('UPDATE servers SET last_seen=?, updated_at=?, status_json=? WHERE server_id=?',
                         (now_ts(), now_ts(), json.dumps(metrics or {}, ensure_ascii=False), server_id))
            conn.commit()
        finally:
            conn.close()

    def update_report(self, server_id, metrics):
        self.update_heartbeat(server_id, metrics)
        return self.get_bound_server(server_id)

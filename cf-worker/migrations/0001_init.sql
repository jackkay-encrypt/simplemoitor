-- D1 Database Schema for simplemoitor
-- Compatible with Cloudflare D1 (SQLite)

CREATE TABLE IF NOT EXISTS servers (
    server_id TEXT PRIMARY KEY,
    server_name TEXT,
    chat_id TEXT,
    bind_code_hash TEXT,
    bind_ip TEXT,
    bind_port TEXT,
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

CREATE TABLE IF NOT EXISTS feedback_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    content TEXT NOT NULL,
    reply TEXT,
    status TEXT NOT NULL DEFAULT 'unread',
    created_at INTEGER NOT NULL,
    replied_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_servers_chat_id ON servers(chat_id);
CREATE INDEX IF NOT EXISTS idx_commands_server_status ON commands(server_id, status);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback_messages(status);

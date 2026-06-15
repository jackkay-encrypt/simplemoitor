-- VIP Membership System

CREATE TABLE IF NOT EXISTS vip_members (
    chat_id TEXT PRIMARY KEY,
    username TEXT,
    expire_at INTEGER NOT NULL,
    activated_at INTEGER NOT NULL,
    total_paid REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vip_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    order_id TEXT NOT NULL UNIQUE,
    amount_usd REAL NOT NULL,
    amount_unique REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    tx_hash TEXT,
    created_at INTEGER NOT NULL,
    paid_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_vip_orders_status ON vip_orders(status);
CREATE INDEX IF NOT EXISTS idx_vip_orders_unique ON vip_orders(amount_unique);
CREATE INDEX IF NOT EXISTS idx_vip_members_expire ON vip_members(expire_at);

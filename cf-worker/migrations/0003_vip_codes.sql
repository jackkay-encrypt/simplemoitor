-- VIP Redemption Codes

CREATE TABLE IF NOT EXISTS vip_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    days INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'unused',
    created_by TEXT,
    used_by TEXT,
    created_at INTEGER NOT NULL,
    used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_vip_codes_status ON vip_codes(status);
CREATE INDEX IF NOT EXISTS idx_vip_codes_code ON vip_codes(code);

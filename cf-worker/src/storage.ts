// Storage Layer using Cloudflare D1

export function nowTs(): number {
  return Math.floor(Date.now() / 1000);
}

export async function hashSecret(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value || '');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface ServerRow {
  server_id: string;
  server_name: string | null;
  chat_id: string | null;
  bind_code_hash: string | null;
  bind_ip: string | null;
  bind_port: string | null;
  agent_secret_hash: string;
  report_interval: number;
  last_seen: number | null;
  created_at: number;
  updated_at: number;
  bound_at: number | null;
  status_json: string | null;
}

export interface CommandRow {
  id: number;
  server_id: string;
  command: string;
  payload: string | null;
  status: string;
  created_at: number;
  consumed_at: number | null;
}

export interface FeedbackRow {
  id: number;
  chat_id: string;
  content: string;
  reply: string | null;
  status: string;
  created_at: number;
  replied_at: number | null;
}

export class MonitorStore {
  constructor(private db: D1Database) {}

  async getSetting(key: string, defaultValue?: string): Promise<string | undefined> {
    const row = await this.db.prepare('SELECT value FROM settings WHERE key=?').bind(key).first<{ value: string }>();
    return row?.value ?? defaultValue;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').bind(key, value).run();
  }

  async registerServer(
    serverId: string, serverName: string, bindCode: string, agentSecret: string,
    reportInterval = 300, status: any = {}, bindIp?: string, bindPort?: string
  ): Promise<[boolean, string]> {
    const ts = nowTs();
    const bindCodeHash = await hashSecret(bindCode);
    const agentSecretHash = await hashSecret(agentSecret);
    const statusJson = JSON.stringify(status || {});
    const ip = (bindIp || '').trim();
    const port = (bindPort || '').trim();

    const row = await this.db.prepare('SELECT * FROM servers WHERE server_id=?').bind(serverId).first<ServerRow>();
    if (row) {
      if (row.agent_secret_hash !== agentSecretHash) {
        return [false, 'server_id 已存在且密钥不匹配'];
      }
      if (row.chat_id) {
        await this.db.prepare(
          'UPDATE servers SET server_name=?, bind_ip=?, bind_port=?, last_seen=?, updated_at=?, status_json=? WHERE server_id=?'
        ).bind(serverName, ip, port, ts, ts, statusJson, serverId).run();
      } else {
        await this.db.prepare(
          'UPDATE servers SET server_name=?, bind_code_hash=?, bind_ip=?, bind_port=?, report_interval=?, last_seen=?, updated_at=?, status_json=? WHERE server_id=?'
        ).bind(serverName, bindCodeHash, ip, port, reportInterval, ts, ts, statusJson, serverId).run();
      }
    } else {
      await this.db.prepare(
        `INSERT INTO servers(server_id, server_name, chat_id, bind_code_hash, bind_ip, bind_port, agent_secret_hash, report_interval, last_seen, created_at, updated_at, bound_at, status_json)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(serverId, serverName, null, bindCodeHash, ip, port, agentSecretHash, reportInterval, ts, ts, ts, null, statusJson).run();
    }
    return [true, 'ok'];
  }

  async authServer(serverId: string, agentSecret: string): Promise<ServerRow | null> {
    const row = await this.db.prepare('SELECT * FROM servers WHERE server_id=?').bind(serverId).first<ServerRow>();
    if (!row) return null;
    const secretHash = await hashSecret(agentSecret);
    if (row.agent_secret_hash !== secretHash) return null;
    return row;
  }

  async bindServer(serverId: string, bindCode: string, chatId: string): Promise<[boolean, string | ServerRow]> {
    const row = await this.db.prepare('SELECT * FROM servers WHERE server_id=?').bind(serverId).first<ServerRow>();
    if (!row) return [false, '未找到该服务器，请确认 Agent 已启动注册。'];
    if (row.chat_id) return [false, '该服务器已经绑定。'];
    const codeHash = await hashSecret(bindCode);
    if (row.bind_code_hash !== codeHash) return [false, '绑定码错误。'];
    const ts = nowTs();
    await this.db.prepare('UPDATE servers SET chat_id=?, bind_code_hash=NULL, bound_at=?, updated_at=? WHERE server_id=?')
      .bind(String(chatId), ts, ts, serverId).run();
    return [true, row];
  }

  async unbindServer(serverId: string, chatId: string): Promise<[boolean, string]> {
    const row = await this.db.prepare('SELECT * FROM servers WHERE server_id=? AND chat_id=?')
      .bind(serverId, String(chatId)).first<ServerRow>();
    if (!row) return [false, '未找到已绑定的服务器。'];
    const ts = nowTs();
    await this.db.prepare('UPDATE servers SET chat_id=NULL, bound_at=NULL, updated_at=? WHERE server_id=?')
      .bind(ts, serverId).run();
    await this.db.prepare("UPDATE commands SET status=?, consumed_at=? WHERE server_id=? AND status=?")
      .bind('cancelled', ts, serverId, 'pending').run();
    return [true, 'ok'];
  }

  async listServers(chatId: string): Promise<ServerRow[]> {
    const result = await this.db.prepare('SELECT * FROM servers WHERE chat_id=? ORDER BY created_at ASC')
      .bind(String(chatId)).all<ServerRow>();
    return result.results;
  }

  async getBoundServer(serverId: string, chatId?: string | null): Promise<ServerRow | null> {
    if (chatId === undefined || chatId === null) {
      return await this.db.prepare('SELECT * FROM servers WHERE server_id=? AND chat_id IS NOT NULL')
        .bind(serverId).first<ServerRow>();
    }
    return await this.db.prepare('SELECT * FROM servers WHERE server_id=? AND chat_id=?')
      .bind(serverId, String(chatId)).first<ServerRow>();
  }

  async updateInterval(serverId: string, chatId: string, seconds: number): Promise<[boolean, string | number]> {
    seconds = Math.floor(seconds);
    if (seconds < 0 || (seconds > 0 && seconds < 60)) {
      return [false, '汇报间隔必须为 0（关闭定时汇报）或不少于 60 秒。'];
    }
    const server = await this.getBoundServer(serverId, chatId);
    if (!server) return [false, '未找到已绑定的服务器。'];
    await this.db.prepare('UPDATE servers SET report_interval=?, updated_at=? WHERE server_id=?')
      .bind(seconds, nowTs(), serverId).run();
    await this.enqueueCommand(serverId, 'set_interval', { report_interval: seconds });
    return [true, seconds];
  }

  async renameServer(serverId: string, chatId: string, serverName: string): Promise<[boolean, string]> {
    const name = (serverName || '').trim();
    if (!name) return [false, '服务器名称不能为空。'];
    const server = await this.getBoundServer(serverId, chatId);
    if (!server) return [false, '未找到已绑定的服务器。'];
    await this.db.prepare('UPDATE servers SET server_name=?, updated_at=? WHERE server_id=?')
      .bind(name, nowTs(), serverId).run();
    await this.enqueueCommand(serverId, 'rename', { server_name: name });
    return [true, name];
  }

  async enqueueCommand(serverId: string, command: string, payload: any = {}): Promise<void> {
    await this.db.prepare('INSERT INTO commands(server_id, command, payload, status, created_at) VALUES(?,?,?,?,?)')
      .bind(serverId, command, JSON.stringify(payload), 'pending', nowTs()).run();
  }

  async consumeCommands(serverId: string, limit = 20): Promise<CommandRow[]> {
    const rows = await this.db.prepare('SELECT * FROM commands WHERE server_id=? AND status=? ORDER BY id ASC LIMIT ?')
      .bind(serverId, 'pending', limit).all<CommandRow>();
    const ids = rows.results.map(r => r.id);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      await this.db.prepare(`UPDATE commands SET status=?, consumed_at=? WHERE id IN (${placeholders})`)
        .bind('consumed', nowTs(), ...ids).run();
    }
    return rows.results.map(r => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : {} }));
  }

  async updateHeartbeat(serverId: string, metrics: any = {}): Promise<void> {
    await this.db.prepare('UPDATE servers SET last_seen=?, updated_at=?, status_json=? WHERE server_id=?')
      .bind(nowTs(), nowTs(), JSON.stringify(metrics), serverId).run();
  }

  async updateReport(serverId: string, metrics: any): Promise<ServerRow | null> {
    await this.updateHeartbeat(serverId, metrics);
    return await this.getBoundServer(serverId);
  }

  async addFeedbackMessage(chatId: string, content: string): Promise<number> {
    const ts = nowTs();
    const result = await this.db.prepare('INSERT INTO feedback_messages(chat_id, content, status, created_at) VALUES(?,?,?,?)')
      .bind(String(chatId), (content || '').trim(), 'unread', ts).run();
    return result.meta.last_row_id as number;
  }

  async feedbackCount(status?: string): Promise<number> {
    if (status) {
      const row = await this.db.prepare('SELECT COUNT(*) AS count FROM feedback_messages WHERE status=?')
        .bind(status).first<{ count: number }>();
      return row?.count || 0;
    }
    const row = await this.db.prepare('SELECT COUNT(*) AS count FROM feedback_messages').first<{ count: number }>();
    return row?.count || 0;
  }

  async feedbackUserCount(status?: string): Promise<number> {
    if (status) {
      const row = await this.db.prepare('SELECT COUNT(DISTINCT chat_id) AS count FROM feedback_messages WHERE status=?')
        .bind(status).first<{ count: number }>();
      return row?.count || 0;
    }
    const row = await this.db.prepare('SELECT COUNT(DISTINCT chat_id) AS count FROM feedback_messages').first<{ count: number }>();
    return row?.count || 0;
  }

  async listFeedbackMessages(status?: string, limit = 10): Promise<FeedbackRow[]> {
    if (status) {
      const result = await this.db.prepare('SELECT * FROM feedback_messages WHERE status=? ORDER BY created_at ASC LIMIT ?')
        .bind(status, limit).all<FeedbackRow>();
      return result.results;
    }
    const result = await this.db.prepare('SELECT * FROM feedback_messages ORDER BY created_at DESC LIMIT ?')
      .bind(limit).all<FeedbackRow>();
    return result.results;
  }

  async getFeedbackMessage(messageId: number): Promise<FeedbackRow | null> {
    return await this.db.prepare('SELECT * FROM feedback_messages WHERE id=?')
      .bind(messageId).first<FeedbackRow>();
  }

  async markFeedbackReplied(messageId: number, reply: string): Promise<void> {
    await this.db.prepare('UPDATE feedback_messages SET reply=?, status=?, replied_at=? WHERE id=?')
      .bind((reply || '').trim(), 'replied', nowTs(), messageId).run();
  }

  // ── VIP Membership ──

  async getVipPrice(): Promise<number> {
    const v = await this.getSetting('vip_price', '9');
    return parseFloat(v || '9');
  }
  async setVipPrice(price: number): Promise<void> { await this.setSetting('vip_price', String(price)); }

  async getVipWallet(): Promise<string> { return (await this.getSetting('vip_wallet_address', '')) || ''; }
  async setVipWallet(addr: string): Promise<void> { await this.setSetting('vip_wallet_address', addr.trim()); }

  async getVipLastBlock(): Promise<number> {
    const v = await this.getSetting('vip_last_block', '0');
    return parseInt(v || '0');
  }
  async setVipLastBlock(block: number): Promise<void> { await this.setSetting('vip_last_block', String(block)); }

  async createOrder(chatId: string, basePrice: number): Promise<{ orderId: string; amountUnique: number }> {
    const ts = nowTs();
    const orderId = `vip_${ts}_${Math.random().toString(36).slice(2, 8)}`;
    // Add random tail to make amount unique: e.g. 9.0017, 9.0023
    const tail = Math.floor(Math.random() * 99 + 1) / 10000; // 0.0001 ~ 0.0099
    const amountUnique = Math.round((basePrice + tail) * 10000) / 10000;
    await this.db.prepare(
      'INSERT INTO vip_orders(chat_id, order_id, amount_usd, amount_unique, status, created_at) VALUES(?,?,?,?,?,?)'
    ).bind(chatId, orderId, basePrice, amountUnique, 'pending', ts).run();
    return { orderId, amountUnique };
  }

  async getPendingOrders(): Promise<Array<{ order_id: string; amount_unique: number; chat_id: string }>> {
    const result = await this.db.prepare(
      "SELECT order_id, amount_unique, chat_id FROM vip_orders WHERE status='pending' AND created_at > ?"
    ).bind(nowTs() - 3600).all<{ order_id: string; amount_unique: number; chat_id: string }>();
    return result.results;
  }

  async completeOrder(orderId: string, txHash: string): Promise<void> {
    await this.db.prepare("UPDATE vip_orders SET status='paid', tx_hash=?, paid_at=? WHERE order_id=?")
      .bind(txHash, nowTs(), orderId).run();
  }

  async getOrder(orderId: string): Promise<any> {
    return await this.db.prepare('SELECT * FROM vip_orders WHERE order_id=?').bind(orderId).first();
  }

  async activateVip(chatId: string, days = 30, amountPaid = 0, username?: string): Promise<number> {
    const ts = nowTs();
    const existing = await this.db.prepare('SELECT * FROM vip_members WHERE chat_id=?').bind(chatId).first<{ expire_at: number }>();
    const baseTime = (existing && existing.expire_at > ts) ? existing.expire_at : ts;
    const expireAt = baseTime + days * 86400;
    const totalPaid = (existing ? Number((existing as any).total_paid || 0) : 0) + amountPaid;
    await this.db.prepare(
      'INSERT INTO vip_members(chat_id, username, expire_at, activated_at, total_paid) VALUES(?,?,?,?,?) '
      + 'ON CONFLICT(chat_id) DO UPDATE SET username=COALESCE(excluded.username, vip_members.username), '
      + 'expire_at=excluded.expire_at, activated_at=excluded.activated_at, total_paid=excluded.total_paid'
    ).bind(chatId, username || null, expireAt, ts, totalPaid).run();
    return expireAt;
  }

  async isVipActive(chatId: string): Promise<boolean> {
    const row = await this.db.prepare('SELECT expire_at FROM vip_members WHERE chat_id=?').bind(chatId).first<{ expire_at: number }>();
    return !!(row && row.expire_at > nowTs());
  }

  async getVipMember(chatId: string): Promise<any> {
    return await this.db.prepare('SELECT * FROM vip_members WHERE chat_id=?').bind(chatId).first();
  }

  async listVipMembers(limit = 50): Promise<any[]> {
    const result = await this.db.prepare(
      'SELECT * FROM vip_members WHERE expire_at > ? ORDER BY expire_at DESC LIMIT ?'
    ).bind(nowTs(), limit).all();
    return result.results;
  }

  async vipMemberCount(): Promise<number> {
    const row = await this.db.prepare('SELECT COUNT(*) AS count FROM vip_members WHERE expire_at > ?')
      .bind(nowTs()).first<{ count: number }>();
    return row?.count || 0;
  }

  async expiredPendingOrderCount(chatId: string): Promise<number> {
    const row = await this.db.prepare(
      "SELECT COUNT(*) AS count FROM vip_orders WHERE chat_id=? AND status='pending' AND created_at < ?"
    ).bind(chatId, nowTs() - 3600).first<{ count: number }>();
    return row?.count || 0;
  }

  async cleanupExpiredOrders(): Promise<void> {
    await this.db.prepare("UPDATE vip_orders SET status='expired' WHERE status='pending' AND created_at < ?")
      .bind(nowTs() - 3600).run();
  }

  // ── VIP Redemption Codes ──

  async generateVipCode(days: number, createdBy: string): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'VIP-';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const ts = nowTs();
    await this.db.prepare(
      'INSERT INTO vip_codes(code, days, status, created_by, created_at) VALUES(?,?,?,?,?)'
    ).bind(code, days, 'unused', createdBy, ts).run();
    return code;
  }

  async redeemVipCode(code: string, chatId: string): Promise<{ ok: boolean; message: string; days?: number }> {
    const row = await this.db.prepare('SELECT * FROM vip_codes WHERE code=?').bind(code.trim().toUpperCase()).first<any>();
    if (!row) return { ok: false, message: '兑换码不存在。' };
    if (row.status !== 'unused') return { ok: false, message: '该兑换码已被使用。' };
    const ts = nowTs();
    await this.db.prepare("UPDATE vip_codes SET status='used', used_by=?, used_at=? WHERE code=?")
      .bind(chatId, ts, code.trim().toUpperCase()).run();
    return { ok: true, message: `成功兑换 ${row.days} 天 VIP！`, days: row.days };
  }

  async listVipCodes(limit = 20): Promise<any[]> {
    const result = await this.db.prepare(
      'SELECT * FROM vip_codes ORDER BY created_at DESC LIMIT ?'
    ).bind(limit).all();
    return result.results;
  }

  async unusedVipCodeCount(): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) AS count FROM vip_codes WHERE status='unused'")
      .first<{ count: number }>();
    return row?.count || 0;
  }

  async extendVip(chatId: string, days: number): Promise<number> {
    return await this.activateVip(chatId, days);
  }

  async deleteVip(chatId: string): Promise<void> {
    await this.db.prepare('DELETE FROM vip_members WHERE chat_id=?').bind(String(chatId)).run();
  }

  async allVipMembers(limit = 100): Promise<any[]> {
    const result = await this.db.prepare('SELECT * FROM vip_members ORDER BY expire_at DESC LIMIT ?').bind(limit).all();
    return result.results;
  }

  async allVipMemberCount(): Promise<number> {
    const row = await this.db.prepare('SELECT COUNT(*) AS count FROM vip_members').first<{ count: number }>();
    return row?.count || 0;
  }

  async searchVipMember(query: string): Promise<any[]> {
    const q = `%${query}%`;
    const result = await this.db.prepare(
      'SELECT * FROM vip_members WHERE chat_id LIKE ? OR username LIKE ? ORDER BY expire_at DESC LIMIT 10'
    ).bind(q, q).all();
    return result.results;
  }
}

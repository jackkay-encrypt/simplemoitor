// Main Controller Handler Logic
import { TelegramClient, InlineKeyboardMarkup, TelegramUpdate } from './telegram';
import { MonitorStore, nowTs, ServerRow } from './storage';
import { buildTextReport } from './metrics';

export const APP_NAME = 'SimpleMoitor';
export const APP_VERSION = 'v1.0';

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class Controller {
  store: MonitorStore;
  tg: TelegramClient;
  fbTg: TelegramClient | null;
  config: {
    authUsername: string;
    authPassword: string;
    feedbackChatId: string;
  };

  constructor(db: D1Database, botToken: string, fbBotToken: string, cfg: Record<string, string>) {
    this.store = new MonitorStore(db);
    this.tg = new TelegramClient(botToken, cfg.API_BASE);
    this.fbTg = fbBotToken ? new TelegramClient(fbBotToken, cfg.API_BASE) : null;
    this.config = {
      authUsername: cfg.AUTH_USERNAME || '',
      authPassword: cfg.AUTH_PASSWORD || '',
      feedbackChatId: cfg.FEEDBACK_CHAT_ID || '',
    };
  }

  isAuthRequired(): boolean { return !!(this.config.authUsername && this.config.authPassword); }
  async isAuthenticated(chatId: string): Promise<boolean> {
    if (!this.isAuthRequired()) return true;
    const activeSession = await this.store.getSetting('active_admin_session');
    return activeSession === String(chatId);
  }
  async authenticateUser(chatId: string) {
    // 获取旧的登录用户，通知被挤掉
    const oldSession = await this.store.getSetting('active_admin_session');
    if (oldSession && oldSession !== String(chatId) && this.fbTg) {
      try { await this.fbTg.sendMessage(oldSession, '你的登录已被其他用户挤掉，请重新登录。', { inline_keyboard: [[{ text: '重新登录', callback_data: 'fb_auth:start' }]] }); } catch {}
    }
    await this.store.setSetting('active_admin_session', String(chatId));
  }
  async logoutUser(chatId: string) {
    const activeSession = await this.store.getSetting('active_admin_session');
    if (activeSession === String(chatId)) {
      await this.store.setSetting('active_admin_session', '');
    }
  }

  // ── Keyboards ──
  mainKb(): InlineKeyboardMarkup { return { inline_keyboard: [[{ text: '服务器列表', callback_data: 'menu:list' }], [{ text: '使用说明', callback_data: 'menu:help' }], [{ text: '充值VIP', callback_data: 'menu:vip' }], [{ text: '账户信息', callback_data: 'menu:account' }], [{ text: '反馈', callback_data: 'menu:feedback' }]] }; }
  vipKb(): InlineKeyboardMarkup { return { inline_keyboard: [[{ text: '立即充值', callback_data: 'vip:recharge' }], [{ text: '返回首页', callback_data: 'menu:home' }]] }; }
  fbAdminKb(): InlineKeyboardMarkup { return { inline_keyboard: [[{ text: '刷新', callback_data: 'fb:refresh' }], [{ text: '留言', callback_data: 'fb:list' }], [{ text: 'VIP管理', callback_data: 'fb:vip_menu' }], [{ text: '退出登录', callback_data: 'fb:logout' }]] }; }
  fbVipKb(): InlineKeyboardMarkup { return { inline_keyboard: [[{ text: '设置收款地址', callback_data: 'fb:vip_set_wallet' }], [{ text: '设置VIP价格', callback_data: 'fb:vip_set_price' }], [{ text: '查看会员列表', callback_data: 'fb:vip_list' }], [{ text: '查找会员', callback_data: 'fb:vip_search' }], [{ text: '生成兑换码', callback_data: 'fb:vip_gen_menu' }], [{ text: '查看兑换码', callback_data: 'fb:vip_codes_list' }], [{ text: '返回', callback_data: 'fb:refresh' }]] }; }
  fbMemberKb(chatId: string): InlineKeyboardMarkup { return { inline_keyboard: [[{ text: '延期7天', callback_data: `fb:vip_ext:${chatId}:7` }, { text: '延期30天', callback_data: `fb:vip_ext:${chatId}:30` }], [{ text: '延期90天', callback_data: `fb:vip_ext:${chatId}:90` }, { text: '自定义延期', callback_data: `fb:vip_ext_custom:${chatId}` }], [{ text: '删除会员', callback_data: `fb:vip_del:${chatId}` }], [{ text: '返回列表', callback_data: 'fb:vip_list' }]] }; }
  fbCodeGenKb(): InlineKeyboardMarkup { return { inline_keyboard: [[{ text: '1天', callback_data: 'fb:vip_gen:1' }, { text: '3天', callback_data: 'fb:vip_gen:3' }, { text: '7天', callback_data: 'fb:vip_gen:7' }], [{ text: '30天', callback_data: 'fb:vip_gen:30' }, { text: '90天', callback_data: 'fb:vip_gen:90' }], [{ text: '自定义天数', callback_data: 'fb:vip_gen_custom' }], [{ text: '返回', callback_data: 'fb:vip_menu' }]] }; }
  fbMsgKb(mid: number): InlineKeyboardMarkup { return { inline_keyboard: [[{ text: '回复', callback_data: `fb:reply:${mid}` }], [{ text: '刷新', callback_data: 'fb:refresh' }, { text: '留言', callback_data: 'fb:list' }]] }; }
  listActionKb(): InlineKeyboardMarkup { return { inline_keyboard: [[{ text: '绑定服务器', callback_data: 'menu:bind' }, { text: '解绑服务器', callback_data: 'menu:unbind_menu' }], [{ text: '编辑服务器', callback_data: 'menu:edit_menu' }], [{ text: '返回首页', callback_data: 'menu:home' }]] }; }
  serverKb(sid: string): InlineKeyboardMarkup { return { inline_keyboard: [[{ text: '获取服务器状态', callback_data: `srv:status:${sid}` }], [{ text: '编辑备注', callback_data: `srv:rename_hint:${sid}` }], [{ text: '设置汇报间隔', callback_data: `srv:interval_menu:${sid}` }], [{ text: '预警汇报', callback_data: `srv:warning_menu:${sid}` }], [{ text: '展示编辑', callback_data: `srv:display_menu:${sid}` }], [{ text: '返回', callback_data: 'menu:edit_menu' }]] }; }
  intervalKb(sid: string): InlineKeyboardMarkup { return { inline_keyboard: [[{ text: '1分钟', callback_data: `srv:set_interval:${sid}:60` }, { text: '5分钟', callback_data: `srv:set_interval:${sid}:300` }], [{ text: '10分钟', callback_data: `srv:set_interval:${sid}:600` }, { text: '30分钟', callback_data: `srv:set_interval:${sid}:1800` }], [{ text: '自定义时间', callback_data: `srv:custom_interval:${sid}` }], [{ text: '取消定时汇报', callback_data: `srv:set_interval:${sid}:0` }], [{ text: '返回', callback_data: `srv:edit:${sid}` }]] }; }
  warningKb(sid: string): InlineKeyboardMarkup { return { inline_keyboard: [[{ text: 'CPU预警', callback_data: `srv:warning:${sid}:cpu` }], [{ text: '内存预警', callback_data: `srv:warning:${sid}:memory` }], [{ text: '负载预警', callback_data: `srv:warning:${sid}:load` }], [{ text: '返回', callback_data: `srv:edit:${sid}` }]] }; }
  displayKb(sid: string): InlineKeyboardMarkup { return { inline_keyboard: [[{ text: '显示 srv_id', callback_data: `srv:set_display:${sid}:server_id` }], [{ text: '显示备注名称', callback_data: `srv:set_display:${sid}:server_name` }], [{ text: '返回', callback_data: `srv:edit:${sid}` }]] }; }
  loginKbBack(prefix: string): InlineKeyboardMarkup { return { inline_keyboard: [[{ text: '重新开始', callback_data: `${prefix}:start` }]] }; }

  warningItemKb(sid: string, wt: string, item: any): InlineKeyboardMarkup {
    const enabled = !!item?.enabled;
    const toggle = enabled ? '关闭预警' : '开启预警';
    const thresholds = (wt === 'cpu' || wt === 'memory') ? [70, 80, 90, 95] : [1, 2, 5, 10];
    const unit = (wt === 'cpu' || wt === 'memory') ? '%' : '';
    const rows: Array<Array<{ text: string; callback_data: string }>> = [[{ text: toggle, callback_data: `srv:set_warning:${sid}:${wt}:toggle:0` }]];
    rows.push(thresholds.slice(0, 2).map(v => ({ text: `${v}${unit}`, callback_data: `srv:set_warning:${sid}:${wt}:threshold:${v}` })));
    rows.push(thresholds.slice(2).map(v => ({ text: `${v}${unit}`, callback_data: `srv:set_warning:${sid}:${wt}:threshold:${v}` })));
    rows.push([{ text: '返回', callback_data: `srv:warning_menu:${sid}` }]);
    return { inline_keyboard: rows };
  }

  fmtInterval(s: number): string {
    s = Math.floor(s || 0);
    if (s === 0) return '已关闭定时汇报';
    if (s % 60 === 0) return `${s / 60} 分钟`;
    return `${s} 秒`;
  }

  async getDisplayMode(cid: string) { return (await this.store.getSetting(`display_mode:${cid}`, 'server_id')) || 'server_id'; }
  async setDisplayMode(cid: string, mode: string) { if (mode !== 'server_id' && mode !== 'server_name') mode = 'server_id'; await this.store.setSetting(`display_mode:${cid}`, mode); }
  warningNames(): Record<string, string> { return { cpu: 'CPU预警', memory: '内存预警', load: '负载预警' }; }
  defaultThreshold(wt: string) { return (wt === 'cpu' || wt === 'memory') ? 90 : 5; }
  warningUnit(wt: string) { return (wt === 'cpu' || wt === 'memory') ? '%' : ''; }

  async getWarningConfig(sid: string) {
    const raw = (await this.store.getSetting(`warning_config:${sid}`, '{}')) || '{}';
    let cfg: any;
    try { cfg = JSON.parse(raw); } catch { cfg = {}; }
    for (const wt of ['cpu', 'memory', 'load']) { const item = cfg[wt] || {}; item.enabled = !!item.enabled; item.threshold = item.threshold ?? this.defaultThreshold(wt); cfg[wt] = item; }
    return cfg;
  }

  async saveWarningConfig(sid: string, cfg: any) { await this.store.setSetting(`warning_config:${sid}`, JSON.stringify(cfg)); }

  async shouldSendWarning(sid: string, wt: string, cooldown = 1800) {
    const last = parseInt((await this.store.getSetting(`warning_last:${sid}:${wt}`, '0')) || '0');
    return nowTs() - last >= cooldown;
  }

  serverLabel(cid: string, srv: ServerRow): string { return ''; } // placeholder
  async serverLabelAsync(cid: string, srv: ServerRow): Promise<string> {
    const mode = await this.getDisplayMode(cid);
    const sid = srv.server_id || ''; const sname = srv.server_name || '';
    return mode === 'server_name' ? (sname || sid).slice(0, 32) : sid.slice(0, 32);
  }

  serverLine(idx: number, srv: ServerRow): string {
    const sid = esc(srv.server_id || ''); const sname = esc(srv.server_name || '');
    return sname ? `${idx}、${sid}-【${sname}】` : `${idx}、${sid}`;
  }

  async serverSelectKb(cid: string, servers: ServerRow[], action: string, back = 'menu:list'): Promise<InlineKeyboardMarkup> {
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    for (const s of servers.slice(0, 20)) { rows.push([{ text: await this.serverLabelAsync(cid, s), callback_data: `srv:${action}:${s.server_id}` }]); }
    rows.push([{ text: '返回', callback_data: back }]);
    return { inline_keyboard: rows };
  }

  // ── Pending actions ──
  private pendingKey(cid: string) { return `pending_action:${cid}`; }
  async setPending(cid: string, action: string, extra?: Record<string, any>) {
    await this.store.setSetting(this.pendingKey(cid), JSON.stringify({ action, created_at: nowTs(), ...extra }));
  }
  async getPending(cid: string): Promise<any> {
    const raw = await this.store.getSetting(this.pendingKey(cid));
    if (!raw) return null;
    try { const d = JSON.parse(raw); if (nowTs() - (d.created_at || 0) > 600) { await this.clearPending(cid); return null; } return d; } catch { await this.clearPending(cid); return null; }
  }
  async clearPending(cid: string) { await this.store.setSetting(this.pendingKey(cid), ''); }

  private fbPendingKey(cid: string) { return `feedback_pending:${cid}`; }
  async setFbPending(cid: string, action: string, extra?: Record<string, any>) {
    await this.store.setSetting(this.fbPendingKey(cid), JSON.stringify({ action, ...extra, created_at: nowTs() }));
  }
  async getFbPending(cid: string): Promise<any> {
    const raw = await this.store.getSetting(this.fbPendingKey(cid));
    if (!raw) return null;
    try { const d = JSON.parse(raw); if (nowTs() - (d.created_at || 0) > 600) { await this.clearFbPending(cid); return null; } return d; } catch { await this.clearFbPending(cid); return null; }
  }
  async clearFbPending(cid: string) { await this.store.setSetting(this.fbPendingKey(cid), ''); }

  private fbLoginKey(cid: string) { return `fb_login_pending:${cid}`; }
  async setFbLogin(cid: string, action: string, extra?: Record<string, any>) {
    await this.store.setSetting(this.fbLoginKey(cid), JSON.stringify({ action, created_at: nowTs(), ...extra }));
  }
  async getFbLogin(cid: string): Promise<any> {
    const raw = await this.store.getSetting(this.fbLoginKey(cid));
    if (!raw) return null;
    try { const d = JSON.parse(raw); if (nowTs() - (d.created_at || 0) > 600) { await this.clearFbLogin(cid); return null; } return d; } catch { await this.clearFbLogin(cid); return null; }
  }
  async clearFbLogin(cid: string) { await this.store.setSetting(this.fbLoginKey(cid), ''); }

  // ── Validation ──
  isValidHost(v: string): boolean {
    v = (v || '').trim().toLowerCase(); if (!v || v.length > 253) return false;
    const parts = v.split('.'); if (parts.length < 2) return false;
    if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) return parts.every(p => { const n = parseInt(p); return n >= 0 && n <= 255; });
    return parts.every(p => p.length > 0 && p.length <= 63 && !p.startsWith('-') && !p.endsWith('-') && /^[a-z0-9-]+$/.test(p));
  }
  isValidPort(v: string): boolean { v = (v || '').trim(); if (!/^\d+$/.test(v)) return false; const n = parseInt(v); return n >= 1 && n <= 65535; }

  parseBindText(text: string): [string, string] | null {
    const tokens = text.replace(/:/g, ' ').replace(/：/g, ' ').replace(/\n/g, ' ').split(/\s+/).filter(Boolean);
    let idx = -1; for (let i = 0; i < tokens.length; i++) { if (tokens[i].startsWith('srv_')) { idx = i; break; } }
    if (idx < 0 || idx + 1 >= tokens.length) return null;
    const sid = tokens[idx]; const code = tokens[idx + 1];
    if (!/^\d+$/.test(code) || code.length < 4) return null;
    return [sid, code];
  }

  // ── Warning alerts ──
  async sendWarningAlerts(server: ServerRow, metrics: any) {
    const cid = server.chat_id; const sid = server.server_id;
    if (!cid || !sid) return;
    if (!(await this.store.isVipActive(cid))) return; // VIP only
    const cfg = await this.getWarningConfig(sid); const names = this.warningNames();
    for (const [wt, item] of Object.entries(cfg) as [string, any][]) {
      if (!item.enabled) continue;
      const val = wt === 'cpu' ? Number(metrics.cpu_percent || 0) : wt === 'memory' ? Number(metrics.memory?.percent || 0) : Number(metrics.load_1 || 0);
      const threshold = Number(item.threshold || this.defaultThreshold(wt));
      if (val < threshold || !(await this.shouldSendWarning(sid, wt))) continue;
      const unit = this.warningUnit(wt);
      const text = `<b>服务器预警</b>\n\n<b>服务器：</b>${esc(server.server_name || sid)} (${esc(sid)})\n<b>项目：</b>${names[wt] || '预警'}\n<b>当前值：</b>${val.toFixed(2)}${unit}\n<b>阈值：</b>${threshold.toFixed(2)}${unit}\n\n请及时检查服务器运行状态。`;
      await this.tg.sendMessage(cid, text, this.serverKb(sid));
      await this.store.setSetting(`warning_last:${sid}:${wt}`, String(nowTs()));
    }
  }

  // ── Home / Help ──
  async officialHome(cid: string) {
    await this.tg.sendMessage(cid, `<b>服务器监控管理中心</b>\n\n${APP_NAME} ${APP_VERSION}\n\n欢迎使用服务器监控机器人。\n你可以通过下方按钮管理服务器、查看绑定列表、设置汇报间隔和预警项目。\n\n<b>项目地址：</b>\n<a href="https://github.com/jackkay-encrypt/simplemoitor">https://github.com/jackkay-encrypt/simplemoitor</a>`, this.mainKb());
  }

  async replyHelp(cid: string) {
    const text = [
      '<b>Simple 服务器监控系统 - 使用说明</b>', '',
      'Simple 是一个轻量级服务器监控系统，通过 Telegram Bot 实时推送服务器状态报告和预警通知。', '',
      '<b>项目地址：</b>', '<a href="https://github.com/jackkay-encrypt/simplemoitor">https://github.com/jackkay-encrypt/simplemoitor</a>', '',
      '<b>安装 Agent</b>', '1、在待监控服务器上克隆并安装：',
      '<code>git clone https://github.com/jackkay-encrypt/simplemoitor.git &amp;&amp; cd simplemoitor &amp;&amp; bash install.sh</code>',
      '2、安装完成后会显示 srv_id 和 bind_code。', '3、把 srv_id 和 bind_code 粘贴到本 Bot 的【绑定服务器】流程中即可。', '',
      '<b>绑定服务器</b>', '点击【服务器列表】→【绑定服务器】，把 Agent 安装后显示的绑定信息粘贴过来。', '格式示例：', '<code>srv_ab12cd34 839201</code>', '',
      '<b>服务器管理</b>', '• <b>编辑备注：</b>为服务器设置自定义名称，方便识别。', '• <b>汇报间隔：</b>设置定时推送频率（1分钟/5分钟/10分钟/30分钟/自定义），输入 0 关闭定时汇报。',
      '• <b>预警汇报：</b>开启 CPU、内存、负载预警，超过阈值时自动推送告警。', '• <b>展示编辑：</b>设置列表显示方式（srv_id 或备注名称）。', '• <b>解绑服务器：</b>解除绑定后不再接收该服务器的汇报。', '',
      '<b>Agent 本地管理菜单</b>', '在被监控服务器上执行 <code>simple_menu</code> 可进入管理菜单：',
      '1、查看 Telegram 绑定指令', '2、查看 srv_id', '3、查看 bind_code', '4、自动更新程序', '5、修改通信端口', '',
      '<b>重新获取 srv_id</b>', '在服务器执行：', '<code>/www/srvid</code>', '执行后把显示的"Telegram 绑定输入"复制到【绑定服务器】流程里即可。', '',
      '<b>反馈</b>', '点击首页【反馈】按钮，输入内容后会直接发送给管理员。', '',
      '<b>项目地址</b>', '<a href="https://github.com/jackkay-encrypt/simplemoitor">https://github.com/jackkay-encrypt/simplemoitor</a>',
    ].join('\n');
    await this.tg.sendMessage(cid, text, this.mainKb());
  }

  // ── Telegram update handler (main bot) ──
  async handleTelegramUpdate(update: TelegramUpdate) {
    if (update.callback_query) { await this.handleCallback(update.callback_query); return; }
    const msg = update.message || update.edited_message;
    if (!msg) return;
    const text = (msg.text || '').trim(); const chatId = msg.chat?.id;
    if (!text || !chatId) return;
    const cid = String(chatId);
    if (text.startsWith('/')) { await this.handleCommand(cid, text); return; }
    if (await this.handlePendingText(cid, text)) return;
    await this.tg.sendMessage(cid, '请选择下方按钮操作。', this.mainKb());
  }

  async handleCallback(cq: any) {
    const cbId = cq.id; const data = (cq.data || '') as string;
    const chatId = cq.message?.chat?.id;
    if (cbId) { try { await this.tg.answerCallbackQuery(cbId, '处理中'); } catch {} }
    if (!chatId) return;
    const cid = String(chatId);
    const parts = data.split(':');
    if (data === 'menu:home') { await this.officialHome(cid); return; }
    if (data === 'menu:bind') { await this.promptBind(cid); return; }
    if (data === 'menu:list') { await this.cmdList(cid); return; }
    if (data === 'menu:unbind_menu') { await this.showUnbindMenu(cid); return; }
    if (data === 'menu:edit_menu') { await this.showEditMenu(cid); return; }
    if (data === 'menu:help') { await this.replyHelp(cid); return; }
    if (data === 'menu:feedback') { await this.promptFeedback(cid); return; }
    if (data === 'menu:vip') { await this.showVipPage(cid); return; }
    if (data === 'menu:account') { await this.showAccountInfo(cid, cq.from); return; }
    if (data === 'vip:recharge') { await this.createVipOrder(cid); return; }
    if (data === 'vip:redeem') { await this.setPending(cid, 'redeem_code'); await this.tg.sendMessage(cid, '<b>兑换 VIP</b>\n\n请输入兑换码：', { inline_keyboard: [[{ text: '取消', callback_data: 'menu:account' }]] }); return; }
    if (parts.length < 3 || parts[0] !== 'srv') { await this.tg.sendMessage(cid, '按钮数据无效。', this.mainKb()); return; }
    const [_, action, sid] = parts;
    if (action === 'status') await this.queueStatus(cid, sid);
    else if (action === 'edit') await this.showServerEdit(cid, sid);
    else if (action === 'interval_menu') await this.showIntervalMenu(cid, sid);
    else if (action === 'set_interval' && parts.length === 4) await this.setInterval(cid, sid, parseInt(parts[3]));
    else if (action === 'custom_interval') await this.promptCustomInterval(cid, sid);
    else if (action === 'rename_hint') await this.promptRename(cid, sid);
    else if (action === 'warning_menu') await this.showWarningMenu(cid, sid);
    else if (action === 'warning' && parts.length === 4) await this.showWarningItem(cid, sid, parts[3]);
    else if (action === 'set_warning' && parts.length === 6) await this.setWarning(cid, sid, parts[3], parts[4], parts[5]);
    else if (action === 'display_menu') await this.showDisplayMenu(cid, sid);
    else if (action === 'set_display' && parts.length === 4) await this.setDisplay(cid, sid, parts[3]);
    else if (action === 'unbind_confirm') { await this.tg.sendMessage(cid, `确认解绑服务器 ${sid}？`, { inline_keyboard: [[{ text: '确认解绑', callback_data: `srv:unbind:${sid}` }], [{ text: '取消', callback_data: 'menu:unbind_menu' }]] }); }
    else if (action === 'unbind') { const [ok] = await this.store.unbindServer(sid, cid); await this.tg.sendMessage(cid, ok ? `已解绑 ${sid}。` : '未找到已绑定的服务器。', this.listActionKb()); }
    else { await this.tg.sendMessage(cid, '暂不支持该按钮操作。', this.mainKb()); }
  }

  async handleCommand(cid: string, text: string) {
    const parts = text.split(/\s+/);
    const cmd = parts[0].split('@')[0].toLowerCase();
    try {
      if (cmd === '/start') await this.officialHome(cid);
      else if (cmd === '/help') await this.replyHelp(cid);
      else if (cmd === '/bind') { const parsed = this.parseBindText(parts.slice(1).join(' ')); if (!parsed) { await this.promptBind(cid); return; } await this.doBind(cid, parsed); }
      else if (cmd === '/list') await this.cmdList(cid);
      else if (cmd === '/status') { if (parts.length !== 2) { await this.cmdList(cid); return; } await this.queueStatus(cid, parts[1]); }
      else if (cmd === '/interval') { if (parts.length === 2) { await this.showIntervalMenu(cid, parts[1]); return; } if (parts.length !== 3) { await this.cmdList(cid); return; } const s = parseInt(parts[2]); if (isNaN(s) || s < 0 || (s > 0 && s < 60)) { await this.tg.sendMessage(cid, '汇报间隔参数无效。', this.mainKb()); return; } await this.setInterval(cid, parts[1], s); }
      else if (cmd === '/rename') { if (parts.length < 3) { await this.cmdList(cid); return; } const name = text.split(/\s+/, 3)[2]; const [ok, res] = await this.store.renameServer(parts[1], cid, name); await this.tg.sendMessage(cid, ok ? `已重命名 ${parts[1]} 为 ${esc(res as string)}。` : res as string, ok ? this.serverKb(parts[1]) : this.mainKb()); }
      else if (cmd === '/unbind') { if (parts.length !== 2) { await this.cmdList(cid); return; } await this.tg.sendMessage(cid, `确认解绑服务器 ${parts[1]}？`, { inline_keyboard: [[{ text: '确认解绑', callback_data: `srv:unbind:${parts[1]}` }], [{ text: '取消', callback_data: 'menu:unbind_menu' }]] }); }
      else { await this.tg.sendMessage(cid, '请选择下方按钮操作。', this.mainKb()); }
    } catch (e: any) { await this.tg.sendMessage(cid, `操作执行失败：${e}`, this.mainKb()); }
  }

  // ── Pending text handlers ──
  async handlePendingText(cid: string, text: string): Promise<boolean> {
    const p = await this.getPending(cid); if (!p) return false;
    if (p.action === 'bind') { await this.doBind(cid, this.parseBindText(text)); return true; }
    if (p.action === 'rename') { const name = text.trim(); if (!name) { await this.tg.sendMessage(cid, '名称不能为空。', this.serverKb(p.server_id)); return true; } const [ok, res] = await this.store.renameServer(p.server_id, cid, name); await this.clearPending(cid); await this.tg.sendMessage(cid, ok ? `已重命名为 ${esc(res as string)}。` : res as string, ok ? this.serverKb(p.server_id) : this.mainKb()); return true; }
    if (p.action === 'custom_interval') { const v = text.trim(); if (!/^\d+$/.test(v)) { await this.tg.sendMessage(cid, '请输入数字分钟数。', this.intervalKb(p.server_id)); return true; } const mins = parseInt(v); const secs = mins === 0 ? 0 : mins * 60; const [ok, res] = await this.store.updateInterval(p.server_id, cid, secs); await this.clearPending(cid); await this.tg.sendMessage(cid, ok ? `已设置 ${p.server_id} 的汇报间隔：${this.fmtInterval(res as number)}。` : res as string, ok ? this.serverKb(p.server_id) : this.mainKb()); return true; }
    if (p.action === 'feedback') { const fb = text.trim(); if (!fb) { await this.tg.sendMessage(cid, '反馈内容不能为空。', this.mainKb()); return true; } await this.sendFeedback(cid, fb); await this.clearPending(cid); await this.tg.sendMessage(cid, '反馈已提交，感谢你的反馈。', this.mainKb()); return true; }
    if (p.action === 'redeem_code') {
      const code = text.trim();
      const result = await this.store.redeemVipCode(code, cid);
      await this.clearPending(cid);
      if (result.ok && result.days) {
        const expireAt = await this.store.activateVip(cid, result.days);
        const expDate = new Date(expireAt * 1000).toISOString().split('T')[0];
        await this.tg.sendMessage(cid, `<b>兑换成功</b>\n\n兑换码：<code>${esc(code.toUpperCase())}</code>\nVIP 天数：${result.days} 天\n到期时间：${expDate}\n\n预警汇报功能已启用。`, this.mainKb());
      } else {
        await this.tg.sendMessage(cid, `兑换失败：${result.message}`, { inline_keyboard: [[{ text: '重新兑换', callback_data: 'vip:redeem' }], [{ text: '返回账户', callback_data: 'menu:account' }]] });
      }
      return true;
    }
    await this.clearPending(cid); return false;
  }

  async doBind(cid: string, parsed: [string, string] | null) {
    if (!parsed) { await this.tg.sendMessage(cid, '没有识别到完整的绑定信息，请粘贴 srv_id 和 bind_code。\n示例：<code>srv_ab12cd34 839201</code>', this.mainKb()); return; }
    const [sid, code] = parsed;
    const [ok, result] = await this.store.bindServer(sid, code, cid);
    if (!ok) { await this.tg.sendMessage(cid, result as string, this.mainKb()); return; }
    await this.clearPending(cid);
    const fresh = await this.store.getBoundServer(sid, cid);
    await this.tg.sendMessage(cid, `绑定成功：${sid}\n当前汇报间隔：${this.fmtInterval(fresh?.report_interval || 300)}`, this.serverKb(sid));
  }

  // ── Prompt methods ──
  async promptBind(cid: string) {
    await this.setPending(cid, 'bind');
    await this.tg.sendMessage(cid, '<b>绑定新服务器</b>\n\n请先在服务器上安装 Agent：\n<a href="https://github.com/jackkay-encrypt/simplemoitor">https://github.com/jackkay-encrypt/simplemoitor</a>\n\n安装后把显示的 srv_id 和 bind_code 粘贴给我。\n格式示例：\n<code>srv_ab12cd34 839201</code>', this.mainKb());
  }
  async promptRename(cid: string, sid: string) { await this.setPending(cid, 'rename', { server_id: sid }); await this.tg.sendMessage(cid, '请直接发送新的服务器名称。', this.serverKb(sid)); }
  async promptCustomInterval(cid: string, sid: string) { await this.setPending(cid, 'custom_interval', { server_id: sid }); await this.tg.sendMessage(cid, '<b>自定义汇报间隔</b>\n\n请发送间隔分钟数。\n例如：<code>3</code> 表示每 3 分钟汇报一次。\n发送 <code>0</code> 表示关闭定时汇报。', this.intervalKb(sid)); }
  async promptFeedback(cid: string) { await this.setPending(cid, 'feedback'); await this.tg.sendMessage(cid, '<b>反馈</b>\n\n请直接发送你要反馈的内容。\n我会把你的反馈转发给管理员。', this.mainKb()); }

  // ── Show menus ──
  async cmdList(cid: string) {
    const servers = await this.store.listServers(cid);
    const lines = [`<b>服务器列表</b>`, `已绑定了 ${servers.length} 台服务器`];
    if (servers.length) servers.forEach((s, i) => lines.push(this.serverLine(i + 1, s))); else lines.push('暂无已绑定服务器。');
    await this.tg.sendMessage(cid, lines.join('\n'), this.listActionKb());
  }
  async showUnbindMenu(cid: string) { const srvs = await this.store.listServers(cid); if (!srvs.length) { await this.tg.sendMessage(cid, '暂无可解绑服务器。', this.listActionKb()); return; } await this.tg.sendMessage(cid, '请选择需要解绑的服务器：', await this.serverSelectKb(cid, srvs, 'unbind_confirm')); }
  async showEditMenu(cid: string) { const srvs = await this.store.listServers(cid); if (!srvs.length) { await this.tg.sendMessage(cid, '暂无可编辑服务器。', this.listActionKb()); return; } const mode = (await this.getDisplayMode(cid)) === 'server_id' ? 'srv_id' : '备注名称'; await this.tg.sendMessage(cid, `请选择需要编辑的服务器：\n当前按钮展示：${mode}`, await this.serverSelectKb(cid, srvs, 'edit')); }
  async showServerEdit(cid: string, sid: string) { const s = await this.store.getBoundServer(sid, cid); if (!s) { await this.tg.sendMessage(cid, '未找到已绑定的服务器。', this.listActionKb()); return; } await this.tg.sendMessage(cid, `<b>编辑服务器</b>\nsrv_id：${esc(sid)}\n备注：${esc(s.server_name || '未设置')}`, this.serverKb(sid)); }
  async queueStatus(cid: string, sid: string) {
    const s = await this.store.getBoundServer(sid, cid);
    if (!s) { await this.tg.sendMessage(cid, '未找到已绑定的服务器。', this.mainKb()); return; }
    // 立即用数据库中最近一次心跳数据生成报告
    let metrics: any = {};
    try { metrics = JSON.parse(s.status_json || '{}'); } catch { metrics = {}; }
    if (Object.keys(metrics).length > 0) {
      const text = buildTextReport(s, metrics, 'manual');
      await this.tg.sendMessage(cid, text, this.serverKb(sid));
    } else {
      await this.tg.sendMessage(cid, '暂无服务器状态数据，Agent 尚未上报。', this.serverKb(sid));
    }
    // 同时排队一个刷新命令，让 Agent 下次轮询时上报最新数据
    await this.store.enqueueCommand(sid, 'report_now', { reason: 'manual' });
  }
  async showIntervalMenu(cid: string, sid: string) { const s = await this.store.getBoundServer(sid, cid); if (!s) { await this.tg.sendMessage(cid, '未找到已绑定的服务器。', this.listActionKb()); return; } await this.tg.sendMessage(cid, `请选择 ${sid} 的汇报间隔：\n当前间隔：${this.fmtInterval(s.report_interval)}`, this.intervalKb(sid)); }
  async showWarningMenu(cid: string, sid: string) { if (!(await this.store.getBoundServer(sid, cid))) { await this.tg.sendMessage(cid, '未找到已绑定的服务器。', this.listActionKb()); return; } if (!(await this.store.isVipActive(cid))) { await this.tg.sendMessage(cid, '预警汇报为 VIP 专属功能，请先开通 VIP。', this.vipKb()); return; } await this.tg.sendMessage(cid, `请选择 ${sid} 的预警汇报项目：\n预警配置只对你绑定的这台服务器生效。`, this.warningKb(sid)); }
  async showWarningItem(cid: string, sid: string, wt: string) { if (!(await this.store.getBoundServer(sid, cid))) { await this.tg.sendMessage(cid, '未找到已绑定的服务器。', this.listActionKb()); return; } const names = this.warningNames(); if (!(wt in names)) { await this.tg.sendMessage(cid, '未知预警项目。', this.warningKb(sid)); return; } const cfg = await this.getWarningConfig(sid); const item = cfg[wt] || {}; const unit = this.warningUnit(wt); await this.tg.sendMessage(cid, `<b>${names[wt]}</b>\n\n当前状态：${item.enabled ? '开启' : '关闭'}\n当前阈值：${item.threshold}${unit}\n\n超过阈值时，机器人会向绑定该服务器的 Telegram 用户发送预警提示。`, this.warningItemKb(sid, wt, item)); }
  async showDisplayMenu(cid: string, sid: string) { const mode = (await this.getDisplayMode(cid)) === 'server_id' ? 'srv_id' : '备注名称'; await this.tg.sendMessage(cid, `请选择列表展示名称：\n当前展示：${mode}`, this.displayKb(sid)); }

  async setInterval(cid: string, sid: string, seconds: number) {
    if (isNaN(seconds)) { await this.tg.sendMessage(cid, '间隔参数无效。', this.serverKb(sid)); return; }
    const [ok, res] = await this.store.updateInterval(sid, cid, seconds);
    await this.tg.sendMessage(cid, ok ? `已设置 ${sid} 的汇报间隔：${this.fmtInterval(res as number)}。` : res as string, ok ? this.serverKb(sid) : this.mainKb());
  }
  async setWarning(cid: string, sid: string, wt: string, mode: string, value: string) {
    if (!(await this.store.getBoundServer(sid, cid))) { await this.tg.sendMessage(cid, '未找到已绑定的服务器。', this.listActionKb()); return; }
    const names = this.warningNames(); if (!(wt in names)) { await this.tg.sendMessage(cid, '未知预警项目。', this.warningKb(sid)); return; }
    const cfg = await this.getWarningConfig(sid); const item = cfg[wt] || {};
    if (mode === 'toggle') item.enabled = !item.enabled; else if (mode === 'threshold') { item.threshold = parseFloat(value); item.enabled = true; }
    cfg[wt] = item; await this.saveWarningConfig(sid, cfg); await this.showWarningItem(cid, sid, wt);
  }
  async setDisplay(cid: string, sid: string, mode: string) { await this.setDisplayMode(cid, mode); const t = mode === 'server_id' ? 'srv_id' : '备注名称'; await this.tg.sendMessage(cid, `已设置列表展示：${t}`, this.serverKb(sid)); }

  // ── Account Info ──
  async showAccountInfo(cid: string, from: any) {
    const firstName = esc(from?.first_name || '');
    const lastName = esc(from?.last_name || '');
    const username = from?.username ? '@' + esc(from.username) : '未设置';
    const userId = from?.id || cid;
    const isVip = await this.store.isVipActive(cid);
    const vipMember = await this.store.getVipMember(cid);
    let vipStatus = '未开通';
    if (isVip && vipMember) {
      const expDate = new Date(vipMember.expire_at * 1000).toISOString().split('T')[0];
      const daysLeft = Math.ceil((vipMember.expire_at - nowTs()) / 86400);
      vipStatus = `已开通（到期 ${expDate}，剩余 ${daysLeft} 天）`;
    }
    // Get user's server info
    const servers = await this.store.listServers(cid);
    let serverInfo = '无已绑定服务器';
    if (servers.length) {
      const lines = servers.map((s, i) => {
        const ip = s.bind_ip || '未知';
        const port = s.bind_port || '未知';
        const name = s.server_name ? ` (${esc(s.server_name)})` : '';
        return `${i + 1}. ${esc(s.server_id)}${name}\n   IP: <code>${esc(String(ip))}</code> 端口: ${esc(String(port))}`;
      });
      serverInfo = lines.join('\n');
    }
    const text = [
      '<b>账户信息</b>', '',
      `<b>Telegram ID：</b><code>${userId}</code>`,
      `<b>用户名：</b>${username}`,
      `<b>姓名：</b>${firstName} ${lastName}`,
      `<b>VIP 状态：</b>${vipStatus}`, '',
      `<b>已绑定服务器（${servers.length}台）：</b>`,
      serverInfo,
    ].join('\n');
    await this.tg.sendMessage(cid, text, { inline_keyboard: [[{ text: '兑换VIP', callback_data: 'vip:redeem' }], [{ text: '返回首页', callback_data: 'menu:home' }]] });
  }

  // ── VIP ──
  async showVipPage(cid: string) {
    const isActive = await this.store.isVipActive(cid);
    const member = await this.store.getVipMember(cid);
    const price = await this.store.getVipPrice();
    if (isActive && member) {
      const expDate = new Date(member.expire_at * 1000).toISOString().split('T')[0];
      const daysLeft = Math.ceil((member.expire_at - nowTs()) / 86400);
      await this.tg.sendMessage(cid, `<b>VIP 会员</b>\n\n状态：已开通\n到期时间：${expDate}\n剩余天数：${daysLeft} 天\n累计付费：${member.total_paid} USDT\n\n预警汇报功能已启用。`, this.vipKb());
    } else {
      await this.tg.sendMessage(cid, `<b>VIP 会员</b>\n\n状态：未开通\n\n开通 VIP 可使用预警汇报功能，服务器指标超过阈值时自动推送告警。\n\n价格：${price} USDT / 30天`, this.vipKb());
    }
  }

  async createVipOrder(cid: string) {
    const wallet = await this.store.getVipWallet();
    if (!wallet) { await this.tg.sendMessage(cid, '收款地址尚未配置，请联系管理员。', this.mainKb()); return; }
    // Clean up old expired orders for this user
    await this.store.cleanupExpiredOrders();
    const price = await this.store.getVipPrice();
    const { orderId, amountUnique } = await this.store.createOrder(cid, price);
    const text = [
      '<b>VIP 充值订单</b>', '',
      `订单号：<code>${orderId}</code>`,
      `支付金额：<b>${amountUnique} USDT</b>`,
      `支付网络：<b>TRC20 (TRON)</b>`, '',
      `收款地址：`,
      `<code>${wallet}</code>`, '',
      '请精确转账上述金额，系统将在确认到账后自动开通 VIP（30天）。',
      '订单有效期 1 小时。',
    ].join('\n');
    await this.tg.sendMessage(cid, text, { inline_keyboard: [[{ text: '查看VIP状态', callback_data: 'menu:vip' }], [{ text: '返回首页', callback_data: 'menu:home' }]] });
  }

  // ── Feedback ──
  async sendFeedback(cid: string, text: string): Promise<[boolean, string]> {
    if (!this.fbTg) return [false, '反馈机器人尚未配置。'];
    if (!this.config.feedbackChatId) return [false, '反馈接收 Chat ID 尚未配置。'];
    const mid = await this.store.addFeedbackMessage(cid, text);
    const unread = await this.store.feedbackCount('unread');
    const msg = `<b>新的用户反馈</b>\n\n留言编号：<code>${mid}</code>\n来源 Chat ID：<code>${esc(cid)}</code>\n当前未回复：${unread} 条\n\n<b>反馈内容：</b>\n${esc(text)}`;
    await this.fbTg.sendMessage(this.config.feedbackChatId, msg, this.fbMsgKb(mid));
    return [true, 'ok'];
  }

  // ── Feedback bot update handler ──
  async handleFeedbackUpdate(update: TelegramUpdate) {
    if (!this.fbTg) return;
    const client = this.fbTg;
    if (update.callback_query) {
      const cq = update.callback_query; const cbId = cq.id; const data = cq.data || '';
      const cid = String(cq.message?.chat?.id || ''); if (cbId) { try { await client.answerCallbackQuery(cbId, '处理中'); } catch {} } if (!cid) return;
      const isAdmin = this.config.feedbackChatId && cid === this.config.feedbackChatId;
      if (data === 'fb_auth:start') { await this.setFbLogin(cid, 'login_username'); await client.sendMessage(cid, '请输入用户名：', this.loginKbBack('fb_auth')); return; }
      if (isAdmin) { await this.handleFbAdminCallback(client, cid, data); return; }
      if (this.isAuthRequired() && !(await this.isAuthenticated(cid))) { await this.fbPromptLogin(client, cid); return; }
      await this.handleFbAdminCallback(client, cid, data);
      return;
    }
    const msg = update.message || update.edited_message; if (!msg) return;
    const text = (msg.text || '').trim(); const cid = String(msg.chat?.id || ''); if (!text || !cid) return;
    const isAdmin = this.config.feedbackChatId && cid === this.config.feedbackChatId;
    if (isAdmin) {
      if (text.startsWith('/start') || text.startsWith('/help')) { await this.fbAdminHome(client, cid); return; }
      if (text.startsWith('/setprice')) {
        const price = parseFloat(text.replace('/setprice', '').trim());
        if (isNaN(price) || price <= 0) { await client.sendMessage(cid, '价格无效，请输入正数。例如：<code>/setprice 9</code>', this.fbAdminKb()); return; }
        await this.store.setVipPrice(price);
        await client.sendMessage(cid, `VIP 价格已更新：<b>${price} USDT</b> / 30天`, this.fbVipKb());
        return;
      }
      if (text.startsWith('/setwallet')) {
        const addr = text.replace('/setwallet', '').trim();
        if (!addr.startsWith('T') || addr.length < 30) { await client.sendMessage(cid, '地址无效，TRC20 地址以 T 开头且长度约 34 位。', this.fbAdminKb()); return; }
        await this.store.setVipWallet(addr);
        await client.sendMessage(cid, `收款地址已更新：\n<code>${esc(addr)}</code>`, this.fbVipKb());
        return;
      }
      if (await this.handleFbVipPendingText(client, cid, text)) return;
      const p = await this.getFbPending(cid); if (p?.action === 'reply') { await this.handleFbReply(client, cid, p.message_id, text); return; }
      await this.fbAdminHome(client, cid); return;
    }
    if (this.isAuthRequired() && !(await this.isAuthenticated(cid))) {
      if (text.startsWith('/login')) {
        const parts = text.split(/\s+/).slice(1);
        if (parts.length < 2) { await client.sendMessage(cid, '<b>登录</b>\n\n请发送命令：\n<code>/login 用户名 密码</code>', { inline_keyboard: [[{ text: '开始登录', callback_data: 'fb_auth:start' }]] }); return; }
        const [user, pass] = parts;
        if (user === this.config.authUsername && pass === this.config.authPassword) {
          await this.authenticateUser(cid);
          await client.sendMessage(cid, '登录成功！欢迎使用管理中心。', this.fbAdminKb());
          await this.fbAdminHome(client, cid);
        } else {
          await client.sendMessage(cid, '用户名或密码错误。', { inline_keyboard: [[{ text: '重新登录', callback_data: 'fb_auth:start' }]] });
        }
        return;
      }
      if (await this.handleFbLoginText(client, cid, text)) return;
      await this.fbPromptLogin(client, cid); return;
    }
    if (text.startsWith('/start') || text.startsWith('/help')) { await this.fbAdminHome(client, cid); return; }
    if (text.startsWith('/logout')) { await this.logoutUser(cid); await this.clearFbLogin(cid); await client.sendMessage(cid, '已退出登录。', { inline_keyboard: [[{ text: '重新登录', callback_data: 'fb_auth:start' }]] }); return; }
    const p = await this.getFbPending(cid); if (p?.action === 'reply') { await this.handleFbReply(client, cid, p.message_id, text); return; }
    await this.fbAdminHome(client, cid);
  }

  async handleFbAdminCallback(client: TelegramClient, cid: string, data: string) {
    if (data === 'fb:refresh') { await this.fbAdminHome(client, cid); return; }
    if (data === 'fb:list') { await this.fbList(client, cid); return; }
    if (data === 'fb:vip_menu') { await this.fbVipMenu(client, cid); return; }
    if (data === 'fb:vip_set_wallet') { await this.fbSetWalletPrompt(client, cid); return; }
    if (data === 'fb:vip_set_price') { await this.fbSetPricePrompt(client, cid); return; }
    if (data === 'fb:vip_list') { await this.fbVipList(client, cid); return; }
    if (data === 'fb:vip_gen_menu') { await client.sendMessage(cid, '<b>生成兑换码</b>\n\n请选择 VIP 天数：', this.fbCodeGenKb()); return; }
    if (data === 'fb:vip_gen_custom') { await this.setFbPending(cid, 'gen_code_days'); await client.sendMessage(cid, '<b>自定义天数</b>\n\n请输入兑换码天数（正整数）：', this.fbAdminKb()); return; }
    if (data === 'fb:vip_codes_list') { await this.fbVipCodesList(client, cid); return; }
    if (data.startsWith('fb:vip_gen:')) {
      const days = parseInt(data.split(':')[2]);
      if (days > 0) { const code = await this.store.generateVipCode(days, cid); await client.sendMessage(cid, `<b>兑换码已生成</b>\n\n天数：${days} 天\n兑换码：<code>${code}</code>\n\n请将此兑换码发送给目标用户。`, this.fbCodeGenKb()); }
      return;
    }
    if (data === 'fb:vip_search') { await this.setFbPending(cid, 'search_member'); await client.sendMessage(cid, '<b>查找会员</b>\n\n请输入用户的 Telegram ID 或用户名：', this.fbAdminKb()); return; }
    if (data.startsWith('fb:vip_detail:')) { await this.fbMemberDetail(client, cid, data.split(':')[2]); return; }
    if (data.startsWith('fb:vip_ext:')) { const p = data.split(':'); const targetId = p[2]; const days = parseInt(p[3]); const exp = await this.store.extendVip(targetId, days); const expDate = new Date(exp * 1000).toISOString().split('T')[0]; await client.sendMessage(cid, `已为用户 <code>${esc(targetId)}</code> 延期 ${days} 天\n新到期时间：${expDate}`, this.fbMemberKb(targetId)); return; }
    if (data.startsWith('fb:vip_ext_custom:')) { const targetId = data.split(':')[2]; await this.setFbPending(cid, 'extend_member', {server_id: targetId}); await client.sendMessage(cid, `<b>自定义延期</b>\n\n请输入延期天数：`, this.fbAdminKb()); return; }
    if (data.startsWith('fb:vip_del:')) { const targetId = data.split(':')[2]; await client.sendMessage(cid, `确认删除会员 <code>${esc(targetId)}</code>？`, { inline_keyboard: [[{ text: '确认删除', callback_data: `fb:vip_del_confirm:${targetId}` }], [{ text: '取消', callback_data: `fb:vip_detail:${targetId}` }]] }); return; }
    if (data.startsWith('fb:vip_del_confirm:')) { const targetId = data.split(':')[2]; await this.store.deleteVip(targetId); await client.sendMessage(cid, `已删除会员 <code>${esc(targetId)}</code>。`, this.fbVipKb()); return; }
    if (data === 'fb:logout') {
      await this.logoutUser(cid);
      await this.clearFbPending(cid);
      await this.clearFbLogin(cid);
      await client.sendMessage(cid, '已退出登录。', { inline_keyboard: [[{ text: '重新登录', callback_data: 'fb_auth:start' }]] });
      return;
    }
    const parts = data.split(':');
    if (parts.length === 3 && parts[0] === 'fb' && parts[1] === 'reply') { await this.promptFbReply(client, cid, parseInt(parts[2])); return; }
    await client.sendMessage(cid, '暂不支持该操作。', this.fbAdminKb());
  }

  // ── Feedback Bot VIP Management ──
  async fbVipMenu(client: TelegramClient, cid: string) {
    const count = await this.store.vipMemberCount();
    const wallet = await this.store.getVipWallet();
    const price = await this.store.getVipPrice();
    const text = `<b>VIP 管理</b>\n\n当前会员数：${count}\n收款地址：${wallet ? '<code>' + wallet + '</code>' : '未设置'}\nVIP 价格：${price} USDT / 30天`;
    await client.sendMessage(cid, text, this.fbVipKb());
  }

  async fbSetWalletPrompt(client: TelegramClient, cid: string) {
    const current = await this.store.getVipWallet();
    await client.sendMessage(cid, `<b>设置收款地址</b>\n\n当前地址：${current ? '<code>' + current + '</code>' : '未设置'}\n\n请发送命令：\n<code>/setwallet T你的TRC20地址</code>`, this.fbAdminKb());
  }

  async fbSetPricePrompt(client: TelegramClient, cid: string) {
    const price = await this.store.getVipPrice();
    await client.sendMessage(cid, `<b>设置 VIP 价格</b>\n\n当前价格：${price} USDT / 30天\n\n请发送命令：\n<code>/setprice 价格数字</code>\n例如：<code>/setprice 9</code>`, this.fbAdminKb());
  }

  async fbVipList(client: TelegramClient, cid: string) {
    const activeCount = await this.store.vipMemberCount();
    const totalCount = await this.store.allVipMemberCount();
    const members = await this.store.listVipMembers(20);
    const lines = [`<b>VIP 会员列表</b>`, '', `活跃会员：${activeCount} 人`, `总注册：${totalCount} 人`, ''];
    if (!members.length) { lines.push('当前没有活跃会员。'); await client.sendMessage(cid, lines.join('\n'), this.fbVipKb()); return; }
    for (const m of members) {
      const expDate = new Date(m.expire_at * 1000).toISOString().split('T')[0];
      const daysLeft = Math.ceil((m.expire_at - nowTs()) / 86400);
      const name = m.username ? ` @${esc(m.username)}` : '';
      lines.push(`<code>${esc(String(m.chat_id))}</code>${name}\n  到期：${expDate}（${daysLeft}天）累计：${m.total_paid} USDT  [<a href="tg://resolve?domain=placeholder">管理</a>]`);
    }
    // Use inline keyboard for member management instead of links
    const kb: InlineKeyboardMarkup = { inline_keyboard: [] };
    for (const m of members.slice(0, 10)) {
      const label = m.username ? `@${m.username}` : String(m.chat_id);
      kb.inline_keyboard.push([{ text: `${label} (${Math.ceil((m.expire_at - nowTs()) / 86400)}天)`, callback_data: `fb:vip_detail:${m.chat_id}` }]);
    }
    kb.inline_keyboard.push([{ text: '返回', callback_data: 'fb:vip_menu' }]);
    await client.sendMessage(cid, lines.join('\n'), kb);
  }

  async fbMemberDetail(client: TelegramClient, cid: string, targetId: string) {
    const m = await this.store.getVipMember(targetId);
    if (!m) { await client.sendMessage(cid, `未找到会员 <code>${esc(targetId)}</code>。`, this.fbVipKb()); return; }
    const isActive = m.expire_at > nowTs();
    const expDate = new Date(m.expire_at * 1000).toISOString().split('T')[0];
    const daysLeft = isActive ? Math.ceil((m.expire_at - nowTs()) / 86400) : 0;
    const name = m.username ? ` @${esc(m.username)}` : '';
    const text = [
      '<b>会员详情</b>', '',
      `用户：<code>${esc(String(m.chat_id))}</code>${name}`,
      `状态：${isActive ? '活跃' : '已过期'}`,
      `到期时间：${expDate}`,
      `剩余天数：${daysLeft} 天`,
      `累计付费：${m.total_paid} USDT`,
    ].join('\n');
    await client.sendMessage(cid, text, this.fbMemberKb(targetId));
  }

  async handleFbVipPendingText(client: TelegramClient, cid: string, text: string): Promise<boolean> {
    const p = await this.getFbPending(cid); if (!p) return false;
    if (p.action === 'set_wallet') {
      const addr = text.trim();
      if (!addr.startsWith('T') || addr.length < 30) { await client.sendMessage(cid, '地址无效，TRC20 地址以 T 开头且长度约 34 位。', this.fbAdminKb()); await this.clearFbPending(cid); return true; }
      await this.store.setVipWallet(addr);
      await this.clearFbPending(cid);
      await client.sendMessage(cid, `收款地址已更新：\n<code>${esc(addr)}</code>`, this.fbVipKb());
      return true;
    }
    if (p.action === 'set_price') {
      const price = parseFloat(text.trim());
      if (isNaN(price) || price <= 0) { await client.sendMessage(cid, '价格无效，请输入正数。', this.fbAdminKb()); await this.clearFbPending(cid); return true; }
      await this.store.setVipPrice(price);
      await this.clearFbPending(cid);
      await client.sendMessage(cid, `VIP 价格已更新：${price} USDT / 30天`, this.fbVipKb());
      return true;
    }
    if (p.action === 'gen_code_days') {
      const days = parseInt(text.trim());
      if (isNaN(days) || days < 1) { await client.sendMessage(cid, '天数无效，请输入正整数。', this.fbAdminKb()); await this.clearFbPending(cid); return true; }
      const code = await this.store.generateVipCode(days, cid);
      await this.clearFbPending(cid);
      await client.sendMessage(cid, `<b>兑换码已生成</b>\n\n天数：${days} 天\n兑换码：<code>${code}</code>\n\n请将此兑换码发送给目标用户。`, this.fbCodeGenKb());
      return true;
    }
    if (p.action === 'search_member') {
      const query = text.trim();
      await this.clearFbPending(cid);
      const results = await this.store.searchVipMember(query);
      if (!results.length) { await client.sendMessage(cid, `未找到匹配“${esc(query)}”的会员。`, this.fbVipKb()); return true; }
      const kb: InlineKeyboardMarkup = { inline_keyboard: [] };
      for (const m of results) {
        const label = m.username ? `@${m.username}` : String(m.chat_id);
        const daysLeft = m.expire_at > nowTs() ? Math.ceil((m.expire_at - nowTs()) / 86400) : 0;
        kb.inline_keyboard.push([{ text: `${label} (${daysLeft}天)`, callback_data: `fb:vip_detail:${m.chat_id}` }]);
      }
      kb.inline_keyboard.push([{ text: '返回', callback_data: 'fb:vip_menu' }]);
      await client.sendMessage(cid, `<b>搜索结果</b>（“${esc(query)}”）\n找到 ${results.length} 个会员：`, kb);
      return true;
    }
    if (p.action === 'extend_member') {
      const targetId = p.server_id;
      const days = parseInt(text.trim());
      if (isNaN(days) || days < 1) { await client.sendMessage(cid, '天数无效，请输入正整数。', this.fbAdminKb()); await this.clearFbPending(cid); return true; }
      const exp = await this.store.extendVip(targetId, days);
      const expDate = new Date(exp * 1000).toISOString().split('T')[0];
      await this.clearFbPending(cid);
      await client.sendMessage(cid, `已为用户 <code>${esc(targetId)}</code> 延期 ${days} 天\n新到期时间：${expDate}`, this.fbMemberKb(targetId));
      return true;
    }
    return false;
  }

  async fbVipCodesList(client: TelegramClient, cid: string) {
    const codes = await this.store.listVipCodes(20);
    if (!codes.length) { await client.sendMessage(cid, '当前没有兑换码。', this.fbVipKb()); return; }
    const lines = ['<b>兑换码列表</b>', ''];
    for (const c of codes) {
      const status = c.status === 'unused' ? '未使用' : `已使用(${esc(String(c.used_by || ''))})`;
      const date = new Date(c.created_at * 1000).toISOString().split('T')[0];
      lines.push(`<code>${esc(c.code)}</code> ${c.days}天 [${status}] ${date}`);
    }
    await client.sendMessage(cid, lines.join('\n'), this.fbVipKb());
  }

  async fbPromptLogin(client: TelegramClient, cid: string) {
    await this.setFbLogin(cid, 'login_username');
    await client.sendMessage(cid, '<b>身份验证</b>\n\n使用本机器人需要先登录验证。\n\n快捷登录：\n<code>/login 用户名 密码</code>\n\n或点击下方按钮逐步登录。', { inline_keyboard: [[{ text: '开始登录', callback_data: 'fb_auth:start' }]] });
  }

  async handleFbLoginText(client: TelegramClient, cid: string, text: string): Promise<boolean> {
    const p = await this.getFbLogin(cid); if (!p) return false;
    if (p.action === 'login_username') { const u = text.trim(); if (!u) { await client.sendMessage(cid, '用户名不能为空。', this.loginKbBack('fb_auth')); return true; } await this.setFbLogin(cid, 'login_password', { username: u }); await client.sendMessage(cid, '请输入密码：', this.loginKbBack('fb_auth')); return true; }
    if (p.action === 'login_password') {
      const u = p.username || ''; const pw = text.trim();
      if (u === this.config.authUsername && pw === this.config.authPassword) {
        await this.authenticateUser(cid); await this.clearFbLogin(cid);
        await client.sendMessage(cid, '登录成功！欢迎使用管理中心。', this.fbAdminKb()); await this.fbAdminHome(client, cid);
      } else { await this.setFbLogin(cid, 'login_username'); await client.sendMessage(cid, '用户名或密码错误，请重新输入用户名：', this.loginKbBack('fb_auth')); }
      return true;
    }
    return false;
  }

  async fbAdminHome(client: TelegramClient, cid: string) {
    const unread = await this.store.feedbackCount('unread'); const users = await this.store.feedbackUserCount('unread'); const total = await this.store.feedbackCount();
    await client.sendMessage(cid, `<b>留言管理</b>\n\n未回复留言：${unread} 条\n留言用户：${users} 人\n全部留言：${total} 条\n\n点击【刷新】更新统计，点击【留言】查看未回复留言。`, this.fbAdminKb());
  }

  async fbList(client: TelegramClient, cid: string) {
    const rows = await this.store.listFeedbackMessages('unread', 10);
    if (!rows.length) { await client.sendMessage(cid, '当前没有未回复留言。', this.fbAdminKb()); return; }
    for (const r of rows) { await client.sendMessage(cid, `<b>留言 #${r.id}</b>\n来源 Chat ID：<code>${esc(r.chat_id)}</code>\n\n${esc(r.content)}`, this.fbMsgKb(r.id)); }
  }

  async promptFbReply(client: TelegramClient, cid: string, mid: number) {
    const item = await this.store.getFeedbackMessage(mid); if (!item) { await client.sendMessage(cid, '未找到该留言。', this.fbAdminKb()); return; }
    await this.setFbPending(cid, 'reply', {message_id: mid});
    await client.sendMessage(cid, `<b>回复留言 #${item.id}</b>\n\n用户留言：\n${esc(item.content)}\n\n请直接发送回复内容。`, this.fbAdminKb());
  }

  async handleFbReply(client: TelegramClient, adminCid: string, mid: number, text: string) {
    const item = await this.store.getFeedbackMessage(mid);
    if (!item) { await this.clearFbPending(adminCid); await client.sendMessage(adminCid, '未找到该留言。', this.fbAdminKb()); return; }
    const reply = text.trim(); if (!reply) { await client.sendMessage(adminCid, '回复内容不能为空。', this.fbAdminKb()); return; }
    await this.tg.sendMessage(item.chat_id, `<b>管理员回复</b>\n\n${esc(reply)}`, this.mainKb());
    await this.store.markFeedbackReplied(mid, reply); await this.clearFbPending(adminCid);
    await client.sendMessage(adminCid, `已回复留言 #${mid}，并已同步发送给用户。`, this.fbAdminKb());
  }

  // ── VIP Payment Notification ──
  async notifyVipActivation(chatId: string, orderId: string, amount: number, txHash: string, expireAt: number) {
    const expDate = new Date(expireAt * 1000).toISOString().split('T')[0];
    // Notify user
    await this.tg.sendMessage(chatId, `<b>VIP 开通成功</b>\n\n订单号：<code>${orderId}</code>\n支付金额：${amount} USDT\nTX：<code>${txHash}</code>\n到期时间：${expDate}\n\n预警汇报功能已启用。`, this.mainKb());
    // Notify feedback bot admin
    if (this.fbTg && this.config.feedbackChatId) {
      const msg = `<b>新 VIP 开通</b>\n\n用户：<code>${esc(chatId)}</code>\n金额：${amount} USDT\nTX：<code>${txHash}</code>\n到期时间：${expDate}`;
      await this.fbTg.sendMessage(this.config.feedbackChatId, msg, this.fbAdminKb());
    }
  }

  // ── Agent HTTP API ──
  async handleApiRegister(payload: any): Promise<any> {
    for (const key of ['server_id', 'bind_code', 'agent_secret']) { if (!payload[key]) return { ok: false, error: `缺少参数：${key}` }; }
    const [ok, msg] = await this.store.registerServer(payload.server_id, payload.server_name || payload.server_id, payload.bind_code, payload.agent_secret, payload.report_interval ?? 300, payload.metrics || {}, payload.bind_ip, payload.bind_port);
    return { ok, message: msg };
  }

  async handleApiHeartbeat(server: ServerRow, payload: any): Promise<any> {
    await this.store.updateHeartbeat(server.server_id, payload.metrics || {});
    const fresh = (await this.store.authServer(server.server_id, payload.agent_secret || '')) || server;
    return { ok: true, server_name: fresh.server_name, report_interval: fresh.report_interval ?? 300, bound: !!fresh.chat_id };
  }

  async handleApiPullCommands(server: ServerRow): Promise<any> {
    const fresh = (await this.store.getBoundServer(server.server_id)) || server;
    return { ok: true, server_name: fresh.server_name, report_interval: fresh.report_interval ?? 300, bound: !!fresh.chat_id, commands: await this.store.consumeCommands(server.server_id) };
  }

  async handleApiReport(server: ServerRow, payload: any): Promise<any> {
    const metrics = payload.metrics || {}; const reason = payload.reason || 'scheduled';
    const bound = await this.store.updateReport(server.server_id, metrics);
    if (!bound?.chat_id) return { ok: true, sent: false, message: '服务器尚未绑定 Telegram' };
    const text = buildTextReport(bound, metrics, reason);
    await this.tg.sendMessage(bound.chat_id, text, this.serverKb(bound.server_id));
    await this.sendWarningAlerts(bound, metrics);
    return { ok: true, sent: true };
  }

  async authRequest(serverId: string, agentSecret: string): Promise<ServerRow | null> {
    if (!serverId || !agentSecret) return null;
    return this.store.authServer(serverId, agentSecret);
  }
}

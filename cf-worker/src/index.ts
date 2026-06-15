// Cloudflare Worker entry point for simplemoitor Controller
import { Controller } from './handler';
import { TelegramClient, TelegramUpdate } from './telegram';

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data, null, 0), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function newController(env: Env): Controller {
  return new Controller(env.DB, env.BOT_TOKEN, env.FEEDBACK_BOT_TOKEN || '', {
    API_BASE: env.API_BASE || 'https://api.telegram.org',
    FEEDBACK_CHAT_ID: env.FEEDBACK_CHAT_ID || '',
    AUTH_USERNAME: env.AUTH_USERNAME || '',
    AUTH_PASSWORD: env.AUTH_PASSWORD || '',
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Health check
    if (method === 'GET' && path === '/health') {
      return jsonResponse({ ok: true });
    }

    // Setup webhook (admin only, call manually)
    if (method === 'POST' && path === '/setup-webhook') {
      const baseUrl = `${url.origin}`;
      const mainTg = new TelegramClient(env.BOT_TOKEN, env.API_BASE);
      const fbTg = env.FEEDBACK_BOT_TOKEN ? new TelegramClient(env.FEEDBACK_BOT_TOKEN, env.API_BASE) : null;
      const results: any = {};
      results.main = await mainTg.setWebhook(`${baseUrl}/webhook/main`);
      if (fbTg) results.feedback = await fbTg.setWebhook(`${baseUrl}/webhook/feedback`);
      return jsonResponse({ ok: true, results });
    }

    // Telegram Webhook - main bot
    if (method === 'POST' && path === '/webhook/main') {
      const update: TelegramUpdate = await request.json() as TelegramUpdate;
      const ctrl = newController(env);
      try {
        await ctrl.handleTelegramUpdate(update);
      } catch (e: any) {
        console.error('Main webhook error:', e);
      }
      return jsonResponse({ ok: true });
    }

    // Telegram Webhook - feedback bot
    if (method === 'POST' && path === '/webhook/feedback') {
      const update: TelegramUpdate = await request.json() as TelegramUpdate;
      console.log('FB webhook received:', JSON.stringify(update).slice(0, 200));
      const ctrl = newController(env);
      try {
        await ctrl.handleFeedbackUpdate(update);
        console.log('FB webhook processed OK');
      } catch (e: any) {
        console.error('Feedback webhook error:', e.message || e);
      }
      return jsonResponse({ ok: true });
    }

    // Debug endpoint for testing
    if (method === 'GET' && path === '/debug/fb') {
      const ctrl = newController(env);
      const info: any = {};
      info.hasFbTg = !!ctrl.fbTg;
      info.feedbackChatId = ctrl.config.feedbackChatId;
      info.authRequired = ctrl.isAuthRequired();
      try { info.vipPrice = await ctrl.store.getVipPrice(); } catch(e: any) { info.vipPriceError = e.message; }
      try { info.vipWallet = await ctrl.store.getVipWallet(); } catch(e: any) { info.vipWalletError = e.message; }
      try { info.memberCount = await ctrl.store.vipMemberCount(); } catch(e: any) { info.memberCountError = e.message; }
      return jsonResponse(info);
    }

    // Agent API routes
    if (method === 'POST' && path === '/api/register') {
      const payload = await request.json() as any;
      const ctrl = newController(env);
      const result = await ctrl.handleApiRegister(payload);
      return jsonResponse(result);
    }

    // Authenticated agent endpoints
    if (method === 'POST' && (path === '/api/heartbeat' || path === '/api/pull_commands' || path === '/api/report')) {
      const serverId = request.headers.get('X-Server-Id') || '';
      const agentSecret = request.headers.get('X-Agent-Secret') || '';
      const ctrl = newController(env);
      const server = await ctrl.authRequest(serverId, agentSecret);
      if (!server) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

      if (path === '/api/heartbeat') {
        const payload = await request.json() as any;
        payload.agent_secret = agentSecret;
        return jsonResponse(await ctrl.handleApiHeartbeat(server, payload));
      }
      if (path === '/api/pull_commands') {
        return jsonResponse(await ctrl.handleApiPullCommands(server));
      }
      if (path === '/api/report') {
        const payload = await request.json() as any;
        return jsonResponse(await ctrl.handleApiReport(server, payload));
      }
    }

    return jsonResponse({ ok: false, error: 'not found' }, 404);
  },

  // Cron Trigger - USDT TRC20 payment monitoring
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const ctrl = newController(env);
    const wallet = await ctrl.store.getVipWallet();
    const apiKey = env.TRONGRID_API_KEY;
    if (!wallet || !apiKey) return;

    try {
      // Get scan progress and pending orders
      const lastTimestamp = await ctrl.store.getVipLastBlock();
      const pendingOrders = await ctrl.store.getPendingOrders();
      if (!pendingOrders.length) return; // No pending orders, skip

      // Build amount -> order mapping
      const amountMap = new Map<number, string>();
      for (const o of pendingOrders) {
        amountMap.set(o.amount_unique, o.order_id);
      }

      // Query TronGrid for new USDT transfers
      const { checkAccountTransfers } = await import('./trongrid');
      const { transfers, lastBlock } = await checkAccountTransfers(wallet, lastTimestamp, apiKey);

      // Match transfers to orders
      for (const tx of transfers) {
        const { matchTransferToOrder } = await import('./trongrid');
        const orderId = matchTransferToOrder(tx.amount, amountMap);
        if (!orderId) continue;

        // Get order details
        const order = await ctrl.store.getOrder(orderId);
        if (!order || order.status !== 'pending') continue;

        // Complete order and activate VIP
        await ctrl.store.completeOrder(orderId, tx.txHash);
        const expireAt = await ctrl.store.activateVip(order.chat_id, 30, order.amount_unique);
        await ctrl.notifyVipActivation(order.chat_id, orderId, order.amount_unique, tx.txHash, expireAt);
        console.log(`VIP activated for ${order.chat_id}, order ${orderId}, tx ${tx.txHash}`);
      }

      // Update scan progress
      if (lastBlock > lastTimestamp) {
        await ctrl.store.setVipLastBlock(lastBlock);
      }
    } catch (e: any) {
      console.error('VIP payment check error:', e);
    }
  },
};

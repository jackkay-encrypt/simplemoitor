// Telegram Bot API Client for Cloudflare Workers

export interface InlineKeyboardMarkup {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: CallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  from?: { id: number; is_bot: boolean; first_name: string; username?: string };
  chat: { id: number; type: string };
  date: number;
  text?: string;
}

export interface CallbackQuery {
  id: string;
  from: { id: number };
  message?: TelegramMessage;
  data?: string;
}

export class TelegramClient {
  private botToken: string;
  private apiBase: string;

  constructor(botToken: string, apiBase = 'https://api.telegram.org') {
    this.botToken = botToken;
    this.apiBase = apiBase.replace(/\/$/, '');
  }

  private apiUrl(method: string): string {
    return `${this.apiBase}/bot${this.botToken}/${method}`;
  }

  private async request<T = any>(method: string, data?: Record<string, any>): Promise<T> {
    const options: RequestInit = { method: 'GET' };
    if (data !== undefined) {
      options.method = 'POST';
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(data);
    }
    const response = await fetch(this.apiUrl(method), options);
    const result = await response.json() as any;
    if (!result.ok) {
      throw new Error(`Telegram API error: ${JSON.stringify(result)}`);
    }
    return result.result;
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    replyMarkup?: InlineKeyboardMarkup
  ): Promise<any> {
    const data: Record<string, any> = {
      chat_id: String(chatId),
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };
    if (replyMarkup) {
      data.reply_markup = replyMarkup;
    }
    return this.request('sendMessage', data);
  }

  async answerCallbackQuery(callbackQueryId: string, text = '', showAlert = false): Promise<any> {
    return this.request('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    replyMarkup?: InlineKeyboardMarkup
  ): Promise<any> {
    const data: Record<string, any> = {
      chat_id: String(chatId),
      message_id: String(messageId),
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };
    if (replyMarkup) {
      data.reply_markup = replyMarkup;
    }
    return this.request('editMessageText', data);
  }

  async setWebhook(url: string, secretToken?: string): Promise<any> {
    const data: Record<string, any> = { url };
    if (secretToken) {
      data.secret_token = secretToken;
    }
    return this.request('setWebhook', data);
  }

  async deleteWebhook(): Promise<any> {
    return this.request('deleteWebhook', { drop_pending_updates: true });
  }

  async getUpdates(offset?: number | null, timeout = 25): Promise<TelegramUpdate[]> {
    const data: Record<string, any> = { timeout };
    if (offset) data.offset = offset;
    return this.request('getUpdates', data);
  }
}

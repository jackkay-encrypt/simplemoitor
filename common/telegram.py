# coding: utf-8

import json
import urllib.parse
import urllib.request


class TelegramClient(object):
    def __init__(self, bot_token, api_base='https://api.telegram.org', timeout=20):
        self.bot_token = str(bot_token or '').strip()
        self.api_base = str(api_base or 'https://api.telegram.org').rstrip('/')
        self.timeout = int(timeout or 20)
        if not self.bot_token:
            raise ValueError('缺少 Telegram Bot Token')

    def api_url(self, method):
        return '{}/bot{}/{}'.format(self.api_base, self.bot_token, method)

    def request(self, method, data=None, timeout=None):
        payload = None
        if data is not None:
            payload = urllib.parse.urlencode(data).encode('utf-8')
        request = urllib.request.Request(self.api_url(method), data=payload, method='POST' if payload else 'GET')
        request_timeout = int(timeout or self.timeout)
        with urllib.request.urlopen(request, timeout=request_timeout) as response:
            body = response.read().decode('utf-8')
        result = json.loads(body)
        if not result.get('ok'):
            raise RuntimeError('Telegram API 返回失败：{}'.format(body))
        return result.get('result')

    def get_updates(self, offset=None, timeout=25):
        poll_timeout = int(timeout)
        data = {'timeout': poll_timeout}
        if offset:
            data['offset'] = int(offset)
        return self.request('getUpdates', data, timeout=poll_timeout + 5)

    def send_message(self, chat_id, text, parse_mode='HTML', disable_notification=False, reply_markup=None):
        data = {
            'chat_id': str(chat_id),
            'text': text,
            'parse_mode': parse_mode,
            'disable_web_page_preview': 'true',
            'disable_notification': 'true' if disable_notification else 'false'
        }
        if reply_markup:
            data['reply_markup'] = json.dumps(reply_markup, ensure_ascii=False)
        return self.request('sendMessage', data)

    def answer_callback_query(self, callback_query_id, text='', show_alert=False):
        data = {
            'callback_query_id': str(callback_query_id),
            'show_alert': 'true' if show_alert else 'false'
        }
        if text:
            data['text'] = text
        return self.request('answerCallbackQuery', data)

    def edit_message_text(self, chat_id, message_id, text, parse_mode='HTML', reply_markup=None):
        data = {
            'chat_id': str(chat_id),
            'message_id': str(message_id),
            'text': text,
            'parse_mode': parse_mode,
            'disable_web_page_preview': 'true'
        }
        if reply_markup:
            data['reply_markup'] = json.dumps(reply_markup, ensure_ascii=False)
        return self.request('editMessageText', data)

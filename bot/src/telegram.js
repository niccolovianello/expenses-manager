// The few Bot API methods the bot uses, over plain fetch.
export function createTelegram(token) {
  async function call(method, body) {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!result.ok) throw new Error(`Telegram ${method}: ${result.description ?? response.status}`);
    return result.result;
  }

  return {
    call,
    sendMessage: (chatId, text, extra = {}) => call('sendMessage', { chat_id: chatId, text, ...extra }),
    editMessageText: (chatId, messageId, text, extra = {}) => call('editMessageText', { chat_id: chatId, message_id: messageId, text, ...extra }),
    answerCallbackQuery: (id, text) => call('answerCallbackQuery', { callback_query_id: id, text }),
  };
}

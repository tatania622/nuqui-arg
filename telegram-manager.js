const TelegramBot = require("node-telegram-bot-api");

function normalizeButtons(buttons) {
  if (!buttons) return [];
  if (Array.isArray(buttons) && Array.isArray(buttons[0])) return buttons;
  if (Array.isArray(buttons)) return [buttons];
  throw new TypeError("buttons must be an array or array of arrays");
}

class TelegramManager {
  constructor({ token, chatId, botOptions = {} }) {
    if (!token) throw new Error("Telegram bot token is required");
    this.chatId = chatId ?? null;
    this.bot = new TelegramBot(token, { polling: false, ...botOptions });
  }

  setChatId(chatId) {
    this.chatId = chatId;
  }

  async sendMessage(text, { chatId, ...options } = {}) {
    const targetChatId = chatId ?? this.chatId;
    if (!targetChatId) throw new Error("chatId is required (set it in config or pass it per call)");
    return this.bot.sendMessage(targetChatId, text, options);
  }

  async sendMessageWithButtons(text, buttons, { chatId, ...options } = {}) {
    const inlineKeyboard = normalizeButtons(buttons);
    return this.sendMessage(text, {
      chatId,
      ...options,
      reply_markup: {
        inline_keyboard: inlineKeyboard,
        ...(options.reply_markup || {}),
      },
    });
  }
}

function createTelegramManager({ token, chatId, botOptions } = {}) {
  const resolvedToken = token ?? process.env.TELEGRAM_BOT_TOKEN ?? "";
  const resolvedChatId = chatId ?? process.env.TELEGRAM_CHAT_ID ?? null;
  return new TelegramManager({ token: resolvedToken, chatId: resolvedChatId, botOptions });
}

module.exports = {
  TelegramManager,
  createTelegramManager,
};


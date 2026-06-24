/**
 * webhookRoutes.js — SUPPORT AI Bot
 * ─────────────────────────────────────────────────────────────────────────────
 * Verarbeitet eingehende Telegram-Updates für den eSIM-Berater Support-Bot.
 *
 * Scope: NUR PrivatChat mit Usern (isPrivate === true).
 * Gruppen/Kanal-Management gehört zu einem separaten Service.
 *
 * Token:   process.env.TELEGRAM_BOT_TOKEN
 * Webhook: POST /api/webhooks/telegram
 * Sellauth Webhook: POST /api/webhooks/sellauth
 */
const express          = require('express');
const router           = express.Router();
const supabase         = require('../config/supabase');
const telegramService  = require('../services/telegramService');

// ── Deduplizierung: verhindert Doppelverarbeitung bei Telegram-Retries ────────
const _processedUpdates = new Map();
const _UPDATE_CACHE_MS  = 10 * 60 * 1000; // 10 Minuten

function _rememberUpdate(id) {
  _processedUpdates.set(id, Date.now());
  if (_processedUpdates.size > 1000) {
    const cutoff = Date.now() - _UPDATE_CACHE_MS;
    for (const [k, t] of _processedUpdates)
      if (t < cutoff) _processedUpdates.delete(k);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/telegram
// ─────────────────────────────────────────────────────────────────────────────
router.post('/telegram', (req, res) => {
  // Sofort 200 — verhindert Telegram-Retries bei Verarbeitungszeit > 5s
  res.sendStatus(200);

  setImmediate(async () => {
    try {
      const SUPPORT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      if (!SUPPORT_TOKEN) {
        console.error('[Webhook/Support] TELEGRAM_BOT_TOKEN nicht konfiguriert!');
        return;
      }

      // ── Deduplizierung ──────────────────────────────────────────────────────
      const update_id = req.body?.update_id;
      if (update_id && _processedUpdates.has(update_id)) return;
      if (update_id) _rememberUpdate(update_id);

      // ── Nur echte Nachrichten verarbeiten ───────────────────────────────────
      const msg = req.body.message;
      if (!msg) return; // callback_query, channel_post, my_chat_member etc. ignorieren

      const chatId   = msg.chat?.id?.toString();
      const text     = msg.text?.trim() || msg.caption?.trim() || '';
      const from     = msg.from;
      const isPrivate = msg.chat?.type === 'private';

      // Scope: nur PrivatChat — Gruppen/Kanäle gehören einem separaten Service
      if (!isPrivate) return;

      if (!chatId || !text || !from) return;

      // Bots ignorieren
      if (from.is_bot) return;

      // ── Einstellungen laden (Welcome-Message) ───────────────────────────────
      let settings = null;
      try {
        const { data } = await supabase.from('settings').select('welcome_message').single();
        settings = data;
      } catch (_) {}

      const tgSend = (text, extra = {}) =>
        telegramService.sendMessage(chatId, text, { token: SUPPORT_TOKEN, ...extra });

      // ── /start ──────────────────────────────────────────────────────────────
      if (text === '/start' || text.startsWith('/start@')) {
        const welcome = settings?.welcome_message
          || 'Willkommen beim ValueShop25 Support! 👋\n\nIch helfe dir bei Fragen rund um eSIMs und unsere Tarife. Frag mich einfach!\n\n📋 Bestellung prüfen: /order DEINE_INVOICE_ID';
        await tgSend(welcome);
        return;
      }

      // ── /help ───────────────────────────────────────────────────────────────
      if (text === '/help' || text.startsWith('/help@')) {
        const helpText =
          '📚 <b>So kann ich dir helfen:</b>\n\n' +
          '• Stelle mir Fragen zu unseren eSIM-Tarifen\n' +
          '• Frage nach passenden Ländern oder Datenvolumen\n' +
          '• Frage nach aktuellen Coupons & Aktionen\n\n' +
          '<b>/order</b> &lt;Invoice-ID&gt; — Bestellstatus prüfen\n' +
          '<b>/start</b> — Begrüßung\n\n' +
          'Bei komplexen Anliegen: @autoacts';
        await tgSend(helpText);
        return;
      }

      // ── /order <InvoiceId> ──────────────────────────────────────────────────
      const ID_PATTERN = '([a-f0-9]+-[0-9]+|[0-9]+)';
      const orderMatch =
        text.match(new RegExp('^\\/order\\s+' + ID_PATTERN, 'i')) ||
        text.match(new RegExp('(?:bestellung|invoice|order|rechnung)[:\\s#]+' + ID_PATTERN, 'i'));

      if (orderMatch) {
        const invoiceId = orderMatch[1];
        try {
          const sellauthService = require('../services/sellauthService');
          let sData = null;
          try {
            const { data } = await supabase
              .from('settings')
              .select('sellauth_api_key, sellauth_shop_id, sellauth_shop_url')
              .single();
            sData = data;
          } catch (_) {}
          const saApiKey  = process.env.SELLAUTH_API_KEY  || sData?.sellauth_api_key  || '';
          const saShopId  = process.env.SELLAUTH_SHOP_ID  || sData?.sellauth_shop_id  || '';
          const saShopUrl = process.env.SELLAUTH_SHOP_URL || sData?.sellauth_shop_url || '';

          if (!saApiKey) {
            await tgSend('Bestellabfrage derzeit nicht verfügbar.');
            return;
          }
          const invoice  = await sellauthService.getInvoice(saApiKey, saShopId, invoiceId);
          const response = sellauthService.formatInvoiceForCustomer(invoice, saShopUrl);
          await tgSend(response);
        } catch (_) {
          await tgSend('Bestellung nicht gefunden. Bitte prüfe die Invoice-ID aus deiner Bestätigungs-E-Mail.');
        }
        return;
      }

      // ── Alle anderen Nachrichten → AI ───────────────────────────────────────
      telegramService.sendTypingAction(chatId, { token: SUPPORT_TOKEN }).catch(() => {});

      const messageProcessor = require('../services/messageProcessor');
      await messageProcessor.handle({
        platform: 'telegram',
        chatId,
        text,
        metadata: {
          username:   from.username  || null,
          first_name: from.first_name || 'Nutzer',
          token:      SUPPORT_TOKEN
        }
      });

    } catch (err) {
      console.error('[Webhook/Support] Unhandled:', err.message);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/sellauth — Sellauth Order-Events loggen
// ─────────────────────────────────────────────────────────────────────────────
router.post('/sellauth', (req, res) => {
  res.sendStatus(200);
  setImmediate(async () => {
    try {
      const event = req.body;
      await supabase.from('integration_logs').insert([{
        source:      'sellauth',
        event_type:  event.type || 'unknown',
        payload:     event,
        created_at:  new Date()
      }]);
    } catch (_) {}
  });
});

module.exports = router;

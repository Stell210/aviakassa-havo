Aviakassa_havo — Telegram manager setup

1) Render Environment variables:
TELEGRAM_BOT_TOKEN = new token from BotFather
TELEGRAM_CHAT_ID = 8907504641
TELEGRAM_WEBHOOK_URL = https://aviakassa-havo1.onrender.com/api/telegram/webhook

2) Save and redeploy.
The server will automatically call Telegram setWebhook on startup.

3) When an Instagram client asks for a manager, Telegram receives a lead card with:
- Instagram ID
- route/date/passengers/baggage when known
- status
- buttons: “✅ Взять заявку” and “❌ Закрыть заявку”

4) “Взять заявку” sets ai_leads.status=in_progress and keeps handoff=true.
“Закрыть заявку” sets ai_leads.status=completed and handoff=false.

Never put TELEGRAM_BOT_TOKEN into public code, screenshots, ZIP names, or chat messages.

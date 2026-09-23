Aviakassa_havo — Instagram AI automation

What is included:
- Instagram webhook GET verification and POST message receiver.
- Automatic Instagram DM replies through Meta Graph API v26.0.
- AI language detection and lead extraction for RU/TJ/EN.
- Collects route, dates, passengers, baggage, name and phone when provided.
- Creates/updates ai_leads and ai_messages in PostgreSQL.
- Admin panel section: Instagram AI.
- Optional Telegram notification when a lead is handed to a manager.
- Optional Instagram voice-message transcription via OpenAI.

Render Environment Variables:
Required for Meta:
META_VERIFY_TOKEN=aviakassa_havo_meta_verify_2026
META_ACCESS_TOKEN=<Instagram user access token>
META_GRAPH_VERSION=v26.0

Required for AI replies:
OPENAI_API_KEY=<OpenAI API key>
OPENAI_MODEL=gpt-5.6-luna

Optional:
OPENAI_TRANSCRIBE_MODEL=gpt-transcribe
TELEGRAM_BOT_TOKEN=<Telegram bot token>
TELEGRAM_CHAT_ID=<manager chat id>
AI_AUTO_REPLY=true

Existing variables must remain:
ADMIN_PASSWORD
DATABASE_URL

Meta webhook:
https://aviakassa-havo1.onrender.com/api/instagram/webhook

The app never logs the Meta access token, OpenAI API key, or Telegram bot token.

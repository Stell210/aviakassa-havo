Aviakassa_havo — Instagram AI automation

What is included:
- Instagram webhook GET verification and POST receiver.
- Automatic Instagram DM replies through Meta Graph API.
- REAL AI-generated replies to Instagram comments using OpenAI Responses API.
- Safe fallback replies for comments if OpenAI is temporarily unavailable.
- Duplicate webhook protection: the same Instagram comment is replied to only once after a successful reply; transient OpenAI/Meta failures remain retryable.
- Instagram comment replies use the Graph API form-encoded `/{comment-id}/replies` endpoint.
- Webhook parser accepts comment events even when some payload variants omit `from.id`.
- AI language detection and lead extraction for RU/TJ/EN in Direct messages.
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

Required for automatic comment replies:
INSTAGRAM_COMMENT_AUTO_REPLY=true

Optional:
OPENAI_TRANSCRIBE_MODEL=gpt-transcribe
TELEGRAM_BOT_TOKEN=<manager bot token>
TELEGRAM_CHAT_ID=<manager chat id>
AI_AUTO_REPLY=true
INSTAGRAM_REVIEW_AUTO_REPLY=true

Meta webhook URL:
https://aviakassa-havo1.onrender.com/api/instagram/webhook

IMPORTANT FOR COMMENTS:
1. In the Meta Developer dashboard, the Instagram webhook must subscribe to the `comments` field.
2. The webhook callback URL must be the URL above.
3. The Verify Token in Meta must exactly match META_VERIFY_TOKEN in Render.
4. META_ACCESS_TOKEN must belong to the connected Instagram professional account and have the permissions required by Meta for Instagram comments/replies.
5. INSTAGRAM_COMMENT_AUTO_REPLY must be true.
6. OPENAI_API_KEY must be configured if you want genuinely AI-generated wording. Without it, the site uses the built-in safe fallback replies.

Example:
User comments: "Бехтарин"
AI reply: a short friendly reply in Tajik, such as thanking the user and mentioning Aviakassa_havo naturally.

The app never logs the Meta access token, OpenAI API key, or Telegram bot token.

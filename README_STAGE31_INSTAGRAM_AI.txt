# Stage 31 — AI + Instagram Direct + Comments

This stage unifies the Aviakassa_havo AI flow across Instagram Direct and public comments.

## Direct
- ChatGPT-style general answers plus flight-specific search flow.
- Conversation memory from Stage 29.
- Real flight results from Stage 30 when route/date are known.
- Manager handoff with AI pause so the bot does not talk over a human manager.
- Manager reminders and Telegram controls remain available.
- Voice messages can be transcribed when the required configuration is present.

## Comments
- AI replies to new Instagram comments through the Meta webhook.
- Emoji-only reactions receive a short, warm response and do not trigger flight questions.
- Ticket/price/route/booking questions invite the customer to Direct instead of exposing private booking details publicly.
- AI never invents price, availability, baggage, schedule, or booking confirmation.
- Meta webhook retries are safe: a comment is considered processed only after a reply succeeds.
- Comment replies record whether AI generated the response and whether the comment requested Direct.

## Required environment
META_ACCESS_TOKEN
META_VERIFY_TOKEN
META_GRAPH_VERSION
OPENAI_API_KEY
OPENAI_MODEL
INSTAGRAM_COMMENT_AUTO_REPLY=true
AI_AUTO_REPLY=true
TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (for manager notifications, optional)
DATABASE_URL

## Meta
The Instagram webhook must be publicly reachable over HTTPS and subscribed to the required Instagram messaging/comments events in Meta. The code cannot receive events that Meta does not deliver.

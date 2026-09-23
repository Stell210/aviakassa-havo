STAGE 34 — UNIFIED CHATGPT-STYLE AI

This version keeps the existing Aviakassa_havo AI architecture and strengthens the universal assistant.

Behavior:
- General questions are answered naturally in ChatGPT-style conversation.
- Russian, Tajik and English are supported automatically.
- Conversation history and stored customer memory are supplied to the general assistant.
- Flight/ticket questions remain under the deterministic flight-search flow.
- The flight flow collects route/date context and generates the Travelpayouts White Label search link.
- The system never invents live flight prices or availability.
- Manager handoff remains supported.
- Manager messages in admin chat retain sender name and role, e.g. "Анушервон · Менеджер".
- /api/admin/ai-test remains available to verify the configured OpenAI API/model from the admin session.

Render variables:
OPENAI_API_KEY=your key
OPENAI_MODEL=your enabled OpenAI model (optional; if omitted the project default is gpt-5.6-luna)

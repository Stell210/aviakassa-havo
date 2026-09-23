STAGE 33 — AI diagnostic + manager identity in chat

Changes:
- Kept the existing general AI and flight-intent routing.
- OpenAI model is read from OPENAI_MODEL; default is gpt-5.6-luna.
- Added /api/admin/ai-test for a direct OpenAI connectivity/response test from the admin session.
- OpenAI errors now expose the HTTP status and provider message in the test endpoint and server logs.
- Added sender_name and sender_role columns to ai_messages with safe migrations for existing databases.
- Messages sent from the admin are stored with the authenticated manager name and role=manager.
- Admin CRM chat shows the assigned manager at the top: "👨‍💼 <name>" + "Менеджер".
- Individual manager messages are labeled with the manager's name and "Менеджер".
- No new images were added.

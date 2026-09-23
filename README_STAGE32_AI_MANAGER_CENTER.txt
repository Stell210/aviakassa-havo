Stage 32 — AI Manager Center

Added:
- Admin AI Manager Center with waiting/hot/paused/active/today counters.
- Queue ordered by manager waiting, hot lead, then latest activity.
- Take conversation: assigns current manager, pauses AI, marks in progress.
- Return to AI: clears handoff/pause so AI can continue.
- Manual manager Direct reply from CRM chat using Instagram Graph API.
- Manual replies are stored in ai_messages and update the lead.

Important price architecture:
AI does not invent or magically read a price from rendered HTML. When Stage 30 shows a flight price, the server reads the current flight record from the PostgreSQL `flights` table (or another explicitly connected flight provider/API) and passes those structured fields to the AI/application. The AI formats/explains the supplied data; it is not the source of truth for price, availability, baggage, or schedule.

Stage 32 AI routing fix: non-flight questions always stay in the general ChatGPT-style flow. They never fall through to the flight date prompt. Simple arithmetic has a safe local fallback if OpenAI is temporarily unavailable.

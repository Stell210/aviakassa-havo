Aviakassa_havo — Stage 28 Fix

Исправлено:
- test_parse.js больше не использует жёсткий путь /mnt/data/workdate/server.js.
- Тест теперь берёт server.js из текущей папки проекта через __dirname.
- Исправлен поиск функции parseFlightDetails в тесте под актуальную структуру server.js.

Проверено после исправления:
- server.js — node --check: OK
- script.js — node --check: OK
- testserver.js — node --check: OK
- test_parse.js — node --check: OK
- test_parse.js — 5/5 тестов дат и маршрутов: PASS

Примечание:
Для Render зависимости из package.json устанавливаются автоматически при npm install.

STAGE 29 — AI MEMORY
- Added persistent ai_memory table in PostgreSQL.
- AI keeps a compact long-term memory for each Instagram customer and uses it in general ChatGPT-style replies.
- Memory is refreshed periodically from the conversation instead of on every message to control API usage.
- Sensitive secrets are explicitly excluded from the memory prompt.
- Existing flight lead data remains the source of truth for booking context.
- Recent chat context increased to 30 messages for better continuity.

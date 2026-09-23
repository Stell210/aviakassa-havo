STAGE 30 — WHITE LABEL ONLY

Important architecture rule:
- AI does NOT read flight prices, schedules, baggage or availability from the local `flights` table.
- AI does NOT claim to have live White Label prices.
- With White Label only, AI collects the route/date/passenger details and creates a pre-filled White Label search link.
- The customer sees live availability and prices inside the White Label page itself.
- The local `flights` table may still be used by the site's admin/manual-flight features, but it is NOT an AI source for Instagram pricing or availability.

Do not add a local-flight search to AI unless a real server-side search API is explicitly connected and authorized.

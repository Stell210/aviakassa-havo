Aviakassa_havo — Instagram AI Stage 20

Added automatic Instagram comment replies in Russian, Tajik, and English.

Supported comment types:
- greetings
- price questions
- ticket/flight questions
- baggage questions
- how-to-buy questions
- comments containing a route + departure date
- generic comments

Route + date comments receive a short reply inviting the user to Direct; the bot does not invent live prices in comments.

Important: in Meta Developer Dashboard, subscribe the Instagram app/webhook to the `comments` field. The app already has instagram_business_manage_comments permission in the project configuration.

Environment variable:
INSTAGRAM_COMMENT_AUTO_REPLY=true (default true)
Set to false to disable automatic comment replies.

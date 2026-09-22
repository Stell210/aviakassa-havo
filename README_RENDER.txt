Aviakassa_havo — Render Web Service build

This build is intended to run as a Render Web Service (Node), not a Static Site.

Start command: npm start
Build command: npm install

Required Render Environment Variables:
- ADMIN_PASSWORD — the admin password you choose
- DATABASE_URL — the Internal Database URL of your EXISTING PostgreSQL database

Do not create a second database just because this ZIP contains render.yaml. Keep your existing PostgreSQL and put its Internal Database URL into DATABASE_URL.

Instagram Webhook callback:
https://aviakassahavo.onrender.com/api/instagram/webhook

Instagram Login callback:
https://aviakassahavo.onrender.com/auth/instagram/callback

Important: an existing Render Static Site cannot be turned into a Node Web Service merely by uploading a ZIP. Create/deploy a Web Service from the same repository and use the commands above, or use the included render.yaml as a Blueprint.

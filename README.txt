Aviakassa_havo v55 — Travelpayouts White Label

- Flight search and ticket results on the public site use Travelpayouts White Label Web.
- White Label ID: 21705 (can be overridden by TRAVELPAYOUTS_WHITE_LABEL_ID in Render).
- Optional TRAVELPAYOUTS_API_TOKEN is kept server-side and is never exposed in the browser.
- Legacy flight-provider integration has been removed from this version.
- The former social-video generator UI has been removed.
- Travelpayouts Drive is disabled on the public page.
- White Label containers: #tpwl-search and #tpwl-tickets.
- The public page sets resultsURL to the current page so search results stay on Aviakassa_havo.

Render environment variables:
DATABASE_URL
ADMIN_PASSWORD
TRAVELPAYOUTS_API_TOKEN (optional)
TRAVELPAYOUTS_WHITE_LABEL_ID (optional; default 21705)

Do not put secret credentials into GitHub or frontend code.

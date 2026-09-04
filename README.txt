Aviakassa_havo v39 — Travelport TripServices + full RU/TJ/EN interface localization

Changes from v38:
- Kept Travelport TripServices as the only flight search provider. Aviasales Data API remains removed from application code.
- Completed RU / TJ / EN localization of the public interface.
- Added translations for search form labels, filters, sorting, offers section, current flights section, status texts, empty/error states and dynamic flight-card labels.
- Language selection is preserved in localStorage.
- Admin panel keeps RU / TJ / EN and now translates additional dynamic notifications and API errors.
- No changes to Travelport credentials or search API configuration.

Render environment variables:
TRAVELPORT_CLIENT_ID
TRAVELPORT_CLIENT_SECRET
TRAVELPORT_USERNAME
TRAVELPORT_PASSWORD
TRAVELPORT_PCC
TRAVELPORT_AUTH_URL (optional; trial page may use https://auth.pp.travelport.com/oauth/token)
TRAVELPORT_API_URL (optional; pre-production API: https://api.pp.travelport.net/11/air/catalog/search/catalogproductofferings)
TRAVELPORT_CONTENT_SOURCES (optional; default GDS,NDC)
FLIGHT_MARKUP_RUB (optional; default 500)

Important: do not put credentials into GitHub or frontend code. Keep them in Render environment variables.

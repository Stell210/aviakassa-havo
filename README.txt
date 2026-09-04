Aviakassa_havo v11

Обновление админ-панели:
- WhatsApp одним нажатием из карточки заявки.
- Полная карточка заявки.
- Статистика: сегодня / 7 дней / месяц / всего.
- Несколько менеджеров с отдельными логинами и паролями.
- Усиленная авторизация: временные сессии и ограничение попыток входа.
- Рейсы: город, страна, дата, время, авиакомпания, багаж, цена.
- Акции.
- Направления.
- Экспорт заявок в настоящий Excel (.xlsx), включая текущие фильтры.

Render:
- Web Service должен иметь DATABASE_URL, указывающий на aviakassa-db.
- ADMIN_PASSWORD используется как мастер-пароль пользователя admin.
- После обновления дождитесь успешного Deploy.

Важно: фотографии в этот ZIP не добавлялись.


V14 fixes: mobile admin layout, loading of flights/offers/directions, editable forms with existing values, active visibility checkbox, safer partial PATCH updates.


v17 SECURITY: admin password change, manager permissions, manager session revocation, global logout-all, server-side permission enforcement.

GLOBAL AIRPORT AUTOCOMPLETE (v27)
---------------------------------
The admin flight form now uses a worldwide airport catalog loaded from the
world-countries-cities-db CDN. The airport dataset is derived from OurAirports
and contains large/medium airports plus airports with IATA codes.

Flow: type a city -> choose a city suggestion (country + airport examples + IATA)
-> choose the airport -> airport name and IATA code are filled automatically.
The form keeps a local fallback catalog and browser cache if the external catalog
cannot be reached.


NEW: Aviasales Data API search
------------------------------
- Public flight search now uses /api/live-search-flights.
- The server reads AVIASALES_API_TOKEN from Render Environment Variables.
- Only non-stop results are requested (direct=true).
- Displayed price = Aviasales Data API price + 500 RUB.
- No purchase/booking is performed on Aviakassa_havo.
- Data API does not provide baggage/hand-baggage details in this endpoint, so the UI
  displays "Уточняется" rather than inventing baggage allowances.
- Travelpayouts Drive code was added to index.html as instructed by the user's
  Travelpayouts installation page.

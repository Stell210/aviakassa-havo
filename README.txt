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

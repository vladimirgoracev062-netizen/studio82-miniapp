# STUDIO 82 — CDEK stage 1

Что добавлено:

- В checkout теперь один вариант `СДЭК`.
- Внутри СДЭК клиент выбирает `ПВЗ / постамат` или `Курьер до адреса`.
- Добавлен поиск города через CDEK API.
- Для ПВЗ загружается список пунктов выдачи/постаматов.
- Для курьера клиент вводит адрес.
- Добавлен расчет стоимости доставки СДЭК.
- Итоговая сумма = товары + доставка СДЭК.
- Данные СДЭК сохраняются в заказ и видны в админке / Мои заказы.

## 1. SQL для Supabase

Открой Supabase → SQL Editor → New query и выполни:

`sql/01_cdek_stage1_orders.sql`

## 2. Переменные Vercel

Добавить в Vercel → Settings → Environment Variables:

```env
CDEK_BASE_URL=https://api.edu.cdek.ru
CDEK_CLIENT_ID=...
CDEK_CLIENT_SECRET=...
CDEK_FROM_CITY_CODE=44
CDEK_PACKAGE_WEIGHT_GRAMS=1200
CDEK_PACKAGE_LENGTH_CM=35
CDEK_PACKAGE_WIDTH_CM=25
CDEK_PACKAGE_HEIGHT_CM=15
```

Сначала используй тестовую среду `https://api.edu.cdek.ru`.
После проверки можно заменить на `https://api.cdek.ru`.

## 3. Проверка ключей

После деплоя открой:

```text
https://studio82-miniapp.vercel.app/api/cdek/test?password=admin82
```

Должно быть `ok: true`.

## 4. Проверка checkout

- Открой Mini App в Telegram.
- Корзина → Оформить заказ.
- Выбери СДЭК.
- Найди город.
- Выбери ПВЗ или курьера.
- Нажми `Рассчитать доставку СДЭК`.
- Проверь итог: товар + доставка.

Создание отправления в СДЭК и статусы доставки — следующий этап после того, как расчет стабильно заработает.

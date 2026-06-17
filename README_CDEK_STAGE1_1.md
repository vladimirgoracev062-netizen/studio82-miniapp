# STUDIO 82 — CDEK stage 1.1

Что добавлено:

- Адрес отправки зафиксирован как `Москва, улица Пришвина 26`.
- Расчёт СДЭК теперь учитывает количество пар в корзине.
- Базовая коробка: `35 × 25 × 15 см`, `1200 г`.
- Если в заказе 2 пары, расчёт идёт как `35 × 25 × 30 см`, `2400 г`; 3 пары — `35 × 25 × 45 см`, `3600 г`.
- В checkout добавлен поиск ПВЗ/постаматов по улице, адресу или метро.
- ПВЗ и постаматы разделены вкладками. По умолчанию открываются ПВЗ.
- В результате расчёта показываются габариты, по которым СДЭК посчитал доставку.

Переменные Vercel:

```env
CDEK_BASE_URL=https://api.cdek.ru
CDEK_CLIENT_ID=...
CDEK_CLIENT_SECRET=...
CDEK_FROM_CITY_CODE=44
CDEK_SENDER_ADDRESS=Москва, улица Пришвина 26
CDEK_PACKAGE_WEIGHT_GRAMS=1200
CDEK_PACKAGE_LENGTH_CM=35
CDEK_PACKAGE_WIDTH_CM=25
CDEK_PACKAGE_HEIGHT_CM=15
```

Проверка:

```text
https://studio82-miniapp.vercel.app/api/cdek/test?password=admin82
```

В ответе должны быть `onePairPackage` и `twoPairsPackage`.

Важно: автоматические реальные статусы СДЭК появятся на следующем этапе после создания отправления в СДЭК и получения `cdek_number` / `uuid`.

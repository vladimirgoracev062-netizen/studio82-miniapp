# YooKassa stage 1.2 — auth fallback for payment creation

Исправление для ошибки при создании платежа:

`ЮKassa API 401: Authentication type is not allowed`

Что изменено:

- основной запрос по-прежнему использует `YOOKASSA_SHOP_ID + YOOKASSA_SECRET_KEY`;
- если `/v3/me` проходит, но `/v3/payments` возвращает ошибку типа `Authentication type is not allowed`, сервер пробует повторить создание платежа через `account_id`, который сама ЮKassa вернула в `/v3/me`;
- если повтор тоже не проходит, ошибка становится понятнее и покажет оба результата.

Переменные Vercel менять не нужно.
SQL выполнять не нужно.

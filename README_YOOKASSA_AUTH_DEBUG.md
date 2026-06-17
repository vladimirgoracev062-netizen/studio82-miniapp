# YooKassa auth debug / fix

Что изменено:
- `/api/yookassa/test?password=admin82` теперь реально проверяет авторизацию в ЮKassa через `/v3/me`, а не просто наличие переменных.
- Ошибки ЮKassa теперь показывают `code`, `parameter` и `id` ошибки.
- Добавлена диагностика: `shopIdLooksNumeric`, `secretKeyPrefix`, `secretLooksLikeTestOrLiveKey`, `secretLooksLikeBearerOrOAuth`, `secretContainsSpaces`.
- Idempotence-Key теперь отправляется только для POST/PUT/PATCH, не для GET.

После деплоя открой:
https://studio82-miniapp.vercel.app/api/yookassa/test?password=admin82

Если `apiAuth.ok: true` — авторизация проходит, можно снова пробовать оплату.
Если `apiAuth.ok: false` — проблема именно в паре `YOOKASSA_SHOP_ID` / `YOOKASSA_SECRET_KEY` или в типе ключа.

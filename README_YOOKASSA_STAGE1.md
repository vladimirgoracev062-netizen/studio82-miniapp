# STUDIO 82 — YooKassa stage 1

Что добавлено:

- Оплата через ЮKassa для всех заказов.
- Для СДЭК сумма платежа = товары + доставка СДЭК.
- Для доставки по Москве сумма платежа = товары; чат с менеджером открывается только после оплаты.
- После успешной оплаты заказ получает `payment_status = paid`, а статус заказа — `Оплачен`.
- В “Мои заказы” появилась кнопка оплаты для неоплаченных заказов.
- После оплаты московского заказа появляется кнопка “Написать менеджеру по доставке”.
- Добавлены endpoint'ы:
  - `/api/yookassa/pay`
  - `/api/yookassa/check`
  - `/api/yookassa/webhook`
  - `/api/yookassa/test?password=admin82`

## Supabase SQL

Выполнить файл:

`sql/01_cdek_stage1_orders.sql`

Он добавляет поля для YooKassa:

- `yookassa_payment_url`
- `paid_at`

## Vercel Environment Variables

Добавить:

```env
YOOKASSA_SHOP_ID=...
YOOKASSA_SECRET_KEY=...
YOOKASSA_RETURN_URL=https://studio82-miniapp.vercel.app/profile
YOOKASSA_WEBHOOK_SECRET=любой_длинный_секрет
```

Потом сделать Redeploy without cache.

## Проверка

Открыть:

`https://studio82-miniapp.vercel.app/api/yookassa/test?password=admin82`

Должно быть `ok: true`.

## Webhook YooKassa

В личном кабинете YooKassa указать URL уведомлений:

`https://studio82-miniapp.vercel.app/api/yookassa/webhook?secret=ТВОЙ_YOOKASSA_WEBHOOK_SECRET`

События:

- `payment.succeeded`
- `payment.canceled`

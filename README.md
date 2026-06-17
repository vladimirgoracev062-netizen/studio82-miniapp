# STUDIO 82 Mini App — customer identity fix

Что добавлено:

- клиент видит только свои заказы по Telegram ID;
- сервер проверяет Telegram `initData`, а не доверяет ID из браузера;
- если Mini App открыт не внутри Telegram, раздел заказов больше не отдаёт все заказы;
- оформление заказа требует запуск через Telegram;
- добавлен запрос номера телефона через Telegram WebApp `requestContact`;
- добавлен webhook для сохранения номера телефона в Supabase;
- поле телефона в оформлении заказа автоматически заполняется, если пользователь поделился номером.

## SQL для Supabase

Выполнить в SQL Editor перед/после деплоя:

```sql
create table if not exists customer_profiles (
  telegram_id text primary key,
  telegram_username text,
  first_name text,
  last_name text,
  phone text,
  updated_at timestamptz not null default now()
);

alter table customer_profiles enable row level security;

drop policy if exists "Public can read customer profiles" on customer_profiles;
drop policy if exists "Public can insert customer profiles" on customer_profiles;
drop policy if exists "Public can update customer profiles" on customer_profiles;

-- Публичный доступ к профилям запрещён. Сервер работает через service_role.
create policy "No public customer profile access"
on customer_profiles for all
using (false)
with check (false);

-- Закрываем прямое чтение заказов через публичный anon key.
drop policy if exists "Public can read own orders later" on orders;
drop policy if exists "Public can read order items later" on order_items;

create policy "No public orders access"
on orders for select
using (false);

create policy "No public order items access"
on order_items for select
using (false);
```

## Webhook Telegram для контактов

После деплоя выполнить в браузере, подставив токен своего бота:

```text
https://api.telegram.org/botТВОЙ_ТОКЕН/setWebhook?url=https://studio82-miniapp.vercel.app/api/telegram-webhook
```

Потом можно проверить:

```text
https://api.telegram.org/botТВОЙ_ТОКЕН/getWebhookInfo
```

## Проверка

1. Открыть Mini App с Telegram-аккаунта №1.
2. Оформить заказ.
3. Открыть раздел «Заказы» — виден только заказ аккаунта №1.
4. Открыть Mini App с Telegram-аккаунта №2.
5. Раздел «Заказы» не должен показывать заказы аккаунта №1.
6. На оформлении нажать «Получить номер из Telegram» — после согласия телефон должен подтянуться в поле телефона.


## CDEK stage 1.4

Скрыты технические детали расчёта СДЭК от покупателя. Цена доставки в checkout равна цене из СДЭК API без ручной наценки.

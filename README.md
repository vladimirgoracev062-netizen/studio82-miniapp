# STUDIO 82 Telegram Mini App

Next.js версия магазина STUDIO 82.

## Что есть

- Каталог товаров
- Карточки товара
- Размеры: доступные активные, недоступные серые
- Корзина
- Оформление заказа
- Личный кабинет / заказы
- Админка `/admin`
- Добавление и редактирование товаров
- Загрузка фото в Supabase Storage
- Хранение товаров, остатков и заказов в Supabase

## Переменные Vercel

```env
NEXT_PUBLIC_ADMIN_PASSWORD=admin82
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` нельзя публиковать в открытом доступе.


## Telegram notifications

Для уведомлений о новых заказах добавьте в Vercel переменные:

```env
TELEGRAM_BOT_TOKEN=bot_token_from_BotFather
TELEGRAM_ADMIN_CHAT_ID=your_numeric_chat_id_or_group_chat_id
```

После изменения переменных сделайте Redeploy без build cache.

## Telegram notification debug
After deploy, open this URL to test Vercel-side Telegram notifications:

`https://studio82-miniapp.vercel.app/api/telegram-test?password=admin82`

If it returns `{"ok":true}`, Vercel can send Telegram messages.

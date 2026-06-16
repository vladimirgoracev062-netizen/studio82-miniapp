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

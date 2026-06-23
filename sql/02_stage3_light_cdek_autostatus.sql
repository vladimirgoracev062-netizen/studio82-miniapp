-- STUDIO 82 — Stage 3 light
-- Безопасная миграция для раздельного адреса курьерской доставки СДЭК.
-- Выполнять в Supabase SQL Editor один раз.

alter table public.orders
  add column if not exists cdek_recipient_street text,
  add column if not exists cdek_recipient_house text,
  add column if not exists cdek_recipient_flat text,
  add column if not exists cdek_recipient_comment text;

comment on column public.orders.cdek_recipient_street is 'СДЭК курьер: улица получателя';
comment on column public.orders.cdek_recipient_house is 'СДЭК курьер: дом/корпус/строение';
comment on column public.orders.cdek_recipient_flat is 'СДЭК курьер: квартира/офис';
comment on column public.orders.cdek_recipient_comment is 'СДЭК курьер: комментарий для курьера';

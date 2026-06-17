alter table orders add column if not exists cdek_delivery_mode text;
alter table orders add column if not exists cdek_city_code integer;
alter table orders add column if not exists cdek_point_code text;
alter table orders add column if not exists cdek_point_address text;
alter table orders add column if not exists cdek_recipient_address text;
alter table orders add column if not exists cdek_delivery_price integer not null default 0;
alter table orders add column if not exists cdek_tariff_code integer;
alter table orders add column if not exists cdek_order_uuid text;
alter table orders add column if not exists cdek_status text;
alter table orders add column if not exists cdek_status_description text;
alter table orders add column if not exists cdek_status_updated_at timestamptz;

comment on column orders.cdek_delivery_mode is 'pickup или courier';
comment on column orders.cdek_delivery_price is 'Стоимость доставки СДЭК в рублях, входит в total_amount';

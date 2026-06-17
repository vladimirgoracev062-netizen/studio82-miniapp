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
alter table orders add column if not exists cdek_package_pair_count integer;
alter table orders add column if not exists cdek_package_type text;
alter table orders add column if not exists cdek_package_box_count integer;
alter table orders add column if not exists cdek_package_weight integer;
alter table orders add column if not exists cdek_package_length integer;
alter table orders add column if not exists cdek_package_width integer;
alter table orders add column if not exists cdek_package_height integer;

comment on column orders.cdek_delivery_mode is 'pickup или courier';
comment on column orders.cdek_delivery_price is 'Стоимость доставки СДЭК в рублях, входит в total_amount';

comment on column orders.cdek_package_pair_count is 'Количество пар обуви для расчёта СДЭК';
comment on column orders.cdek_package_type is 'Тип упаковки СДЭК для расчёта: L, XL, XL×4 + L и т.п.';
comment on column orders.cdek_package_box_count is 'Количество грузовых мест/коробов для расчёта СДЭК';
comment on column orders.cdek_package_height is 'Высота основного короба СДЭК для расчёта';

alter table orders add column if not exists cdek_number text;

comment on column orders.cdek_order_uuid is 'UUID отправления СДЭК после создания через API';
comment on column orders.cdek_number is 'Номер отправления СДЭК, если СДЭК вернул его отдельно';
comment on column orders.cdek_tracking_number is 'Трек-номер/номер отправления СДЭК для клиента';

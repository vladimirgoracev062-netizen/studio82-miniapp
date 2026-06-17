# CDEK stage 2.1 — shipment_point fix

Исправлено создание отправления СДЭК.

Что изменено:
- добавлен код ПВЗ отправки `CDEK_SHIPMENT_POINT_CODE=MSK1305`;
- при создании заказа в СДЭК теперь передаётся `shipment_point`;
- для ПВЗ получателя передаётся `delivery_point`;
- для курьера получателя передаётся адрес в `to_location.address`;
- ошибка СДЭК теперь возвращается подробнее.

После установки добавьте в Vercel:

```env
CDEK_SHIPMENT_POINT_CODE=MSK1305
```

И сделайте Redeploy without cache.

import { NextResponse } from 'next/server';
import { cdekRequest, getCdekConfig, getCdekErrorMessage, getCdekOrderInfo, getCdekPackageForPairs, getOrderStatusFromCdekStatus, normalizeCdekPhone } from '@/lib/cdek-server';
import { getSupabaseAdmin, isAdminRequest, orderFromRow } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getOrderItemPairs(items: any[]) {
  return Math.max(1, items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0));
}

function getDeclaredValueForOrder(items: any[]) {
  return Math.max(1, Math.round(items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0)));
}

function buildWareKey(value: string, fallback: string) {
  // Это поле видно в ЛК СДЭК как «артикул». Поэтому не используем технические slug/заглушки
  // вроде studio82-shoes-1, а передаём понятный текст: модель, цвет и размер.
  const cleaned = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

function buildUnitItems(items: any[]) {
  const unitItems: Array<{ name: string; wareKey: string; price: number }> = [];

  items.forEach((item: any, itemIndex: number) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const title = String(item.product_title || item.title || 'Кроссовки STUDIO 82').trim();
    const size = String(item.size || '').trim();
    const name = size ? `${title}, размер ${size}` : title;
    const price = Math.max(1, Math.round(Number(item.price || 0)));

    for (let copyIndex = 0; copyIndex < quantity; copyIndex += 1) {
      const wareKey = buildWareKey(name, `STUDIO 82 ${itemIndex + 1}-${copyIndex + 1}`);
      unitItems.push({ name, wareKey, price });
    }
  });

  return unitItems.length ? unitItems : [{ name: 'Кроссовки STUDIO 82', wareKey: 'Кроссовки STUDIO 82', price: 1 }];
}

function buildCdekPackages(order: any, items: any[]) {
  const pairCount = Number(order.cdek_package_pair_count || getOrderItemPairs(items));
  const cdekPackage = getCdekPackageForPairs(pairCount);
  const unitItems = buildUnitItems(items);
  let cursor = 0;

  return cdekPackage.boxes.map((box, index) => {
    const packageUnits = unitItems.slice(cursor, cursor + box.pairs);
    cursor += box.pairs;
    const units = packageUnits.length ? packageUnits : unitItems.slice(-1);
    const unitWeight = Math.max(1, Math.round(box.weight / Math.max(1, units.length)));

    return {
      number: String(index + 1),
      comment: `STUDIO 82 ${box.type}`,
      weight: box.weight,
      length: box.length,
      width: box.width,
      height: box.height,
      items: units.map((unit) => ({
        name: unit.name,
        ware_key: unit.wareKey,
        payment: { value: 0 },
        cost: unit.price,
        weight: unitWeight,
        amount: 1,
      })),
    };
  });
}

function buildPayload(order: any) {
  const config = getCdekConfig();
  const items = order.order_items || [];
  const phone = normalizeCdekPhone(order.customer_phone);
  if (!phone) throw new Error('У заказа нет телефона клиента');
  if (!config.senderPhone) throw new Error('Добавьте CDEK_SENDER_PHONE в Vercel для создания отправлений СДЭК');
  if (!config.shipmentPointCode) throw new Error('Добавьте CDEK_SHIPMENT_POINT_CODE в Vercel — код ПВЗ, откуда вы сдаёте заказы');
  if (!order.cdek_city_code) throw new Error('У заказа нет города СДЭК');
  if (order.delivery_type !== 'cdek') throw new Error('Этот заказ не является доставкой СДЭК');

  const mode = order.cdek_delivery_mode === 'courier' ? 'courier' : 'pickup';
  const declaredValue = getDeclaredValueForOrder(items);
  if (mode === 'pickup' && !order.cdek_point_code) throw new Error('У заказа не выбран ПВЗ/постамат СДЭК');
  if (mode === 'courier' && !order.cdek_recipient_address) throw new Error('У заказа нет адреса курьерской доставки');

  const payload: any = {
    type: 1,
    number: `studio82-${String(order.order_number || order.id).replace(/[^a-zA-Z0-9-]/g, '')}`,
    comment: 'STUDIO 82 Mini App',
    tariff_code: Number(order.cdek_tariff_code || (mode === 'courier' ? 137 : 136)),
    sender: {
      company: 'STUDIO 82',
      name: config.senderName || 'STUDIO 82',
      phones: [{ number: normalizeCdekPhone(config.senderPhone) }],
    },
    recipient: {
      name: order.customer_name || 'Покупатель STUDIO 82',
      phones: [{ number: phone }],
    },
    // Магазин сдаёт посылку в конкретный ПВЗ СДЭК.
    // shipment_point — откуда сдаём, delivery_point или to_location — куда доставляем.
    shipment_point: config.shipmentPointCode,
    packages: buildCdekPackages(order, items),
    services: declaredValue > 0 ? [{ code: 'INSURANCE', parameter: String(declaredValue) }] : undefined,
  };

  if (mode === 'pickup') {
    // Важно: для доставки до ПВЗ/постамата передаём только delivery_point.
    // Если вместе с delivery_point отправить to_location, СДЭК считает это двумя адресами получателя
    // и возвращает ошибку v2_delivery_address_multivalued.
    payload.delivery_point = order.cdek_point_code;
  } else {
    // Для курьерской доставки delivery_point не передаём, нужен конкретный адрес получателя.
    payload.to_location = {
      code: Number(order.cdek_city_code),
      address: order.cdek_recipient_address,
    };
  }

  return payload;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: order, error } = await supabase.from('orders').select('*, order_items(*)').eq('id', params.id).single();
    if (error) throw error;
    if (!order) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });

    if (order.cdek_order_uuid) {
      const info = await getCdekOrderInfo(order.cdek_order_uuid);
      const patch = {
        cdek_tracking_number: info.cdekNumber || order.cdek_tracking_number || '',
        cdek_status: info.status.code || order.cdek_status || 'CREATED',
        cdek_status_description: info.status.description || order.cdek_status_description || 'Отправление создано, ожидает передачи в СДЭК',
        cdek_status_updated_at: new Date().toISOString(),
        order_status: getOrderStatusFromCdekStatus(info.status.code, info.status.description),
      };
      await supabase.from('orders').update(patch).eq('id', params.id);
      const { data: updated } = await supabase.from('orders').select('*, order_items(*)').eq('id', params.id).single();
      return NextResponse.json({ ok: true, alreadyCreated: true, order: orderFromRow(updated || { ...order, ...patch }) });
    }

    const payload = buildPayload(order);
    const data = await cdekRequest('/v2/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const uuid = String(data?.entity?.uuid || '').trim();
    if (!uuid) {
      const message = getCdekErrorMessage(data, 'СДЭК не вернул UUID созданного отправления');
      throw new Error(message);
    }

    let cdekNumber = '';
    let statusCode = 'CREATED';
    let statusDescription = 'Отправление создано, ожидает передачи в СДЭК';

    try {
      const info = await getCdekOrderInfo(uuid);
      cdekNumber = info.cdekNumber;
      statusCode = info.status.code || statusCode;
      statusDescription = info.status.description || statusDescription;
    } catch (syncError) {
      console.warn('[cdek] shipment created, but status sync failed', syncError);
    }

    const patch = {
      cdek_order_uuid: uuid,
      cdek_tracking_number: cdekNumber,
      cdek_status: statusCode,
      cdek_status_description: statusDescription,
      cdek_status_updated_at: new Date().toISOString(),
      order_status: getOrderStatusFromCdekStatus(statusCode, statusDescription),
    };

    const update = await supabase.from('orders').update(patch).eq('id', params.id);
    if (update.error) throw update.error;

    const { data: updated } = await supabase.from('orders').select('*, order_items(*)').eq('id', params.id).single();
    return NextResponse.json({ ok: true, uuid, cdekNumber, order: orderFromRow(updated || { ...order, ...patch }) });
  } catch (error: any) {
    console.error('[cdek] create shipment failed', error);
    return NextResponse.json({
      error: error.message || 'Не удалось создать отправление СДЭК',
      hint: 'Проверьте CDEK_SHIPMENT_POINT_CODE, CDEK_SENDER_PHONE, выбранный ПВЗ/адрес и данные клиента.',
    }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { cdekRequest, getCdekConfig, getCdekOrderInfo, getCdekPackageForPairs, normalizeCdekPhone } from '@/lib/cdek-server';
import { getSupabaseAdmin, isAdminRequest, orderFromRow } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getOrderItemPairs(items: any[]) {
  return Math.max(1, items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0));
}

function buildCdekPackages(order: any, items: any[]) {
  const pairCount = Number(order.cdek_package_pair_count || getOrderItemPairs(items));
  const cdekPackage = getCdekPackageForPairs(pairCount);
  const goodsTotal = Math.max(1, items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0));
  const pricePerPair = Math.max(1, Math.round(goodsTotal / cdekPackage.pairCount));

  return cdekPackage.boxes.map((box, index) => ({
    number: String(index + 1),
    comment: `STUDIO 82 ${box.type}`,
    weight: box.weight,
    length: box.length,
    width: box.width,
    height: box.height,
    items: [
      {
        name: 'Кроссовки STUDIO 82',
        ware_key: `studio82-shoes-${index + 1}`,
        payment: { value: 0 },
        cost: pricePerPair,
        weight: Math.max(1, Math.round(box.weight / Math.max(1, box.pairs))),
        amount: box.pairs,
      },
    ],
  }));
}

function buildPayload(order: any) {
  const config = getCdekConfig();
  const items = order.order_items || [];
  const phone = normalizeCdekPhone(order.customer_phone);
  if (!phone) throw new Error('У заказа нет телефона клиента');
  if (!config.senderPhone) throw new Error('Добавьте CDEK_SENDER_PHONE в Vercel для создания отправлений СДЭК');
  if (!order.cdek_city_code) throw new Error('У заказа нет города СДЭК');
  if (order.delivery_type !== 'cdek') throw new Error('Этот заказ не является доставкой СДЭК');

  const mode = order.cdek_delivery_mode === 'courier' ? 'courier' : 'pickup';
  if (mode === 'pickup' && !order.cdek_point_code) throw new Error('У заказа не выбран ПВЗ/постамат СДЭК');
  if (mode === 'courier' && !order.cdek_recipient_address) throw new Error('У заказа нет адреса курьерской доставки');

  const payload: any = {
    type: 1,
    number: `studio82-${String(order.order_number || order.id).replace(/[^a-zA-Z0-9-]/g, '')}`,
    comment: 'STUDIO 82 Mini App',
    tariff_code: Number(order.cdek_tariff_code || (mode === 'courier' ? 137 : 136)),
    sender: {
      name: config.senderName || 'STUDIO 82',
      phones: [{ number: normalizeCdekPhone(config.senderPhone) }],
    },
    recipient: {
      name: order.customer_name || 'Покупатель STUDIO 82',
      phones: [{ number: phone }],
    },
    from_location: {
      code: config.fromCityCode,
      address: config.senderAddress,
    },
    to_location: {
      code: Number(order.cdek_city_code),
    },
    packages: buildCdekPackages(order, items),
  };

  if (mode === 'pickup') {
    payload.delivery_point = order.cdek_point_code;
  } else {
    payload.to_location.address = order.cdek_recipient_address;
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
        cdek_status_description: info.status.description || order.cdek_status_description || 'Создано в СДЭК',
        cdek_status_updated_at: new Date().toISOString(),
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
      const message = data?.requests?.[0]?.errors?.[0]?.message || 'СДЭК не вернул UUID созданного отправления';
      throw new Error(message);
    }

    let cdekNumber = '';
    let statusCode = 'CREATED';
    let statusDescription = 'Создано в СДЭК';

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
      order_status: 'Передан в СДЭК',
    };

    const update = await supabase.from('orders').update(patch).eq('id', params.id);
    if (update.error) throw update.error;

    const { data: updated } = await supabase.from('orders').select('*, order_items(*)').eq('id', params.id).single();
    return NextResponse.json({ ok: true, uuid, cdekNumber, order: orderFromRow(updated || { ...order, ...patch }) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось создать отправление СДЭК' }, { status: 500 });
  }
}

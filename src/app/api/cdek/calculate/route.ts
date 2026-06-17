import { NextResponse } from 'next/server';
import { cdekRequest, getCdekConfig, getCdekTariffCode, getCdekPackageForPairs, type CdekDeliveryMode } from '@/lib/cdek-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mode = (body.mode || 'pickup') as CdekDeliveryMode;
    const cityCode = Number(body.cityCode || 0);
    const address = String(body.address || '').trim();
    const pairCount = Math.max(1, Number(body.packageQuantity || body.pairCount || 1));
    const declaredValue = Math.max(0, Math.round(Number(body.declaredValue || body.goodsTotal || 0)));

    if (!cityCode) return NextResponse.json({ error: 'Выберите город СДЭК' }, { status: 400 });
    if (mode === 'courier' && address.length < 5) return NextResponse.json({ error: 'Укажите адрес для курьерской доставки' }, { status: 400 });

    const config = getCdekConfig();
    const tariffCode = getCdekTariffCode(mode);
    const cdekPackage = getCdekPackageForPairs(pairCount);
    const payload: any = {
      tariff_code: tariffCode,
      from_location: { code: config.fromCityCode },
      to_location: { code: cityCode },
      packages: cdekPackage.boxes.map((box, index) => ({
        number: String(index + 1),
        weight: box.weight,
        length: box.length,
        width: box.width,
        height: box.height,
      })),
    };

    // СДЭК отдельно добавляет сбор за объявленную стоимость/страхование.
    // Передаём declaredValue в калькулятор как услугу INSURANCE, чтобы покупатель видел
    // сумму, максимально близкую к той, которая потом спишется при создании отправления.
    if (declaredValue > 0) {
      payload.services = [{ code: 'INSURANCE', parameter: String(declaredValue) }];
    }

    if (mode === 'courier') payload.to_location.address = address;

    const data = await cdekRequest('/v2/calculator/tariff', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const deliveryOnlySumRaw = Number(data.delivery_sum || 0);
    const services = Array.isArray(data.services) ? data.services : [];
    const servicesSumFromCdek = services.reduce((sum: number, service: any) => {
      return sum + Number(service?.sum || service?.total_sum || service?.price || service?.cost || 0);
    }, 0);
    const fallbackDeclaredValueFee = declaredValue > 0 ? declaredValue * Number(config.declaredValueRate || 0.0075) : 0;

    // Важно: в ЛК СДЭК суммы услуг часто отображаются как база + НДС.
    // Калькулятор API отдаёт базу услуги и сборов, поэтому для совпадения с карточкой заказа
    // прибавляем НДС СДЭК через CDEK_VAT_RATE. Это не ручная наценка магазина.
    const totalWithoutVatRaw = Number(data.total_sum || 0)
      || (deliveryOnlySumRaw + servicesSumFromCdek)
      || (deliveryOnlySumRaw + fallbackDeclaredValueFee);
    const vatRate = Math.max(0, Number(config.vatRate || 0));
    const totalWithVatRaw = config.includeVat ? totalWithoutVatRaw * (1 + vatRate) : totalWithoutVatRaw;

    const deliveryOnlySum = Math.ceil(deliveryOnlySumRaw);
    const baseDeliverySum = Math.ceil(totalWithVatRaw);
    const declaredValueFee = Math.max(0, Math.ceil((servicesSumFromCdek || fallbackDeclaredValueFee) * (config.includeVat ? 1 + vatRate : 1)));
    const deliveryMarkup = 0;

    return NextResponse.json({
      result: {
        // deliverySum — финальная цена для покупателя: сумма СДЭК с учётом сборов и НДС, без наценки магазина.
        deliverySum: baseDeliverySum,
        deliveryBaseSum: deliveryOnlySum || baseDeliverySum,
        declaredValue,
        declaredValueFee,
        deliveryMarkup,
        deliveryMarkupPerPair: Number(config.deliveryMarkupPerPair || 0),
        periodMin: data.period_min ?? null,
        periodMax: data.period_max ?? null,
        tariffCode,
        currency: data.currency || 'RUB',
        package: {
          pairCount: cdekPackage.pairCount,
          packageType: cdekPackage.packageType,
          boxCount: cdekPackage.boxCount,
          boxSummary: cdekPackage.boxSummary,
          boxes: cdekPackage.boxes,
          weight: cdekPackage.weight,
          length: cdekPackage.length,
          width: cdekPackage.width,
          height: cdekPackage.height,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось рассчитать доставку СДЭК' }, { status: 500 });
  }
}

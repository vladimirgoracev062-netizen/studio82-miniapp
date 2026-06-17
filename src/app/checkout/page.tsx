'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  calculateCdekDelivery,
  createOrderInDb,
  createYookassaPayment,
  fetchCdekDeliveryPoints,
  fetchCustomerProfile,
  fetchProducts,
  formatPrice,
  getCart,
  getTelegramUser,
  requestTelegramContact,
  saveCart,
  searchCdekCities,
} from '@/lib/store';
import type { CdekCalculationResult, CdekCity, CdekDeliveryMode, CdekDeliveryPoint, Order, Product } from '@/types';

type DeliveryType = 'cdek' | 'moscow';
const DIRECT_URL = 'https://t.me/studio82direct';

function openDirect() {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openTelegramLink) tg.openTelegramLink(DIRECT_URL);
  else window.open(DIRECT_URL, '_blank');
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  }
}

function buildOrderMessage(order: Order) {
  const lines = order.items
    .map((item) => `• ${item.title}\n  Размер: ${item.size}\n  Количество: ${item.quantity}\n  Цена: ${formatPrice(item.price)}`)
    .join('\n\n');

  return [
    'Здравствуйте! Хочу оформить доставку по Москве.',
    '',
    `Заказ №${order.id}`,
    lines,
    '',
    `Итого: ${formatPrice(order.total)}`,
    '',
    `Имя: ${order.customerName}`,
    `Телефон: ${order.phone}`,
    order.telegramUsername ? `Telegram: @${order.telegramUsername}` : '',
    '',
    'Подскажите, пожалуйста, как согласовать доставку по Москве?',
  ].filter(Boolean).join('\n');
}

function cityLabel(city: CdekCity) {
  return [city.city, city.region].filter(Boolean).join(', ');
}

function deliveryPeriod(result?: CdekCalculationResult | null) {
  if (!result?.periodMin && !result?.periodMax) return '';
  if (result.periodMin === result.periodMax) return `${result.periodMin} дн.`;
  return `${result.periodMin || '?'}–${result.periodMax || '?'} дн.`;
}

function pointTypeLabel(point?: CdekDeliveryPoint | null) {
  return point?.pointType === 'postamat' ? 'Постамат' : 'ПВЗ';
}

function packageText(result?: CdekCalculationResult | null) {
  if (!result?.package) return '';
  const box = result.package;
  if (box.boxSummary) {
    return `${box.pairCount} ${box.pairCount === 1 ? 'пара' : box.pairCount < 5 ? 'пары' : 'пар'} · короб ${box.packageType || ''} · ${box.boxSummary}`;
  }
  return `${box.pairCount} ${box.pairCount === 1 ? 'пара' : box.pairCount < 5 ? 'пары' : 'пар'} · ${box.length}×${box.width}×${box.height} см · ${box.weight} г`;
}

function cleanText(value?: string) {
  return (value || '').trim();
}

function normalizeTitlePart(value?: string) {
  return cleanText(value).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

function productOrderTitle(product?: Product) {
  if (!product) return 'Товар';
  const brand = cleanText(product.brand);
  const model = cleanText(product.title || product.name);
  const color = cleanText(product.color);
  const modelNorm = normalizeTitlePart(model);
  const colorNorm = normalizeTitlePart(color);
  const parts = [brand, model];
  if (color && colorNorm && !modelNorm.includes(colorNorm)) parts.push(color);
  return parts.filter(Boolean).join(' ');
}

export default function CheckoutPage() {
  const [form, setForm] = useState({ customerName: '', phone: '', city: '', cdekPoint: '', courierAddress: '' });
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('cdek');
  const [cdekMode, setCdekMode] = useState<CdekDeliveryMode>('pickup');
  const [selectedCity, setSelectedCity] = useState<CdekCity | null>(null);
  const [cityResults, setCityResults] = useState<CdekCity[]>([]);
  const [citySearching, setCitySearching] = useState(false);
  const [points, setPoints] = useState<CdekDeliveryPoint[]>([]);
  const [pointFilter, setPointFilter] = useState<'pvz' | 'postamat'>('pvz');
  const [pointQuery, setPointQuery] = useState('');
  const [selectedPoint, setSelectedPoint] = useState<CdekDeliveryPoint | null>(null);
  const [cdekResult, setCdekResult] = useState<CdekCalculationResult | null>(null);
  const [cdekLoading, setCdekLoading] = useState(false);
  const [cdekMessage, setCdekMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState(getCart());
  const [contactLoading, setContactLoading] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [success, setSuccess] = useState<{ order: Order; directMessage: string; copied: boolean } | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');

  useEffect(() => {
    setCart(getCart());
    fetchProducts().then(setProducts).catch(() => setProducts([]));

    fetchCustomerProfile().then((profile) => {
      if (!profile?.phone) return;
      setForm((current) => ({
        ...current,
        phone: current.phone || profile.phone || '',
      }));
    }).catch(() => null);
  }, []);

  useEffect(() => {
    const query = form.city.trim();

    if (deliveryType !== 'cdek' || selectedCity || query.length < 2) {
      if (query.length < 2) setCityResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setCitySearching(true);
        const cities = await searchCdekCities(query);
        if (cancelled) return;
        setCityResults(cities);
        if (!cities.length) setCdekMessage('Город не найден. Попробуйте написать иначе или только первые буквы города.');
        else setCdekMessage('');
      } catch {
        if (!cancelled) setCdekMessage('Не удалось найти город. Попробуйте ещё раз.');
      } finally {
        if (!cancelled) setCitySearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.city, deliveryType, selectedCity]);

  const items = useMemo(() => cart.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    return { title: productOrderTitle(product), size: item.size, price: product?.price || 0, quantity: item.quantity };
  }), [cart, products]);

  const goodsTotal = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);
  const totalPairs = useMemo(() => Math.max(1, items.reduce((sum, item) => sum + item.quantity, 0)), [items]);
  const deliveryPrice = deliveryType === 'cdek' ? Number(cdekResult?.deliverySum || 0) : 0;
  const total = goodsTotal + deliveryPrice;

  const filteredPoints = useMemo(() => {
    const normalized = pointQuery.trim().toLowerCase();
    return points
      .filter((point) => (point.pointType || 'pvz') === pointFilter)
      .filter((point) => {
        if (!normalized) return true;
        return `${point.name} ${point.address} ${point.nearestStation || ''}`.toLowerCase().includes(normalized);
      })
      .slice(0, 80);
  }, [points, pointFilter, pointQuery]);

  const pointCounts = useMemo(() => ({
    pvz: points.filter((point) => (point.pointType || 'pvz') === 'pvz').length,
    postamat: points.filter((point) => point.pointType === 'postamat').length,
  }), [points]);

  function resetCdekCalculation() {
    setCdekResult(null);
    setCdekMessage('');
  }

  function selectDelivery(type: DeliveryType) {
    setDeliveryType(type);
    setError('');
    if (type === 'moscow') {
      setForm((current) => ({ ...current, city: 'Москва', cdekPoint: 'Доставка по Москве — согласовать в Telegram' }));
    }
  }

  function selectCdekMode(mode: CdekDeliveryMode) {
    setCdekMode(mode);
    setSelectedPoint(null);
    setPointFilter('pvz');
    setPointQuery('');
    setForm((current) => ({ ...current, cdekPoint: '', courierAddress: '' }));
    resetCdekCalculation();
  }

  async function findCities() {
    try {
      setCdekMessage('');
      setCitySearching(true);
      setSelectedCity(null);
      setSelectedPoint(null);
      setPointQuery('');
      setPoints([]);
      resetCdekCalculation();
      const cities = await searchCdekCities(form.city);
      setCityResults(cities);
      if (!cities.length) setCdekMessage('Город не найден. Попробуйте другое написание.');
    } catch (err: any) {
      setCdekMessage(err.message || 'Не удалось найти город');
    } finally {
      setCitySearching(false);
    }
  }

  async function chooseCity(city: CdekCity) {
    setSelectedCity(city);
    setCityResults([]);
    setSelectedPoint(null);
    setPointQuery('');
    setPoints([]);
    setForm((current) => ({ ...current, city: cityLabel(city), cdekPoint: '' }));
    resetCdekCalculation();

    if (cdekMode === 'pickup') {
      try {
        setCdekLoading(true);
        const data = await fetchCdekDeliveryPoints(city.code);
        setPoints(data);
        if (!data.length) setCdekMessage('В этом городе ПВЗ и постаматы не найдены. Можно выбрать курьерскую доставку.');
      } catch (err: any) {
        setCdekMessage(err.message || 'Не удалось загрузить ПВЗ');
      } finally {
        setCdekLoading(false);
      }
    }
  }

  function choosePoint(point: CdekDeliveryPoint) {
    setSelectedPoint(point);
    setForm((current) => ({ ...current, cdekPoint: point.address }));
    resetCdekCalculation();
  }

  async function calculateCdek() {
    try {
      setCdekMessage('');
      setError('');
      if (!selectedCity) throw new Error('Сначала выберите город из списка СДЭК');
      if (cdekMode === 'pickup' && !selectedPoint) throw new Error('Выберите пункт выдачи СДЭК');
      if (cdekMode === 'courier' && form.courierAddress.trim().length < 5) throw new Error('Укажите адрес курьерской доставки');

      setCdekLoading(true);
      const result = await calculateCdekDelivery({
        mode: cdekMode,
        cityCode: selectedCity.code,
        address: cdekMode === 'courier' ? form.courierAddress : selectedPoint?.address,
        packageQuantity: totalPairs,
        declaredValue: goodsTotal,
      });
      setCdekResult(result);
      setCdekMessage('Стоимость доставки рассчитана.');
    } catch (err: any) {
      setCdekMessage(err.message || 'Не удалось рассчитать доставку СДЭК');
      setCdekResult(null);
    } finally {
      setCdekLoading(false);
    }
  }

  async function requestPhoneFromTelegram() {
    try {
      setContactMessage('');
      setContactLoading(true);
      const result = await requestTelegramContact();
      if (!result.ok) {
        setContactMessage(result.message || 'Вы не поделились номером. Его можно ввести вручную.');
        return;
      }

      setContactMessage('Номер получен. Обновляем данные...');
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const profile = await fetchCustomerProfile();
        if (profile?.phone) {
          setForm((current) => ({
            ...current,
            phone: profile.phone,
          }));
          setContactMessage('Номер телефона добавлен из Telegram.');
          return;
        }
      }

      setContactMessage('Telegram подтвердил отправку номера, но он ещё не дошёл до сайта. Обновите страницу или введите телефон вручную.');
    } catch {
      setContactMessage('Не удалось получить номер. Введите телефон вручную.');
    } finally {
      setContactLoading(false);
    }
  }

  async function copyPreparedMessage() {
    if (!success?.directMessage) return;
    const copied = await copyText(success.directMessage);
    setSuccess((current) => current ? { ...current, copied } : current);
  }

  async function startPayment(order: Order) {
    try {
      if (!order.dbId) throw new Error('Не найден ID заказа для оплаты');
      setPaymentMessage('');
      setPaymentLoading(true);
      const result = await createYookassaPayment(order.dbId);
      if (result.order) {
        setSuccess((current) => current ? { ...current, order: result.order as Order } : current);
      }
      if (result.paid) {
        setPaymentMessage('Заказ уже оплачен.');
        return;
      }
      if (!result.confirmationUrl) throw new Error('ЮKassa не вернула ссылку на оплату');
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.openLink) tg.openLink(result.confirmationUrl);
      else window.location.href = result.confirmationUrl;
    } catch (err: any) {
      setPaymentMessage(err.message || 'Не удалось открыть оплату');
    } finally {
      setPaymentLoading(false);
    }
  }

  async function submit() {
    try {
      setError('');
      setLoading(true);
      if (!cart.length) throw new Error('Корзина пустая');
      if (!form.customerName.trim() || !form.phone.trim()) throw new Error('Заполните ФИО и телефон');

      let orderCity = form.city;
      let orderPoint = form.cdekPoint;
      let cdekRecipientAddress = '';

      if (deliveryType === 'cdek') {
        if (!selectedCity) throw new Error('Выберите город СДЭК из списка');
        if (!cdekResult?.deliverySum) throw new Error('Сначала рассчитайте доставку СДЭК');
        orderCity = cityLabel(selectedCity);
        if (cdekMode === 'pickup') {
          if (!selectedPoint) throw new Error('Выберите пункт выдачи СДЭК');
          orderPoint = selectedPoint.address;
        } else {
          if (!form.courierAddress.trim()) throw new Error('Укажите адрес курьерской доставки');
          orderPoint = form.courierAddress;
          cdekRecipientAddress = form.courierAddress;
        }
      }

      const user = getTelegramUser();
      const order = await createOrderInDb({
        cart,
        customerName: form.customerName,
        phone: form.phone,
        city: deliveryType === 'moscow' ? 'Москва' : orderCity,
        cdekPoint: deliveryType === 'moscow' ? 'Доставка по Москве — согласовать в Telegram' : orderPoint,
        deliveryType,
        cdekDeliveryMode: deliveryType === 'cdek' ? cdekMode : undefined,
        cdekCityCode: selectedCity?.code || null,
        cdekPointCode: selectedPoint?.code || '',
        cdekPointAddress: selectedPoint?.address || '',
        cdekRecipientAddress,
        cdekDeliveryPrice: deliveryPrice,
        cdekTariffCode: cdekResult?.tariffCode || null,
        cdekPackagePairCount: cdekResult?.package?.pairCount || totalPairs,
        cdekPackageType: cdekResult?.package?.packageType || '',
        cdekPackageBoxCount: cdekResult?.package?.boxCount || undefined,
        cdekPackageWeight: cdekResult?.package?.weight || undefined,
        cdekPackageLength: cdekResult?.package?.length || undefined,
        cdekPackageWidth: cdekResult?.package?.width || undefined,
        cdekPackageHeight: cdekResult?.package?.height || undefined,
        telegramId: user?.id ? String(user.id) : '',
        telegramUsername: user?.username || '',
      });
      saveCart([]);
      setCart([]);

      const directMessage = deliveryType === 'moscow' ? buildOrderMessage(order) : '';
      setSuccess({ order, directMessage, copied: false });
      setPaymentMessage('Заказ создан. Теперь его нужно оплатить.');
    } catch (err: any) {
      setError(err.message || 'Не удалось создать заказ');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="app client-app checkout-page">
        <div className="page studio-simple-page checkout-page-inner">
          <Link className="pill" href="/">← Каталог</Link>
          <h1 className="title">Заказ создан</h1>
          <div className="checkout-summary">
            <div className="row-between"><b>Заказ №{success.order.id}</b><b>{formatPrice(success.order.total)}</b></div>
            {success.order.items.map((item) => (
              <p key={`${item.title}-${item.size}`}>{item.title}, размер {item.size} × {item.quantity}</p>
            ))}
            {success.order.cdekDeliveryPrice ? <p className="muted">Доставка СДЭК: {formatPrice(success.order.cdekDeliveryPrice)}</p> : null}
          </div>

          {success.order.paymentStatus !== 'paid' && (
            <div className="direct-box payment-box">
              <b>Ожидает оплаты</b>
              <p className="muted">Оплатите заказ через ЮKassa. После успешной оплаты заказ появится как оплаченный в разделе «Заказы».</p>
              {paymentMessage && <p className={paymentMessage.toLowerCase().includes('ош') || paymentMessage.includes('Не') ? 'error-text' : 'success-text'}>{paymentMessage}</p>}
              <button className="btn full" disabled={paymentLoading} onClick={() => startPayment(success.order)}>
                {paymentLoading ? 'Открываем оплату...' : 'Оплатить через ЮKassa'}
              </button>
              <Link className="btn light" href="/profile">Перейти к заказам</Link>
            </div>
          )}

          {success.order.paymentStatus === 'paid' && success.order.deliveryType === 'moscow' && (
            <div className="direct-box">
              <b>Заказ оплачен. Доставка по Москве</b>
              <p className="muted">
                Мы подготовили текст для менеджера. {success.copied ? 'Сообщение уже скопировано — откройте чат и вставьте его.' : 'Скопируйте сообщение и отправьте его менеджеру.'}
              </p>
              <textarea className="input prepared-message" readOnly value={success.directMessage} rows={10} />
              <div className="row direct-actions">
                <button className="btn light" onClick={copyPreparedMessage}>{success.copied ? 'Скопировано' : 'Скопировать текст'}</button>
                <button className="btn" onClick={openDirect}>Открыть @studio82direct</button>
              </div>
            </div>
          )}

          {success.order.paymentStatus === 'paid' && success.order.deliveryType !== 'moscow' && (
            <div className="direct-box">
              <b>Заказ оплачен</b>
              <p className="muted">Доставка СДЭК сохранена в заказе. Статус можно посмотреть в разделе «Заказы».</p>
              <Link className="btn" href="/profile">Перейти к заказам</Link>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="app client-app checkout-page">
      <div className="page studio-simple-page checkout-page-inner">
        <Link className="pill" href="/cart">← Корзина</Link>
        <h1 className="title">Оформление</h1>
        <p className="muted">Выберите способ доставки и оставьте контактные данные.</p>
        <div className="checkout-summary">
          {items.map((item) => <p key={`${item.title}-${item.size}`}>{item.title}, размер {item.size} × {item.quantity}</p>)}
          <div className="row-between"><span>Товары</span><b>{formatPrice(goodsTotal)}</b></div>
          {deliveryType === 'cdek' && cdekResult?.deliverySum ? <div className="row-between"><span>Доставка СДЭК</span><b>{formatPrice(cdekResult.deliverySum)}</b></div> : null}
          <div className="row-between checkout-total"><span>Итого</span><b>{formatPrice(total)}</b></div>
        </div>

        <div className="delivery-options">
          <button className={`delivery-option ${deliveryType === 'cdek' ? 'active' : ''}`} onClick={() => selectDelivery('cdek')}>
            <b>СДЭК</b>
            <span className="muted">Пункт выдачи / постамат или курьером до адреса. Стоимость считается до оформления заказа.</span>
          </button>
          <button className={`delivery-option ${deliveryType === 'moscow' ? 'active' : ''}`} onClick={() => selectDelivery('moscow')}>
            <b>Доставка по Москве</b>
            <span className="muted">Сначала оплатите заказ. После оплаты откроется возможность написать менеджеру для согласования курьера.</span>
          </button>
        </div>

        {deliveryType === 'cdek' && (
          <div className="cdek-box">
            <b>Получение СДЭК</b>
            <div className="cdek-mode-grid">
              <button className={`chip ${cdekMode === 'pickup' ? 'active' : ''}`} type="button" onClick={() => selectCdekMode('pickup')}>ПВЗ / постамат</button>
              <button className={`chip ${cdekMode === 'courier' ? 'active' : ''}`} type="button" onClick={() => selectCdekMode('courier')}>Курьер до адреса</button>
            </div>

            <div className="row cdek-search-row">
              <input className="input" placeholder="Город доставки: Ростов, Казань, Феодосия" value={form.city} onChange={(e) => { setForm({ ...form, city: e.target.value }); setSelectedCity(null); setSelectedPoint(null); setPoints([]); resetCdekCalculation(); }} />
              <button className="btn light" type="button" disabled={citySearching || form.city.trim().length < 2} onClick={findCities}>{citySearching ? 'Ищем...' : 'Найти'}</button>
            </div>

            {cityResults.length > 0 && (
              <div className="cdek-list">
                {cityResults.map((city) => (
                  <button type="button" key={city.code} onClick={() => chooseCity(city)}>
                    <b>{city.city}</b>
                    {city.region && <span>{city.region}</span>}
                  </button>
                ))}
              </div>
            )}

            {selectedCity && <p className="success-text">Город выбран: {cityLabel(selectedCity)}</p>}

            {selectedCity && cdekMode === 'pickup' && (
              <>
                {cdekLoading && <p className="muted">Загружаем ПВЗ...</p>}
                {points.length > 0 && (
                  <div className="cdek-pickup-tools">
                    <div className="cdek-mode-grid cdek-point-tabs">
                      <button className={`chip ${pointFilter === 'pvz' ? 'active' : ''}`} type="button" onClick={() => { setPointFilter('pvz'); setSelectedPoint(null); resetCdekCalculation(); }}>ПВЗ ({pointCounts.pvz})</button>
                      <button className={`chip ${pointFilter === 'postamat' ? 'active' : ''}`} type="button" onClick={() => { setPointFilter('postamat'); setSelectedPoint(null); resetCdekCalculation(); }}>Постаматы ({pointCounts.postamat})</button>
                    </div>
                    <input className="input" placeholder="Поиск по улице, адресу или метро" value={pointQuery} onChange={(e) => { setPointQuery(e.target.value); setSelectedPoint(null); resetCdekCalculation(); }} />
                    <p className="muted cdek-small-note">Показываем до 80 ближайших совпадений. Сначала выберите тип, потом можно искать улицу.</p>
                  </div>
                )}
                {points.length > 0 && filteredPoints.length === 0 && <p className="muted">По этому запросу ничего не найдено. Попробуйте другую улицу.</p>}
                {filteredPoints.length > 0 && (
                  <div className="cdek-list cdek-points-list">
                    {filteredPoints.map((point) => (
                      <button className={selectedPoint?.code === point.code ? 'active' : ''} type="button" key={point.code} onClick={() => choosePoint(point)}>
                        <b>{pointTypeLabel(point)} · {point.name}</b>
                        <span>{point.address}</span>
                        {point.nearestStation && <small>Рядом: {point.nearestStation}</small>}
                        {point.workTime && <small>{point.workTime}</small>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {selectedCity && cdekMode === 'courier' && (
              <input className="input" placeholder="Адрес доставки: улица, дом, квартира" value={form.courierAddress} onChange={(e) => { setForm({ ...form, courierAddress: e.target.value }); resetCdekCalculation(); }} />
            )}

            <button className="btn full" type="button" disabled={cdekLoading || !selectedCity || (cdekMode === 'pickup' && !selectedPoint) || (cdekMode === 'courier' && form.courierAddress.trim().length < 5)} onClick={calculateCdek}>
              {cdekLoading ? 'Считаем...' : 'Рассчитать доставку СДЭК'}
            </button>

            {cdekResult && (
              <div className="cdek-result">
                <div className="row-between"><span>Доставка</span><b>{formatPrice(cdekResult.deliverySum)}</b></div>
                {deliveryPeriod(cdekResult) && <p className="muted">Срок: {deliveryPeriod(cdekResult)}</p>}
              </div>
            )}
            {cdekMessage && <p className={cdekResult ? 'success-text' : 'error-text'}>{cdekMessage}</p>}
          </div>
        )}

        {deliveryType === 'moscow' && (
          <div className="direct-box">
            <b>Как будет работать</b>
            <p className="muted">После создания заказа мы сформируем текст с моделью, размером, количеством и контактами. Его нужно будет отправить менеджеру в Telegram.</p>
          </div>
        )}

        <div className="form">
          <input className="input" placeholder="ФИО" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
          <div className="phone-field">
            <input className="input" placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <button className="btn light phone-request-btn" disabled={contactLoading} onClick={requestPhoneFromTelegram} type="button">
              {contactLoading ? 'Запрашиваем...' : 'Получить номер из Telegram'}
            </button>
          </div>
          {contactMessage && <p className="muted">{contactMessage}</p>}
          {error && <p className="error-text">{error}</p>}
          <button className="btn full" disabled={loading} onClick={submit}>{loading ? 'Создаём заказ...' : 'Создать заказ'}</button>
        </div>
      </div>
    </main>
  );
}

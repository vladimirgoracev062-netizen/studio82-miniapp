'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  calculateCdekDelivery,
  createOrderInDb,
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

export default function CheckoutPage() {
  const [form, setForm] = useState({ customerName: '', phone: '', city: '', cdekPoint: '', courierAddress: '' });
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('cdek');
  const [cdekMode, setCdekMode] = useState<CdekDeliveryMode>('pickup');
  const [selectedCity, setSelectedCity] = useState<CdekCity | null>(null);
  const [cityResults, setCityResults] = useState<CdekCity[]>([]);
  const [points, setPoints] = useState<CdekDeliveryPoint[]>([]);
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

  const items = useMemo(() => cart.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    return { title: [product?.title || product?.name || 'Товар', product?.color || ''].filter(Boolean).join(' '), size: item.size, price: product?.price || 0, quantity: item.quantity };
  }), [cart, products]);

  const goodsTotal = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);
  const deliveryPrice = deliveryType === 'cdek' ? Number(cdekResult?.deliverySum || 0) : 0;
  const total = goodsTotal + deliveryPrice;

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
    setForm((current) => ({ ...current, cdekPoint: '', courierAddress: '' }));
    resetCdekCalculation();
  }

  async function findCities() {
    try {
      setCdekMessage('');
      setCdekLoading(true);
      setSelectedCity(null);
      setSelectedPoint(null);
      setPoints([]);
      resetCdekCalculation();
      const cities = await searchCdekCities(form.city);
      setCityResults(cities);
      if (!cities.length) setCdekMessage('Город не найден. Попробуйте другое написание.');
    } catch (err: any) {
      setCdekMessage(err.message || 'Не удалось найти город');
    } finally {
      setCdekLoading(false);
    }
  }

  async function chooseCity(city: CdekCity) {
    setSelectedCity(city);
    setCityResults([]);
    setSelectedPoint(null);
    setPoints([]);
    setForm((current) => ({ ...current, city: cityLabel(city), cdekPoint: '' }));
    resetCdekCalculation();

    if (cdekMode === 'pickup') {
      try {
        setCdekLoading(true);
        const data = await fetchCdekDeliveryPoints(city.code);
        setPoints(data);
        if (!data.length) setCdekMessage('В этом городе ПВЗ не найдены. Можно выбрать курьерскую доставку.');
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
        telegramId: user?.id ? String(user.id) : '',
        telegramUsername: user?.username || '',
      });
      saveCart([]);
      setCart([]);

      const directMessage = deliveryType === 'moscow' ? buildOrderMessage(order) : '';
      setSuccess({ order, directMessage, copied: false });

      if (directMessage) {
        const copied = await copyText(directMessage);
        setSuccess((current) => current ? { ...current, copied } : current);
      }
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

          {success.order.deliveryType === 'moscow' ? (
            <div className="direct-box">
              <b>Доставка по Москве</b>
              <p className="muted">
                Мы подготовили текст заказа для менеджера. {success.copied ? 'Сообщение уже скопировано — откройте чат и вставьте его.' : 'Скопируйте сообщение и отправьте его менеджеру.'}
              </p>
              <textarea className="input prepared-message" readOnly value={success.directMessage} rows={10} />
              <div className="row direct-actions">
                <button className="btn light" onClick={copyPreparedMessage}>{success.copied ? 'Скопировано' : 'Скопировать текст'}</button>
                <button className="btn" onClick={openDirect}>Открыть @studio82direct</button>
              </div>
            </div>
          ) : (
            <div className="direct-box">
              <b>Заказ принят</b>
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
            <span className="muted">После создания заказа приложение подготовит сообщение для @studio82direct.</span>
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
              <input className="input" placeholder="Город" value={form.city} onChange={(e) => { setForm({ ...form, city: e.target.value }); setSelectedCity(null); setSelectedPoint(null); setPoints([]); resetCdekCalculation(); }} />
              <button className="btn light" type="button" disabled={cdekLoading || form.city.trim().length < 2} onClick={findCities}>Найти</button>
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
                  <div className="cdek-list cdek-points-list">
                    {points.map((point) => (
                      <button className={selectedPoint?.code === point.code ? 'active' : ''} type="button" key={point.code} onClick={() => choosePoint(point)}>
                        <b>{point.name}</b>
                        <span>{point.address}</span>
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

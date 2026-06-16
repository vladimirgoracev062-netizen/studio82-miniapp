'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  createProductInDb,
  deleteProductFromDb,
  fetchOrders,
  fetchProducts,
  formatPrice,
  safeImage,
  saveProductToDb,
  updateOrderInDb,
  uploadImages,
} from '@/lib/store';
import type { Order, OrderStatus, Product, ProductSize } from '@/types';

const statuses: OrderStatus[] = ['Новый', 'Оплачен', 'Собирается', 'Передан в СДЭК', 'В пути', 'Готов к выдаче', 'Завершён'];
type AdminTab = 'products' | 'add' | 'orders';

type ProductDraft = {
  brand: string;
  title: string;
  color: string;
  description: string;
  price: number;
  images: string[];
  imageUrl: string;
  sizes: string;
  isPublished: boolean;
};

const defaultSizes = '36:0, 36.5:0, 37:0, 37.5:0, 38:0, 38.5:0, 39:0, 40:0, 41:0, 42:0, 43:0, 44:0, 45:0';
const emptyDraft: ProductDraft = { brand: '', title: '', color: '', description: '', price: 0, images: [], imageUrl: '', sizes: defaultSizes, isPublished: true };

function createId(value: string) {
  const slug = value.toLowerCase().trim().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${slug || 'product'}-${Date.now().toString().slice(-6)}`;
}

function parseSizes(value: string): ProductSize[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [size, stockRaw] = item.split(':').map((part) => part.trim());
      return { size, stock: Math.max(0, Number(stockRaw || 0) || 0) };
    })
    .filter((item) => item.size);
}

function normalizeImageUrlList(value: string) {
  return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

function imageUrlsText(product: Product) {
  return (product.images || []).filter((url) => !url.startsWith('/') && !url.startsWith('data:')).join('\n');
}

export default function AdminPage() {
  const [logged, setLogged] = useState(false);
  const [password, setPassword] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<AdminTab>('products');
  const [productQuery, setProductQuery] = useState('');
  const [sizeDrafts, setSizeDrafts] = useState<Record<string, { size: string; stock: string }>>({});

  const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin82';

  useEffect(() => {
    const ok = window.sessionStorage.getItem('studio82_admin') === '1';
    setLogged(ok);
    if (ok) loadAdminData(adminPassword);
  }, [adminPassword]);

  async function loadAdminData(pass: string) {
    try {
      setLoading(true);
      const [productsData, ordersData] = await Promise.all([fetchProducts(pass), fetchOrders(pass)]);
      setProducts(productsData);
      setOrders(ordersData);
    } catch (err: any) {
      setMessage(err.message || 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }

  const publishedCount = useMemo(() => products.filter((product) => product.isPublished).length, [products]);
  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    return products.filter((product) => !query || `${product.brand} ${product.title} ${product.color}`.toLowerCase().includes(query));
  }, [products, productQuery]);

  async function login() {
    if (password !== adminPassword) {
      setMessage('Неверный пароль');
      return;
    }
    window.sessionStorage.setItem('studio82_admin', '1');
    setLogged(true);
    setMessage('');
    await loadAdminData(password);
  }

  function logout() {
    window.sessionStorage.removeItem('studio82_admin');
    setLogged(false);
  }

  async function persistProduct(product: Product) {
    try {
      setMessage('Сохраняем...');
      const next = await saveProductToDb(product, adminPassword);
      setProducts(next);
      setMessage('Изменения сохранены');
    } catch (err: any) {
      setMessage(err.message || 'Ошибка сохранения');
    }
  }

  function updateProduct(id: string, patch: Partial<Product>) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    const nextProduct = { ...product, ...patch };
    setProducts(products.map((p) => (p.id === id ? nextProduct : p)));
    persistProduct(nextProduct);
  }

  function updateSize(productId: string, size: string, stock: number) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const nextProduct = { ...product, sizes: product.sizes.map((s) => (s.size === size ? { ...s, stock: Math.max(0, stock) } : s)) };
    setProducts(products.map((p) => (p.id === productId ? nextProduct : p)));
    persistProduct(nextProduct);
  }

  function setSizeDraft(productId: string, patch: Partial<{ size: string; stock: string }>) {
    setSizeDrafts((current) => {
      const existingDraft = current[productId] || { size: '', stock: '1' };
      return {
        ...current,
        [productId]: { ...existingDraft, ...patch },
      };
    });
  }

  function addSize(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const draftSize = (sizeDrafts[productId]?.size || '').trim().replace(',', '.');
    const draftStock = Math.max(0, Number(sizeDrafts[productId]?.stock || 0) || 0);
    if (!draftSize) {
      setMessage('Введите размер');
      return;
    }
    if (product.sizes.some((item) => item.size === draftSize)) {
      setMessage('Такой размер уже есть');
      return;
    }
    const nextProduct = {
      ...product,
      sizes: [...product.sizes, { size: draftSize, stock: draftStock }].sort((a, b) => Number(a.size) - Number(b.size)),
    };
    setProducts(products.map((p) => (p.id === productId ? nextProduct : p)));
    setSizeDrafts((current) => ({ ...current, [productId]: { size: '', stock: '1' } }));
    persistProduct(nextProduct);
  }

  function removeSize(productId: string, size: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const nextProduct = { ...product, sizes: product.sizes.filter((item) => item.size !== size) };
    setProducts(products.map((p) => (p.id === productId ? nextProduct : p)));
    persistProduct(nextProduct);
  }

  async function addProduct() {
    try {
      if (!draft.title.trim()) throw new Error('Введите название товара');
      const imageUrls = normalizeImageUrlList(draft.imageUrl);
      const images = [...draft.images, ...imageUrls].filter(Boolean);
      const product: Product = {
        id: createId(draft.title),
        brand: draft.brand.trim() || 'STUDIO 82',
        name: draft.title.trim(),
        title: draft.title.trim(),
        color: draft.color.trim(),
        description: draft.description.trim() || 'Описание можно изменить в админ-панели.',
        price: Number(draft.price) || 0,
        images: images.length ? images : ['/placeholder-shoe.svg'],
        isPublished: draft.isPublished,
        sizes: parseSizes(draft.sizes),
      };
      setMessage('Добавляем товар...');
      const next = await createProductInDb(product, adminPassword);
      setProducts(next);
      setDraft(emptyDraft);
      setTab('products');
      setMessage('Товар добавлен');
    } catch (err: any) {
      setMessage(err.message || 'Не удалось добавить товар');
    }
  }

  async function deleteProduct(id: string) {
    if (!window.confirm('Удалить товар?')) return;
    try {
      const next = await deleteProductFromDb(id, adminPassword);
      setProducts(next);
      setMessage('Товар удалён');
    } catch (err: any) {
      setMessage(err.message || 'Не удалось удалить товар');
    }
  }

  async function uploadDraftImages(files?: FileList | null) {
    if (!files?.length) return;
    try {
      setMessage('Загружаем фото...');
      const urls = await uploadImages(files, adminPassword);
      setDraft((current) => ({ ...current, images: [...current.images, ...urls] }));
      setMessage('Фото загружены');
    } catch (err: any) {
      setMessage(err.message || 'Не удалось загрузить фото');
    }
  }

  async function uploadProductImages(productId: string, files?: FileList | null) {
    if (!files?.length) return;
    try {
      const urls = await uploadImages(files, adminPassword);
      const product = products.find((item) => item.id === productId);
      if (!product) return;
      const nextProduct = { ...product, images: [...(product.images || []), ...urls].filter(Boolean) };
      setProducts(products.map((p) => (p.id === productId ? nextProduct : p)));
      await persistProduct(nextProduct);
    } catch (err: any) {
      setMessage(err.message || 'Не удалось загрузить фото');
    }
  }

  function removeProductImage(productId: string, index: number) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const nextImages = product.images.filter((_, imageIndex) => imageIndex !== index);
    const nextProduct = { ...product, images: nextImages.length ? nextImages : ['/placeholder-shoe.svg'] };
    setProducts(products.map((p) => (p.id === productId ? nextProduct : p)));
    persistProduct(nextProduct);
  }

  function removeDraftImage(index: number) {
    setDraft((current) => ({ ...current, images: current.images.filter((_, imageIndex) => imageIndex !== index) }));
  }

  function applyProductImageUrls(productId: string, value: string) {
    const current = products.find((product) => product.id === productId);
    if (!current) return;
    const uploadedImages = current.images.filter((image) => !image.startsWith('/') && !image.startsWith('data:') && !normalizeImageUrlList(value).includes(image));
    const urlImages = normalizeImageUrlList(value);
    const nextProduct = { ...current, images: [...uploadedImages, ...urlImages].filter(Boolean) };
    setProducts(products.map((p) => (p.id === productId ? nextProduct : p)));
    persistProduct(nextProduct);
  }

  async function updateOrder(order: Order, patch: Partial<Order>) {
    if (!order.dbId) return;
    const nextOrder = { ...order, ...patch };
    setOrders(orders.map((item) => (item.dbId === order.dbId ? nextOrder : item)));
    try {
      await updateOrderInDb(order.dbId, adminPassword, { status: patch.status, trackNumber: patch.trackNumber });
      setMessage('Заказ обновлён');
    } catch (err: any) {
      setMessage(err.message || 'Не удалось обновить заказ');
    }
  }

  if (!logged) {
    return (
      <main className="app">
        <div className="page">
          <h1 className="title">Админка</h1>
          <p className="muted">Раздел скрыт из меню магазина. Вход только для владельца.</p>
          <input className="input" type="password" placeholder="Пароль администратора" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} />
          {message && <p className="error-text">{message}</p>}
          <button className="btn" style={{ marginTop: 10 }} onClick={login}>Войти</button>
        </div>
      </main>
    );
  }

  return (
    <main className="app admin-app">
      <div className="page">
        <div className="admin-head">
          <div>
            <h1 className="title">Админка</h1>
            <p className="muted">Опубликовано: {publishedCount} из {products.length}</p>
          </div>
          <button className="btn light" onClick={logout}>Выйти</button>
        </div>

        <div className="notice">Данные теперь сохраняются в Supabase: товары, фото, остатки и заказы видны всем клиентам.</div>

        <div className="admin-tabs">
          <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Товары</button>
          <button className={tab === 'add' ? 'active' : ''} onClick={() => setTab('add')}>Добавить</button>
          <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>Заказы</button>
        </div>

        {loading && <p className="muted">Загрузка...</p>}
        {message && <p className={message.includes('ош') || message.includes('Не') || message.includes('Невер') ? 'error-text' : 'success-text'}>{message}</p>}

        {tab === 'add' && (
          <section>
            <h2>Добавить товар</h2>
            <div className="admin-row form">
              <input className="input" placeholder="Бренд, например Nike" value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} />
              <input className="input" placeholder="Название модели" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <input className="input" placeholder="Цвет" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
              <input className="input" type="number" placeholder="Цена" value={draft.price || ''} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} />
              <textarea className="input" rows={4} placeholder="Описание" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              <textarea className="input" rows={2} placeholder="Ссылки на фото — каждая с новой строки" value={draft.imageUrl} onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })} />
              <label className="upload-box"><span>Загрузить фото с компьютера</span><input type="file" accept="image/*" multiple onChange={(e) => uploadDraftImages(e.target.files)} /></label>
              {draft.images.length > 0 && <div className="admin-gallery">{draft.images.map((image, index) => <div className="admin-photo square-media" key={image + index}><img src={image} alt="Фото товара" /><button onClick={() => removeDraftImage(index)}>×</button></div>)}</div>}
              <input className="input" placeholder="Размеры и остатки: 40:1, 41:0, 42:2" value={draft.sizes} onChange={(e) => setDraft({ ...draft, sizes: e.target.value })} />
              <label className="toggle-line"><input type="checkbox" checked={draft.isPublished} onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })} /> <span>Опубликовать товар</span></label>
              <button className="btn" onClick={addProduct}>Добавить товар</button>
            </div>
          </section>
        )}

        {tab === 'products' && (
          <section>
            <input className="input search" placeholder="Поиск товара в админке" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} />
            <div className="admin-products">
              {filteredProducts.map((product) => (
                <div className="admin-product" key={product.id}>
                  <div className="admin-product-top">
                    <div className="admin-preview square-media"><img src={safeImage(product)} alt={product.title} /></div>
                    <div className="admin-title"><b>{product.title}</b><span>{formatPrice(product.price)}</span></div>
                    <button className="link-danger" onClick={() => deleteProduct(product.id)}>Удалить</button>
                  </div>
                  <div className="form compact">
                    <input className="input" value={product.brand} onChange={(e) => updateProduct(product.id, { brand: e.target.value })} />
                    <input className="input" value={product.title} onChange={(e) => updateProduct(product.id, { title: e.target.value, name: e.target.value })} />
                    <input className="input" value={product.color} onChange={(e) => updateProduct(product.id, { color: e.target.value })} />
                    <input className="input" type="number" value={product.price || ''} onChange={(e) => updateProduct(product.id, { price: Number(e.target.value) })} />
                    <textarea className="input" rows={3} value={product.description} onChange={(e) => updateProduct(product.id, { description: e.target.value })} />
                    <textarea className="input" rows={2} placeholder="Ссылки на фото" defaultValue={imageUrlsText(product)} onBlur={(e) => applyProductImageUrls(product.id, e.target.value)} />
                    <label className="upload-box"><span>Добавить фото</span><input type="file" accept="image/*" multiple onChange={(e) => uploadProductImages(product.id, e.target.files)} /></label>
                    <div className="admin-gallery">{product.images.map((image, index) => <div className="admin-photo square-media" key={image + index}><img src={image} alt="Фото" /><button onClick={() => removeProductImage(product.id, index)}>×</button></div>)}</div>
                    <label className="toggle-line"><input type="checkbox" checked={product.isPublished} onChange={(e) => updateProduct(product.id, { isPublished: e.target.checked })} /> <span>{product.isPublished ? 'Опубликован' : 'Скрыт'}</span></label>
                    <div className="sizes-admin">{product.sizes.map((size) => <label key={size.size}><span>{size.size}</span><input type="number" value={size.stock} onChange={(e) => updateSize(product.id, size.size, Number(e.target.value))} /><button onClick={() => removeSize(product.id, size.size)}>×</button></label>)}</div>
                    <div className="size-add-row">
                      <input className="input" placeholder="Новый размер, например 42.5" value={sizeDrafts[product.id]?.size || ''} onChange={(e) => setSizeDraft(product.id, { size: e.target.value })} />
                      <input className="input" type="number" placeholder="Остаток" value={sizeDrafts[product.id]?.stock || '1'} onChange={(e) => setSizeDraft(product.id, { stock: e.target.value })} />
                      <button className="btn light" onClick={() => addSize(product.id)}>Добавить</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'orders' && (
          <section>
            <h2>Заказы</h2>
            {orders.length === 0 && <div className="empty">Заказов пока нет</div>}
            <div className="order-list">
              {orders.map((order) => (
                <div className="order-card" key={order.dbId || order.id}>
                  <div className="row-between"><b>Заказ #{order.id}</b><span>{formatPrice(order.total)}</span></div>
                  <p className="muted">{order.customerName} · {order.phone}</p>
                  <p className="muted">{order.deliveryType === 'moscow' ? 'Доставка по Москве' : 'СДЭК'} · {order.city} · {order.cdekPoint || 'ПВЗ не указан'}</p>
                  {order.telegramUsername && <p className="muted">Telegram: @{order.telegramUsername}</p>}
                  {order.items.map((item) => <p key={item.title + item.size}>{item.title}, размер {item.size} × {item.quantity}</p>)}
                  <select className="input" value={order.status} onChange={(e) => updateOrder(order, { status: e.target.value as OrderStatus })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
                  <input className="input" placeholder="Трек-номер СДЭК" value={order.trackNumber || ''} onChange={(e) => updateOrder(order, { trackNumber: e.target.value })} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

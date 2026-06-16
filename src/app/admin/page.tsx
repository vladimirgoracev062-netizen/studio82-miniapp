'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatPrice, getOrders, getProducts, resetProducts, safeImage, saveOrders, saveProducts } from '@/lib/store';
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

const emptyDraft: ProductDraft = {
  brand: '',
  title: '',
  color: '',
  description: '',
  price: 0,
  images: [],
  imageUrl: '',
  sizes: defaultSizes,
  isPublished: true,
};

function createId(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
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

function sizesToText(sizes: ProductSize[]) {
  return sizes.map((item) => `${item.size}:${item.stock}`).join(', ');
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function readImageFiles(files?: FileList | null) {
  if (!files?.length) return [];
  return Promise.all(Array.from(files).map(readImageFile));
}

function normalizeImageUrlList(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AdminPage() {
  const [logged, setLogged] = useState(false);
  const [password, setPassword] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<AdminTab>('products');
  const [productQuery, setProductQuery] = useState('');

  const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin82';

  useEffect(() => {
    setLogged(window.sessionStorage.getItem('studio82_admin') === '1');
    setProducts(getProducts());
    setOrders(getOrders());
  }, []);

  const publishedCount = useMemo(() => products.filter((product) => product.isPublished).length, [products]);
  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    return products.filter((product) => !query || `${product.brand} ${product.title} ${product.color}`.toLowerCase().includes(query));
  }, [products, productQuery]);

  function login() {
    if (password !== adminPassword) {
      setMessage('Неверный пароль');
      return;
    }
    window.sessionStorage.setItem('studio82_admin', '1');
    setLogged(true);
    setMessage('');
  }

  function logout() {
    window.sessionStorage.removeItem('studio82_admin');
    setLogged(false);
  }

  function persistProducts(next: Product[]) {
    setProducts(next);
    saveProducts(next);
  }

  function persistOrders(next: Order[]) {
    setOrders(next);
    saveOrders(next);
  }

  function updateProduct(id: string, patch: Partial<Product>) {
    persistProducts(products.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function updateSize(productId: string, size: string, stock: number) {
    persistProducts(
      products.map((p) =>
        p.id === productId ? { ...p, sizes: p.sizes.map((s) => (s.size === size ? { ...s, stock: Math.max(0, stock) } : s)) } : p,
      ),
    );
  }

  function addSize(productId: string) {
    const size = window.prompt('Введите размер, например 42.5');
    if (!size) return;
    persistProducts(products.map((p) => p.id === productId ? { ...p, sizes: [...p.sizes, { size, stock: 0 }] } : p));
  }

  function removeSize(productId: string, size: string) {
    persistProducts(products.map((p) => p.id === productId ? { ...p, sizes: p.sizes.filter((item) => item.size !== size) } : p));
  }

  function addProduct() {
    if (!draft.title.trim()) {
      setMessage('Введите название товара');
      return;
    }
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

    persistProducts([product, ...products]);
    setDraft(emptyDraft);
    setTab('products');
    setMessage('Товар добавлен');
  }

  function deleteProduct(id: string) {
    if (!window.confirm('Удалить товар?')) return;
    persistProducts(products.filter((product) => product.id !== id));
  }

  async function uploadDraftImages(files?: FileList | null) {
    const images = await readImageFiles(files);
    setDraft((current) => ({ ...current, images: [...current.images, ...images] }));
  }

  async function uploadProductImages(productId: string, files?: FileList | null) {
    const images = await readImageFiles(files);
    if (!images.length) return;
    const product = products.find((item) => item.id === productId);
    updateProduct(productId, { images: [...(product?.images || []), ...images].filter(Boolean) });
  }

  function removeProductImage(productId: string, index: number) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const nextImages = product.images.filter((_, imageIndex) => imageIndex !== index);
    updateProduct(productId, { images: nextImages.length ? nextImages : ['/placeholder-shoe.svg'] });
  }

  function removeDraftImage(index: number) {
    setDraft((current) => ({ ...current, images: current.images.filter((_, imageIndex) => imageIndex !== index) }));
  }

  function applyProductImageUrls(productId: string, value: string) {
    const current = products.find((product) => product.id === productId);
    const dataImages = current?.images.filter((image) => image.startsWith('data:')) || [];
    const urlImages = normalizeImageUrlList(value);
    updateProduct(productId, { images: [...dataImages, ...urlImages].filter(Boolean) });
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

        <div className="notice">
          Сейчас это MVP: изменения сохраняются в браузере администратора. Следующий этап — Supabase, чтобы товары, фото и заказы видели все клиенты.
        </div>

        <div className="admin-tabs">
          <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Товары</button>
          <button className={tab === 'add' ? 'active' : ''} onClick={() => setTab('add')}>Добавить</button>
          <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>Заказы</button>
        </div>

        {message && <p className="success-text">{message}</p>}

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
              <label className="upload-box">
                <span>Загрузить фото с компьютера</span>
                <input type="file" accept="image/*" multiple onChange={(e) => uploadDraftImages(e.target.files)} />
              </label>
              {draft.images.length > 0 && (
                <div className="admin-gallery">
                  {draft.images.map((image, index) => (
                    <div className="admin-photo square-media" key={image + index}>
                      <img src={image} alt="Фото товара" />
                      <button onClick={() => removeDraftImage(index)}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <input className="input" placeholder="Размеры и остатки: 40:1, 41:0, 42:2" value={draft.sizes} onChange={(e) => setDraft({ ...draft, sizes: e.target.value })} />
              <label className="toggle-line"><input type="checkbox" checked={draft.isPublished} onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })} /> <span>Опубликовать товар</span></label>
              <button className="btn" onClick={addProduct}>Добавить товар</button>
            </div>
          </section>
        )}

        {tab === 'orders' && (
          <section>
            <h2>Заказы</h2>
            <div className="admin-table">
              {orders.length === 0 && <div className="empty">Заказов пока нет</div>}
              {orders.map((order) => (
                <div className="admin-row" key={order.id}>
                  <b>#{order.id} — {order.customerName}</b>
                  <p className="muted">{order.phone} · {order.city} · {order.cdekPoint || 'ПВЗ не указан'}</p>
                  {order.items.map((item) => <p key={item.title + item.size}>{item.title}, размер {item.size} × {item.quantity}</p>)}
                  <b>{formatPrice(order.total)}</b>
                  <select className="input" value={order.status} onChange={(e) => persistOrders(orders.map((o) => (o.id === order.id ? { ...o, status: e.target.value as OrderStatus } : o)))}>
                    {statuses.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <input className="input" placeholder="Трек-номер СДЭК" value={order.trackNumber || ''} onChange={(e) => persistOrders(orders.map((o) => (o.id === order.id ? { ...o, trackNumber: e.target.value } : o)))} />
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'products' && (
          <section>
            <div className="admin-section-head">
              <h2>Товары</h2>
              <button className="btn light" onClick={() => setTab('add')}>+ Добавить</button>
            </div>
            <input className="input" placeholder="Поиск товара" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} />
            <div className="admin-table">
              {filteredProducts.map((product) => (
                <div className="admin-row" key={product.id}>
                  <div className="admin-product-top">
                    <img className="admin-thumb" src={safeImage(product)} alt={product.title} />
                    <div>
                      <b>{product.title}</b>
                      <p className="muted">{formatPrice(product.price)} · {product.isPublished ? 'опубликован' : 'скрыт'}</p>
                    </div>
                  </div>
                  <input className="input" placeholder="Бренд" value={product.brand} onChange={(e) => updateProduct(product.id, { brand: e.target.value })} />
                  <input className="input" placeholder="Название" value={product.title} onChange={(e) => updateProduct(product.id, { title: e.target.value, name: e.target.value })} />
                  <input className="input" placeholder="Цвет" value={product.color} onChange={(e) => updateProduct(product.id, { color: e.target.value })} />
                  <input className="input" type="number" placeholder="Цена" value={product.price} onChange={(e) => updateProduct(product.id, { price: Number(e.target.value) })} />
                  <textarea className="input" rows={3} placeholder="Описание" value={product.description} onChange={(e) => updateProduct(product.id, { description: e.target.value })} />
                  <textarea className="input" rows={2} placeholder="Ссылки на фото — каждая с новой строки" value={product.images.filter((image) => !image.startsWith('data:')).join('\n')} onChange={(e) => applyProductImageUrls(product.id, e.target.value)} />
                  <label className="upload-box">
                    <span>Добавить фото</span>
                    <input type="file" accept="image/*" multiple onChange={(e) => uploadProductImages(product.id, e.target.files)} />
                  </label>
                  <div className="admin-gallery">
                    {product.images.map((image, index) => (
                      <div className="admin-photo square-media" key={image + index}>
                        <img src={image} alt={product.title} />
                        <button onClick={() => removeProductImage(product.id, index)}>×</button>
                      </div>
                    ))}
                  </div>
                  <input className="input" value={sizesToText(product.sizes)} onChange={(e) => updateProduct(product.id, { sizes: parseSizes(e.target.value) })} />
                  <div className="stock-grid">
                    {product.sizes.map((s) => (
                      <label className="stock-badge" key={s.size}>
                        <span>{s.size}</span>
                        <input type="number" value={s.stock} onChange={(e) => updateSize(product.id, s.size, Number(e.target.value))} />
                        <button type="button" onClick={() => removeSize(product.id, s.size)}>×</button>
                      </label>
                    ))}
                  </div>
                  <button className="btn light" onClick={() => addSize(product.id)}>+ Размер</button>
                  <div className="row">
                    <button className="btn light" onClick={() => updateProduct(product.id, { isPublished: !product.isPublished })}>
                      {product.isPublished ? 'Скрыть' : 'Опубликовать'}
                    </button>
                    <button className="btn danger" onClick={() => deleteProduct(product.id)}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn light full" onClick={() => { if (window.confirm('Вернуть стартовый каталог? Все локальные изменения товаров будут удалены.')) { resetProducts(); setProducts(getProducts()); } }}>Сбросить товары к стартовым</button>
          </section>
        )}
      </div>
    </main>
  );
}

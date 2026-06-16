'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatPrice, getOrders, getProducts, saveOrders, saveProducts } from '@/lib/store';
import type { Order, OrderStatus, Product, ProductSize } from '@/types';

const statuses: OrderStatus[] = ['Новый', 'Оплачен', 'Собирается', 'Передан в СДЭК', 'В пути', 'Готов к выдаче', 'Завершён'];

const emptyProduct = {
  brand: '',
  title: '',
  color: '',
  description: '',
  price: 0,
  image: '',
  sizes: '36:0, 37:0, 38:0, 39:0, 40:0, 41:0, 42:0, 43:0, 44:0',
};

function createId(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'product'}-${Date.now().toString().slice(-5)}`;
}

function parseSizes(value: string): ProductSize[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [size, stockRaw] = item.split(':').map((part) => part.trim());
      return { size, stock: Number(stockRaw || 0) || 0 };
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

export default function AdminPage() {
  const [logged, setLogged] = useState(false);
  const [password, setPassword] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [newProduct, setNewProduct] = useState(emptyProduct);
  const [message, setMessage] = useState('');

  const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin82';

  useEffect(() => {
    setLogged(window.sessionStorage.getItem('studio82_admin') === '1');
    setProducts(getProducts());
    setOrders(getOrders());
  }, []);

  const publishedCount = useMemo(() => products.filter((product) => product.isPublished).length, [products]);

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
        p.id === productId ? { ...p, sizes: p.sizes.map((s) => (s.size === size ? { ...s, stock } : s)) } : p,
      ),
    );
  }

  function addProduct() {
    if (!newProduct.title.trim()) {
      setMessage('Введите название товара');
      return;
    }

    const product: Product = {
      id: createId(newProduct.title),
      brand: newProduct.brand.trim() || 'STUDIO 82',
      name: newProduct.title.trim(),
      title: newProduct.title.trim(),
      color: newProduct.color.trim(),
      description: newProduct.description.trim() || 'Описание можно изменить в админ-панели.',
      price: Number(newProduct.price) || 0,
      images: [newProduct.image || '/placeholder-shoe.svg'],
      isPublished: true,
      sizes: parseSizes(newProduct.sizes),
    };

    persistProducts([product, ...products]);
    setNewProduct(emptyProduct);
    setMessage('Товар добавлен');
  }

  function deleteProduct(id: string) {
    if (!window.confirm('Удалить товар?')) return;
    persistProducts(products.filter((product) => product.id !== id));
  }

  async function uploadNewProductImage(file?: File) {
    if (!file) return;
    const image = await readImageFile(file);
    setNewProduct((current) => ({ ...current, image }));
  }

  async function uploadProductImage(productId: string, file?: File) {
    if (!file) return;
    const image = await readImageFile(file);
    updateProduct(productId, { images: [image] });
  }

  if (!logged) {
    return (
      <main className="app">
        <div className="page">
          <h1 className="title">Админка</h1>
          <p className="muted">Раздел скрыт из меню магазина. Вход только для владельца.</p>
          <input className="input" type="password" placeholder="Пароль администратора" value={password} onChange={(e) => setPassword(e.target.value)} />
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
            <p className="muted">Товаров опубликовано: {publishedCount}</p>
          </div>
          <button className="btn light" onClick={logout}>Выйти</button>
        </div>

        <div className="notice">
          Сейчас это MVP: изменения сохраняются в браузере администратора. Для боевого режима подключим базу данных и хранилище фото, чтобы изменения видели все клиенты.
        </div>

        {message && <p className="success-text">{message}</p>}

        <h2>Добавить товар</h2>
        <div className="admin-row form">
          <input className="input" placeholder="Бренд, например Nike" value={newProduct.brand} onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })} />
          <input className="input" placeholder="Название модели" value={newProduct.title} onChange={(e) => setNewProduct({ ...newProduct, title: e.target.value })} />
          <input className="input" placeholder="Цвет" value={newProduct.color} onChange={(e) => setNewProduct({ ...newProduct, color: e.target.value })} />
          <input className="input" type="number" placeholder="Цена" value={newProduct.price || ''} onChange={(e) => setNewProduct({ ...newProduct, price: Number(e.target.value) })} />
          <textarea className="input" rows={3} placeholder="Описание" value={newProduct.description} onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })} />
          <input className="input" placeholder="Размеры и остатки: 40:1, 41:0, 42:2" value={newProduct.sizes} onChange={(e) => setNewProduct({ ...newProduct, sizes: e.target.value })} />
          <input className="input" placeholder="Ссылка на фото" value={newProduct.image} onChange={(e) => setNewProduct({ ...newProduct, image: e.target.value })} />
          <label className="upload-box">
            <span>Загрузить фото с компьютера</span>
            <input type="file" accept="image/*" onChange={(e) => uploadNewProductImage(e.target.files?.[0])} />
          </label>
          {newProduct.image && <img className="admin-preview" src={newProduct.image} alt="Новое фото" />}
          <button className="btn" onClick={addProduct}>Добавить товар</button>
        </div>

        <h2>Заказы</h2>
        <div className="admin-table">
          {orders.length === 0 && <div className="empty">Заказов пока нет</div>}
          {orders.map((order) => (
            <div className="admin-row" key={order.id}>
              <b>#{order.id} — {order.customerName}</b>
              <p className="muted">{order.phone} · {order.city} · {order.cdekPoint}</p>
              {order.items.map((item) => <p key={item.title + item.size}>{item.title}, размер {item.size}</p>)}
              <select className="input" value={order.status} onChange={(e) => persistOrders(orders.map((o) => (o.id === order.id ? { ...o, status: e.target.value as OrderStatus } : o)))}>
                {statuses.map((s) => <option key={s}>{s}</option>)}
              </select>
              <input className="input" placeholder="Трек-номер СДЭК" value={order.trackNumber || ''} onChange={(e) => persistOrders(orders.map((o) => (o.id === order.id ? { ...o, trackNumber: e.target.value } : o)))} />
            </div>
          ))}
        </div>

        <h2>Товары</h2>
        <div className="admin-table">
          {products.map((product) => (
            <div className="admin-row" key={product.id}>
              <div className="admin-product-top">
                <img className="admin-thumb" src={product.images[0] || '/placeholder-shoe.svg'} alt={product.title} />
                <div>
                  <b>{product.title}</b>
                  <p className="muted">{formatPrice(product.price)}</p>
                </div>
              </div>
              <input className="input" placeholder="Бренд" value={product.brand} onChange={(e) => updateProduct(product.id, { brand: e.target.value })} />
              <input className="input" placeholder="Название" value={product.title} onChange={(e) => updateProduct(product.id, { title: e.target.value, name: e.target.value })} />
              <input className="input" placeholder="Цвет" value={product.color} onChange={(e) => updateProduct(product.id, { color: e.target.value })} />
              <input className="input" type="number" placeholder="Цена" value={product.price} onChange={(e) => updateProduct(product.id, { price: Number(e.target.value) })} />
              <textarea className="input" rows={3} placeholder="Описание" value={product.description} onChange={(e) => updateProduct(product.id, { description: e.target.value })} />
              <input className="input" placeholder="Ссылка на фото" value={product.images[0] || ''} onChange={(e) => updateProduct(product.id, { images: [e.target.value] })} />
              <label className="upload-box">
                <span>Заменить фото</span>
                <input type="file" accept="image/*" onChange={(e) => uploadProductImage(product.id, e.target.files?.[0])} />
              </label>
              <input className="input" value={sizesToText(product.sizes)} onChange={(e) => updateProduct(product.id, { sizes: parseSizes(e.target.value) })} />
              <div className="sizes">
                {product.sizes.map((s) => (
                  <label className="badge" key={s.size}>
                    {s.size}: <input style={{ width: 42, marginLeft: 6 }} type="number" value={s.stock} onChange={(e) => updateSize(product.id, s.size, Number(e.target.value))} />
                  </label>
                ))}
              </div>
              <div className="row">
                <button className="btn light" onClick={() => updateProduct(product.id, { isPublished: !product.isPublished })}>
                  {product.isPublished ? 'Скрыть' : 'Опубликовать'}
                </button>
                <button className="btn danger" onClick={() => deleteProduct(product.id)}>Удалить</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

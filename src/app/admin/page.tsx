'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  createCdekShipmentInDb,
  createProductInDb,
  deleteProductFromDb,
  fetchOrders,
  fetchProducts,
  formatPrice,
  safeImage,
  saveProductToDb,
  refreshCdekOrderStatus,
  updateOrderInDb,
  uploadImages,
} from '@/lib/store';
import type { Order, OrderStatus, Product, ProductSize } from '@/types';

const statuses: OrderStatus[] = ['Новый', 'Оплачен', 'Собирается', 'Передан в СДЭК', 'В пути', 'Готов к выдаче', 'Завершён'];
type AdminTab = 'products' | 'add' | 'orders';
type ProductFormDraft = {
  brand: string;
  name: string;
  color: string;
  description: string;
  price: string;
  images: string[];
  imageUrl: string;
  sizes: ProductSize[];
  isPublished: boolean;
};

const commonSizes = ['36', '36.5', '37', '37.5', '38', '38.5', '39', '40', '41', '42', '43', '44', '45'];
const emptyDraft: ProductFormDraft = {
  brand: '',
  name: '',
  color: '',
  description: '',
  price: '',
  images: [],
  imageUrl: '',
  sizes: [],
  isPublished: true,
};

function createId(value: string) {
  const slug = value.toLowerCase().trim().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${slug || 'product'}-${Date.now().toString().slice(-6)}`;
}

function normalizeImageUrlList(value: string) {
  return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

function uniqueImages(images: string[]) {
  return Array.from(new Set(images.map((item) => item.trim()).filter(Boolean)));
}

function productName(product: Product) {
  return product.name || product.title || 'Без названия';
}

function productSubtitle(product: Product) {
  return [product.brand, product.color].filter(Boolean).join(' · ');
}

function productToDraft(product: Product): ProductFormDraft {
  return {
    brand: product.brand || '',
    name: product.name || product.title || '',
    color: product.color || '',
    description: product.description || '',
    price: String(product.price || ''),
    images: product.images?.filter(Boolean) || [],
    imageUrl: '',
    sizes: product.sizes?.length ? product.sizes.map((item) => ({ size: item.size, stock: Number(item.stock || 0) })) : [],
    isPublished: Boolean(product.isPublished),
  };
}

function addStandardSizesToDraft(draft: ProductFormDraft) {
  const existing = new Set(draft.sizes.map((item) => item.size));
  const additions = commonSizes.filter((size) => !existing.has(size)).map((size) => ({ size, stock: 0 }));
  return { ...draft, sizes: [...draft.sizes, ...additions] };
}

function sortSizes(sizes: ProductSize[]) {
  return [...sizes]
    .filter((item) => item.size.trim())
    .map((item) => ({ size: item.size.trim().replace(',', '.'), stock: Math.max(0, Number(item.stock || 0)) }))
    .sort((a, b) => Number(a.size) - Number(b.size));
}

export default function AdminPage() {
  const [logged, setLogged] = useState(false);
  const [password, setPassword] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [draft, setDraft] = useState<ProductFormDraft>(emptyDraft);
  const [editDrafts, setEditDrafts] = useState<Record<string, ProductFormDraft>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>('products');
  const [productQuery, setProductQuery] = useState('');

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
    return products.filter((product) => !query || `${product.brand} ${productName(product)} ${product.color}`.toLowerCase().includes(query));
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

  function startEdit(product: Product) {
    setEditingId(product.id);
    setEditDrafts((current) => ({ ...current, [product.id]: current[product.id] || productToDraft(product) }));
  }

  function cancelEdit(productId: string) {
    setEditingId(null);
    setEditDrafts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }

  function patchEdit(productId: string, patch: Partial<ProductFormDraft>) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setEditDrafts((current) => ({
      ...current,
      [productId]: { ...(current[productId] || productToDraft(product)), ...patch },
    }));
  }

  function updateDraftSize(productId: string, index: number, patch: Partial<ProductSize>) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const currentDraft = editDrafts[productId] || productToDraft(product);
    const sizes = currentDraft.sizes.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
    patchEdit(productId, { sizes });
  }

  function addDraftSize(productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const currentDraft = editDrafts[productId] || productToDraft(product);
    patchEdit(productId, { sizes: [...currentDraft.sizes, { size: '', stock: 1 }] });
  }

  function removeDraftSize(productId: string, index: number) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const currentDraft = editDrafts[productId] || productToDraft(product);
    patchEdit(productId, { sizes: currentDraft.sizes.filter((_, itemIndex) => itemIndex !== index) });
  }

  function updateNewProductSize(index: number, patch: Partial<ProductSize>) {
    setDraft((current) => ({
      ...current,
      sizes: current.sizes.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  }

  function addNewProductSize() {
    setDraft((current) => ({ ...current, sizes: [...current.sizes, { size: '', stock: 1 }] }));
  }

  function removeNewProductSize(index: number) {
    setDraft((current) => ({ ...current, sizes: current.sizes.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function draftToProduct(productId: string, formDraft: ProductFormDraft, original?: Product): Product {
    const urlImages = normalizeImageUrlList(formDraft.imageUrl);
    const images = uniqueImages([...formDraft.images, ...urlImages]);
    const name = formDraft.name.trim();
    return {
      id: productId,
      brand: formDraft.brand.trim() || 'STUDIO 82',
      name,
      title: name,
      color: formDraft.color.trim(),
      description: formDraft.description.trim() || 'Описание можно изменить в админ-панели.',
      price: Number(formDraft.price) || 0,
      images: images.length ? images : original?.images?.length ? original.images : ['/placeholder-shoe.svg'],
      isPublished: formDraft.isPublished,
      sizes: sortSizes(formDraft.sizes),
    };
  }

  async function saveEditedProduct(productId: string) {
    const original = products.find((item) => item.id === productId);
    const formDraft = editDrafts[productId];
    if (!original || !formDraft) return;
    if (!formDraft.name.trim()) {
      setMessage('Введите название модели');
      return;
    }
    try {
      setSavingId(productId);
      setMessage('Сохраняем товар...');
      const product = draftToProduct(productId, formDraft, original);
      const next = await saveProductToDb(product, adminPassword);
      setProducts(next);
      setEditingId(null);
      setEditDrafts((current) => {
        const updated = { ...current };
        delete updated[productId];
        return updated;
      });
      setMessage('Товар сохранён');
    } catch (err: any) {
      setMessage(err.message || 'Ошибка сохранения');
    } finally {
      setSavingId(null);
    }
  }

  async function addProduct() {
    try {
      if (!draft.name.trim()) throw new Error('Введите название товара');
      setMessage('Добавляем товар...');
      const product = draftToProduct(createId(draft.name), draft);
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
      setMessage(`Загружаем фото: ${files.length} шт...`);
      const urls = await uploadImages(files, adminPassword);
      setDraft((current) => ({ ...current, images: uniqueImages([...current.images, ...urls]) }));
      setMessage('Фото загружены');
    } catch (err: any) {
      setMessage(err.message || 'Не удалось загрузить фото');
    }
  }

  async function uploadProductImages(productId: string, files?: FileList | null) {
    if (!files?.length) return;
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    try {
      setMessage(`Загружаем фото: ${files.length} шт...`);
      const urls = await uploadImages(files, adminPassword);
      const currentDraft = editDrafts[productId] || productToDraft(product);
      setEditDrafts((current) => ({
        ...current,
        [productId]: { ...currentDraft, images: uniqueImages([...currentDraft.images, ...urls]) },
      }));
      setMessage('Фото добавлены. Нажмите «Сохранить товар».');
    } catch (err: any) {
      setMessage(err.message || 'Не удалось загрузить фото');
    }
  }

  function removeProductImage(productId: string, index: number) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const currentDraft = editDrafts[productId] || productToDraft(product);
    patchEdit(productId, { images: currentDraft.images.filter((_, imageIndex) => imageIndex !== index) });
  }

  function removeDraftImage(index: number) {
    setDraft((current) => ({ ...current, images: current.images.filter((_, imageIndex) => imageIndex !== index) }));
  }

  function addImageUrlsToEdit(productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const currentDraft = editDrafts[productId] || productToDraft(product);
    const urls = normalizeImageUrlList(currentDraft.imageUrl);
    if (!urls.length) {
      setMessage('Вставьте ссылку на фото');
      return;
    }
    patchEdit(productId, { images: uniqueImages([...currentDraft.images, ...urls]), imageUrl: '' });
  }

  function addImageUrlsToNewProduct() {
    const urls = normalizeImageUrlList(draft.imageUrl);
    if (!urls.length) {
      setMessage('Вставьте ссылку на фото');
      return;
    }
    setDraft((current) => ({ ...current, images: uniqueImages([...current.images, ...urls]), imageUrl: '' }));
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

  function replaceOrder(nextOrder: Order) {
    setOrders((current) => current.map((item) => (item.dbId === nextOrder.dbId ? nextOrder : item)));
  }

  async function createCdekShipment(order: Order) {
    if (!order.dbId) return;
    try {
      setSavingId(`cdek-create-${order.dbId}`);
      setMessage('Создаём отправление в СДЭК...');
      const nextOrder = await createCdekShipmentInDb(order.dbId, adminPassword);
      replaceOrder(nextOrder);
      setMessage(nextOrder.trackNumber ? `Отправление СДЭК создано: ${nextOrder.trackNumber}` : 'Отправление СДЭК создано. Номер может появиться после обновления статуса.');
    } catch (err: any) {
      setMessage(err.message || 'Не удалось создать отправление СДЭК');
    } finally {
      setSavingId(null);
    }
  }

  async function refreshCdekStatus(order: Order) {
    if (!order.dbId) return;
    try {
      setSavingId(`cdek-status-${order.dbId}`);
      setMessage('Обновляем статус СДЭК...');
      const nextOrder = await refreshCdekOrderStatus(order.dbId, adminPassword);
      replaceOrder(nextOrder);
      setMessage('Статус СДЭК обновлён');
    } catch (err: any) {
      setMessage(err.message || 'Не удалось обновить статус СДЭК');
    } finally {
      setSavingId(null);
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
          <button className="btn full" onClick={login}>Войти</button>
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

        <div className="notice">Данные сохраняются в Supabase. Фото можно загружать сразу пачкой, размеры редактируются строками.</div>

        <div className="admin-tabs">
          <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Товары</button>
          <button className={tab === 'add' ? 'active' : ''} onClick={() => setTab('add')}>Добавить</button>
          <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>Заказы</button>
        </div>

        {loading && <p className="muted">Загрузка...</p>}
        {message && <p className={message.toLowerCase().includes('ош') || message.includes('Не') || message.includes('Невер') || message.includes('СДЭК API') ? 'error-text' : 'success-text'}>{message}</p>}

        {tab === 'add' && (
          <section className="admin-card">
            <h2>Новый товар</h2>
            <div className="form admin-form">
              <label><span>Бренд</span><input className="input" placeholder="Nike" value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} /></label>
              <label><span>Модель</span><input className="input" placeholder="V2K Run" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
              <label><span>Цвет</span><input className="input" placeholder="Grey / Silver" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></label>
              <label><span>Цена</span><input className="input" type="number" placeholder="16990" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></label>
              <label><span>Описание</span><textarea className="input" rows={4} placeholder="Описание товара" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>

              <div className="admin-block">
                <div className="row-between"><b>Фото</b><span className="muted">Можно выбрать несколько файлов сразу</span></div>
                <label className="upload-box"><span>Загрузить фото</span><input type="file" accept="image/*" multiple onChange={(e) => { uploadDraftImages(e.target.files); e.currentTarget.value = ''; }} /></label>
                <div className="row">
                  <textarea className="input" rows={2} placeholder="Ссылки на фото — каждая с новой строки" value={draft.imageUrl} onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })} />
                  <button className="btn light" type="button" onClick={addImageUrlsToNewProduct}>Добавить ссылки</button>
                </div>
                {draft.images.length > 0 && <div className="admin-gallery">{draft.images.map((image, index) => <div className="admin-photo square-media" key={image + index}><img src={image} alt="Фото товара" /><button type="button" onClick={() => removeDraftImage(index)}>×</button></div>)}</div>}
              </div>

              <div className="admin-block">
                <div className="row-between"><b>Размеры и остатки</b><button className="btn light small" type="button" onClick={() => setDraft(addStandardSizesToDraft(draft))}>36–45</button></div>
                <div className="size-editor-list">
                  {draft.sizes.map((size, index) => (
                    <div className="size-editor-row" key={`${size.size}-${index}`}>
                      <input className="input" placeholder="Размер" value={size.size} onChange={(e) => updateNewProductSize(index, { size: e.target.value })} />
                      <input className="input" type="number" placeholder="Остаток" value={size.stock} onChange={(e) => updateNewProductSize(index, { stock: Number(e.target.value) })} />
                      <button className="btn light" type="button" onClick={() => removeNewProductSize(index)}>×</button>
                    </div>
                  ))}
                </div>
                <button className="btn light" type="button" onClick={addNewProductSize}>+ Добавить размер</button>
              </div>

              <label className="toggle-line"><input type="checkbox" checked={draft.isPublished} onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })} /> <span>Опубликовать товар</span></label>
              <button className="btn full" onClick={addProduct}>Добавить товар</button>
            </div>
          </section>
        )}

        {tab === 'products' && (
          <section>
            <input className="input search" placeholder="Поиск товара в админке" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} />
            <div className="admin-products">
              {filteredProducts.map((product) => {
                const editing = editingId === product.id;
                const formDraft = editDrafts[product.id] || productToDraft(product);
                return (
                  <div className="admin-product-card" key={product.id}>
                    <div className="admin-product-summary">
                      <div className="admin-preview square-media"><img src={safeImage(product)} alt={productName(product)} /></div>
                      <div>
                        <b>{productName(product)}</b>
                        <p className="muted">{productSubtitle(product) || 'Без бренда/цвета'}</p>
                        <span>{formatPrice(product.price)}</span>
                      </div>
                      <span className={`admin-status ${product.isPublished ? 'on' : 'off'}`}>{product.isPublished ? 'Опубликован' : 'Скрыт'}</span>
                    </div>
                    <div className="admin-actions">
                      <button className="btn light" onClick={() => (editing ? cancelEdit(product.id) : startEdit(product))}>{editing ? 'Закрыть' : 'Редактировать'}</button>
                      <button className="btn danger" onClick={() => deleteProduct(product.id)}>Удалить</button>
                    </div>

                    {editing && (
                      <div className="admin-edit-panel">
                        <div className="form admin-form">
                          <label><span>Бренд</span><input className="input" value={formDraft.brand} onChange={(e) => patchEdit(product.id, { brand: e.target.value })} /></label>
                          <label><span>Модель</span><input className="input" value={formDraft.name} onChange={(e) => patchEdit(product.id, { name: e.target.value })} /></label>
                          <label><span>Цвет</span><input className="input" value={formDraft.color} onChange={(e) => patchEdit(product.id, { color: e.target.value })} /></label>
                          <label><span>Цена</span><input className="input" type="number" value={formDraft.price} onChange={(e) => patchEdit(product.id, { price: e.target.value })} /></label>
                          <label><span>Описание</span><textarea className="input" rows={4} value={formDraft.description} onChange={(e) => patchEdit(product.id, { description: e.target.value })} /></label>

                          <div className="admin-block">
                            <div className="row-between"><b>Фото</b><span className="muted">Порядок фото сохраняется как в списке</span></div>
                            <label className="upload-box"><span>Добавить фото пачкой</span><input type="file" accept="image/*" multiple onChange={(e) => { uploadProductImages(product.id, e.target.files); e.currentTarget.value = ''; }} /></label>
                            <div className="row">
                              <textarea className="input" rows={2} placeholder="Новые ссылки на фото" value={formDraft.imageUrl} onChange={(e) => patchEdit(product.id, { imageUrl: e.target.value })} />
                              <button className="btn light" type="button" onClick={() => addImageUrlsToEdit(product.id)}>Добавить ссылки</button>
                            </div>
                            <div className="admin-gallery">{formDraft.images.map((image, index) => <div className="admin-photo square-media" key={image + index}><img src={image} alt="Фото" /><button type="button" onClick={() => removeProductImage(product.id, index)}>×</button></div>)}</div>
                          </div>

                          <div className="admin-block">
                            <div className="row-between"><b>Размеры и остатки</b><button className="btn light small" type="button" onClick={() => patchEdit(product.id, addStandardSizesToDraft(formDraft))}>36–45</button></div>
                            <div className="size-editor-list">
                              {formDraft.sizes.map((size, index) => (
                                <div className="size-editor-row" key={`${size.size}-${index}`}>
                                  <input className="input" placeholder="Размер" value={size.size} onChange={(e) => updateDraftSize(product.id, index, { size: e.target.value })} />
                                  <input className="input" type="number" placeholder="Остаток" value={size.stock} onChange={(e) => updateDraftSize(product.id, index, { stock: Number(e.target.value) })} />
                                  <button className="btn light" type="button" onClick={() => removeDraftSize(product.id, index)}>×</button>
                                </div>
                              ))}
                            </div>
                            <button className="btn light" type="button" onClick={() => addDraftSize(product.id)}>+ Добавить размер</button>
                          </div>

                          <label className="toggle-line"><input type="checkbox" checked={formDraft.isPublished} onChange={(e) => patchEdit(product.id, { isPublished: e.target.checked })} /> <span>{formDraft.isPublished ? 'Опубликован' : 'Скрыт'}</span></label>
                          <div className="sticky-save-row">
                            <button className="btn full" disabled={savingId === product.id} onClick={() => saveEditedProduct(product.id)}>{savingId === product.id ? 'Сохраняем...' : 'Сохранить товар'}</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
                  <p className="muted">{order.deliveryType === 'moscow' ? 'Доставка по Москве' : order.cdekDeliveryMode === 'courier' ? 'СДЭК курьером' : 'СДЭК ПВЗ/постамат'} · {order.city} · {order.cdekPoint || 'адрес не указан'}</p>
                  {order.cdekDeliveryPrice ? <p className="muted">Стоимость СДЭК: {formatPrice(order.cdekDeliveryPrice)}{order.cdekTariffCode ? ` · тариф ${order.cdekTariffCode}` : ''}</p> : null}
                  {order.cdekPackageHeight ? <p className="muted">Упаковка СДЭК: {order.cdekPackageType ? `${order.cdekPackageType} · ` : ''}{order.cdekPackageLength}×{order.cdekPackageWidth}×{order.cdekPackageHeight} см · {order.cdekPackageWeight} г</p> : null}
                  {order.cdekOrderUuid ? <p className="muted">UUID СДЭК: {order.cdekOrderUuid}</p> : null}
                  {order.trackNumber ? <p><b>Трек СДЭК: {order.trackNumber}</b></p> : null}
                  {order.cdekStatus ? <p className="muted">Статус СДЭК: {order.cdekStatusDescription || order.cdekStatus}</p> : null}
                  {order.telegramUsername && <p className="muted">Telegram: @{order.telegramUsername}</p>}
                  {order.items.map((item) => <p key={item.title + item.size}>{item.title}, размер {item.size} × {item.quantity}</p>)}
                  <select className="input" value={order.status} onChange={(e) => updateOrder(order, { status: e.target.value as OrderStatus })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
                  <input className="input" placeholder="Трек-номер СДЭК" value={order.trackNumber || ''} onChange={(e) => updateOrder(order, { trackNumber: e.target.value })} />
                  {order.deliveryType === 'cdek' && (
                    <div className="row">
                      <button className="btn light" disabled={savingId === `cdek-create-${order.dbId}`} onClick={() => createCdekShipment(order)}>
                        {order.cdekOrderUuid ? 'Отправление создано' : 'Создать отправление СДЭК'}
                      </button>
                      <button className="btn light" disabled={!order.cdekOrderUuid || savingId === `cdek-status-${order.dbId}`} onClick={() => refreshCdekStatus(order)}>
                        Обновить статус СДЭК
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

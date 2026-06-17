'use client';

import { seedProducts } from '@/data/products';
import type { CartItem, Order, Product } from '@/types';

const CART_KEY = 'studio82_cart';
const LEGACY_PRODUCTS_KEY = 'studio82_products';
const LEGACY_ORDERS_KEY = 'studio82_orders';

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(`studio82:${key}`));
}

export async function fetchProducts(adminPassword?: string): Promise<Product[]> {
  const admin = Boolean(adminPassword);
  const response = await fetch(`/api/products${admin ? '?admin=1' : ''}`, {
    cache: 'no-store',
    headers: adminPassword ? { 'x-admin-password': adminPassword } : undefined,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось загрузить товары');
  }
  const data = await response.json();
  return data.products || [];
}

export async function saveProductToDb(product: Product, adminPassword: string): Promise<Product[]> {
  const response = await fetch(`/api/products${product.id ? `/${product.id}` : ''}`, {
    method: product.id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
    body: JSON.stringify(product),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось сохранить товар');
  }
  const data = await response.json();
  return data.products || [];
}

export async function createProductInDb(product: Product, adminPassword: string): Promise<Product[]> {
  const response = await fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
    body: JSON.stringify(product),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось добавить товар');
  }
  const data = await response.json();
  return data.products || [];
}

export async function deleteProductFromDb(productId: string, adminPassword: string): Promise<Product[]> {
  const response = await fetch(`/api/products/${productId}`, {
    method: 'DELETE',
    headers: { 'x-admin-password': adminPassword },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось удалить товар');
  }
  const data = await response.json();
  return data.products || [];
}

const MAX_UPLOAD_FILES = 8;
const MAX_IMAGE_SIDE = 1800;
const JPEG_QUALITY = 0.86;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать фото. Используйте JPG, PNG или WEBP.'));
    };
    image.src = url;
  });
}

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Можно загружать только изображения');
  }

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не удалось подготовить фото к загрузке');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('Не удалось сжать фото');

  const safeName = file.name.replace(/\.[^.]+$/, '') || 'product-photo';
  return new File([blob], `${safeName}.jpg`, { type: 'image/jpeg' });
}

export async function uploadImages(files: FileList | File[], adminPassword: string): Promise<string[]> {
  const inputFiles = Array.from(files).filter((file) => file.size > 0);
  if (!inputFiles.length) return [];
  if (inputFiles.length > MAX_UPLOAD_FILES) {
    throw new Error(`За один раз можно загрузить максимум ${MAX_UPLOAD_FILES} фото`);
  }

  const preparedFiles = await Promise.all(inputFiles.map(compressImage));
  const formData = new FormData();
  preparedFiles.forEach((file) => formData.append('files', file));

  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'x-admin-password': adminPassword },
    body: formData,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось загрузить фото');
  }
  const data = await response.json();
  return data.urls || [];
}

export function getTelegramInitData() {
  if (typeof window === 'undefined') return '';
  return (window as any).Telegram?.WebApp?.initData || '';
}

export async function fetchOrders(adminPassword?: string): Promise<Order[]> {
  const params = new URLSearchParams();
  if (adminPassword) params.set('admin', '1');
  const initData = getTelegramInitData();
  const response = await fetch(`/api/orders?${params.toString()}`, {
    cache: 'no-store',
    headers: {
      ...(adminPassword ? { 'x-admin-password': adminPassword } : {}),
      ...(!adminPassword && initData ? { 'x-telegram-init-data': initData } : {}),
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось загрузить заказы');
  }
  const data = await response.json();
  return data.orders || [];
}

export async function createOrderInDb(payload: {
  cart: CartItem[];
  customerName: string;
  phone: string;
  city: string;
  cdekPoint?: string;
  deliveryType?: 'cdek' | 'cdek_pickup' | 'moscow' | string;
  cdekDeliveryMode?: 'pickup' | 'courier' | string;
  cdekCityCode?: number | null;
  cdekPointCode?: string;
  cdekPointAddress?: string;
  cdekRecipientAddress?: string;
  cdekDeliveryPrice?: number;
  cdekTariffCode?: number | null;
  telegramId?: string;
  telegramUsername?: string;
}) {
  const initData = getTelegramInitData();
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(initData ? { 'x-telegram-init-data': initData } : {}),
    },
    body: JSON.stringify({ ...payload, telegramInitData: initData }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось создать заказ');
  }
  const data = await response.json();
  return data.order as Order;
}

export async function updateOrderInDb(orderId: string, adminPassword: string, patch: { status?: string; trackNumber?: string; paymentStatus?: string }) {
  const response = await fetch(`/api/orders/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось обновить заказ');
  }
}

// Legacy helpers for fallback/compatibility
export function getProducts(): Product[] {
  return read<Product[]>(LEGACY_PRODUCTS_KEY, seedProducts);
}

export function saveProducts(products: Product[]) {
  write(LEGACY_PRODUCTS_KEY, products);
}

export function getOrders(): Order[] {
  return read<Order[]>(LEGACY_ORDERS_KEY, []);
}

export function saveOrders(orders: Order[]) {
  write(LEGACY_ORDERS_KEY, orders);
}

export function getCart(): CartItem[] {
  return read<CartItem[]>(CART_KEY, []);
}

export function saveCart(cart: CartItem[]) {
  write(CART_KEY, cart);
}

export function formatPrice(value: number) {
  return new Intl.NumberFormat('ru-RU').format(value || 0) + ' ₽';
}

export function safeImage(product?: Product | null) {
  return product?.images?.find(Boolean) || '/placeholder-shoe.svg';
}

export function productAvailable(product: Product) {
  return product.isPublished && product.sizes.some((size) => Number(size.stock) > 0);
}

export function getTelegramUser() {
  if (typeof window === 'undefined') return null;
  return (window as any).Telegram?.WebApp?.initDataUnsafe?.user || null;
}

export async function fetchCustomerProfile() {
  const initData = getTelegramInitData();
  if (!initData) return null;
  const response = await fetch('/api/customer-profile', {
    cache: 'no-store',
    headers: { 'x-telegram-init-data': initData },
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  return data.profile || null;
}

export async function requestTelegramContact(): Promise<{ ok: boolean; status?: string; message?: string }> {
  if (typeof window === 'undefined') return { ok: false, message: 'Telegram недоступен' };
  const tg = (window as any).Telegram?.WebApp;
  if (!tg?.requestContact) {
    return { ok: false, message: 'Ваш Telegram не поддерживает быструю передачу номера. Введите телефон вручную.' };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { ok: boolean; status?: string; message?: string }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const handler = (event: any) => {
      tg.offEvent?.('contactRequested', handler);
      finish({ ok: event?.status === 'sent', status: event?.status });
    };

    tg.onEvent?.('contactRequested', handler);
    try {
      tg.requestContact((accepted: boolean) => {
        finish({ ok: Boolean(accepted), status: accepted ? 'sent' : 'cancelled' });
      });
    } catch {
      tg.offEvent?.('contactRequested', handler);
      finish({ ok: false, message: 'Не удалось запросить номер. Введите телефон вручную.' });
    }
  });
}

export async function searchCdekCities(query: string) {
  const response = await fetch(`/api/cdek/cities?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось найти город СДЭК');
  }
  const data = await response.json();
  return data.cities || [];
}

export async function fetchCdekDeliveryPoints(cityCode: number) {
  const response = await fetch(`/api/cdek/delivery-points?cityCode=${encodeURIComponent(String(cityCode))}`, { cache: 'no-store' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось загрузить ПВЗ СДЭК');
  }
  const data = await response.json();
  return data.points || [];
}

export async function calculateCdekDelivery(payload: { mode: 'pickup' | 'courier'; cityCode: number; address?: string }) {
  const response = await fetch('/api/cdek/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось рассчитать доставку СДЭК');
  }
  const data = await response.json();
  return data.result;
}

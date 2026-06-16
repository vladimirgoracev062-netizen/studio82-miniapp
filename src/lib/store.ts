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

export async function uploadImages(files: FileList | File[], adminPassword: string): Promise<string[]> {
  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append('files', file));
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

export async function fetchOrders(adminPassword?: string, telegramId?: string): Promise<Order[]> {
  const params = new URLSearchParams();
  if (adminPassword) params.set('admin', '1');
  if (telegramId) params.set('telegram_id', telegramId);
  const response = await fetch(`/api/orders?${params.toString()}`, {
    cache: 'no-store',
    headers: adminPassword ? { 'x-admin-password': adminPassword } : undefined,
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
  deliveryType?: 'cdek_pickup' | 'moscow' | string;
  telegramId?: string;
  telegramUsername?: string;
}) {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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

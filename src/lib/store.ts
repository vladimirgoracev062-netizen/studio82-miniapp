'use client';

import { seedProducts } from '@/data/products';
import type { CartItem, Order, Product } from '@/types';

const PRODUCTS_KEY = 'studio82_products';
const CART_KEY = 'studio82_cart';
const ORDERS_KEY = 'studio82_orders';

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

export function getProducts(): Product[] {
  return read<Product[]>(PRODUCTS_KEY, seedProducts);
}

export function saveProducts(products: Product[]) {
  write(PRODUCTS_KEY, products);
}

export function resetProducts() {
  saveProducts(seedProducts);
}

export function getCart(): CartItem[] {
  return read<CartItem[]>(CART_KEY, []);
}

export function saveCart(cart: CartItem[]) {
  write(CART_KEY, cart);
}

export function getOrders(): Order[] {
  return read<Order[]>(ORDERS_KEY, []);
}

export function saveOrders(orders: Order[]) {
  write(ORDERS_KEY, orders);
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

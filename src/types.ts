export type ProductSize = {
  size: string;
  stock: number;
};

export type Product = {
  id: string;
  brand: string;
  name: string;
  title: string;
  color: string;
  description: string;
  price: number;
  images: string[];
  isPublished: boolean;
  sizes: ProductSize[];
};

export type CartItem = {
  productId: string;
  size: string;
  quantity: number;
};

export type OrderStatus =
  | 'Новый'
  | 'Оплачен'
  | 'Собирается'
  | 'Передан в СДЭК'
  | 'В пути'
  | 'Готов к выдаче'
  | 'Завершён';

export type Order = {
  id: string;
  createdAt: string;
  customerName: string;
  phone: string;
  city: string;
  cdekPoint?: string;
  total: number;
  status: OrderStatus;
  trackNumber?: string;
  items: Array<{ title: string; size: string; price: number; quantity: number }>;
};

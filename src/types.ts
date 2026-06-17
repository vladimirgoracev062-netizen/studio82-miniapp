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

export type CdekDeliveryMode = 'pickup' | 'courier';

export type CdekCity = {
  code: number;
  city: string;
  region?: string;
  country?: string;
};

export type CdekDeliveryPoint = {
  code: string;
  name: string;
  type?: string;
  address: string;
  workTime?: string;
  note?: string;
  nearestStation?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type CdekCalculationResult = {
  deliverySum: number;
  periodMin?: number | null;
  periodMax?: number | null;
  tariffCode?: number;
  currency?: string;
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
  dbId?: string;
  createdAt: string;
  telegramId?: string;
  telegramUsername?: string;
  customerName: string;
  phone: string;
  city: string;
  cdekPoint?: string;
  deliveryType?: 'cdek' | 'cdek_pickup' | 'moscow' | string;
  cdekDeliveryMode?: CdekDeliveryMode | string;
  cdekCityCode?: number | null;
  cdekPointCode?: string;
  cdekPointAddress?: string;
  cdekRecipientAddress?: string;
  cdekDeliveryPrice?: number;
  cdekTariffCode?: number | null;
  cdekStatus?: string;
  cdekStatusDescription?: string;
  total: number;
  status: OrderStatus;
  paymentStatus?: string;
  trackNumber?: string;
  items: Array<{ title: string; size: string; price: number; quantity: number }>;
};

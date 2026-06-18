import { createClient } from '@supabase/supabase-js';
import { seedProducts } from '@/data/products';
import type { Order, OrderStatus, Product } from '@/types';

export const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin82';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function hasSupabase() {
  return Boolean(supabaseUrl && serviceKey);
}

export function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase env variables are not configured');
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isAdminRequest(request: Request) {
  return request.headers.get('x-admin-password') === ADMIN_PASSWORD;
}

function makeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'product';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanProductModel(modelValue?: string, colorValue?: string, brandValue?: string) {
  let model = String(modelValue || '').trim().replace(/\s+/g, ' ');
  const color = String(colorValue || '').trim().replace(/\s+/g, ' ');
  const brand = String(brandValue || '').trim().replace(/\s+/g, ' ');

  if (brand) {
    model = model.replace(new RegExp(`^${escapeRegExp(brand)}\\s+`, 'i'), '').trim();
  }

  if (color) {
    model = model.replace(new RegExp(`\\s+${escapeRegExp(color)}$`, 'i'), '').trim();
  }

  return model || String(modelValue || '').trim();
}

function productFromRow(row: any): Product {
  const images = [...(row.product_images || [])]
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((item) => item.image_url)
    .filter(Boolean);

  const sizes = [...(row.product_sizes || [])]
    .sort((a, b) => Number(String(a.size).replace(',', '.')) - Number(String(b.size).replace(',', '.')))
    .map((item) => ({ size: String(item.size), stock: Number(item.stock || 0) }));

  const cleanModel = cleanProductModel(row.model, row.color, row.brand);

  return {
    id: row.id,
    brand: row.brand || '',
    name: cleanModel,
    title: cleanModel,
    color: row.color || '',
    description: row.description || '',
    price: Number(row.price || 0),
    images: images.length ? images : ['/placeholder-shoe.svg'],
    isPublished: Boolean(row.is_published),
    sizes,
  };
}

export async function fetchProductsFromDb({ admin = false } = {}) {
  if (!hasSupabase()) return seedProducts;
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('products')
    .select('*, product_images(image_url, sort_order), product_sizes(size, stock)')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (!admin) query = query.eq('is_published', true);

  let { data, error } = await query;
  if (error) throw error;

  if (!admin && (!data || data.length === 0)) {
    await seedProductsIfEmpty();
    const retry = await supabase
      .from('products')
      .select('*, product_images(image_url, sort_order), product_sizes(size, stock)')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    data = retry.data || [];
  }

  return (data || []).map(productFromRow);
}

export async function seedProductsIfEmpty() {
  if (!hasSupabase()) return;
  const supabase = getSupabaseAdmin();
  const { count, error: countError } = await supabase.from('products').select('id', { count: 'exact', head: true });
  if (countError) throw countError;
  if ((count || 0) > 0) return;

  for (let index = 0; index < seedProducts.length; index += 1) {
    const product = seedProducts[index];
    const { data, error } = await supabase
      .from('products')
      .insert({
        slug: `${makeSlug(product.title || product.name)}-${index + 1}`,
        brand: product.brand,
        model: product.name || product.title,
        color: product.color,
        description: product.description,
        price: product.price,
        is_published: product.isPublished,
        sort_order: index,
      })
      .select('id')
      .single();
    if (error) throw error;

    const productId = data.id;
    const images = (product.images || ['/placeholder-shoe.svg']).map((image, imageIndex) => ({ product_id: productId, image_url: image, sort_order: imageIndex }));
    const sizes = product.sizes.map((size) => ({ product_id: productId, size: size.size, stock: size.stock }));
    if (images.length) await supabase.from('product_images').insert(images);
    if (sizes.length) await supabase.from('product_sizes').insert(sizes);
  }
}

export async function upsertProduct(payload: Product) {
  const supabase = getSupabaseAdmin();
  const model = payload.name || payload.title;
  const slug = payload.id && !payload.id.includes('-') ? makeSlug(payload.title) : payload.id || `${makeSlug(payload.title)}-${Date.now()}`;

  const base = {
    slug,
    brand: payload.brand || 'STUDIO 82',
    model,
    color: payload.color || '',
    description: payload.description || '',
    price: Number(payload.price || 0),
    is_published: Boolean(payload.isPublished),
  };

  let productId = payload.id;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId || '');

  if (isUuid) {
    const { error } = await supabase.from('products').update(base).eq('id', productId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('products').insert(base).select('id').single();
    if (error) throw error;
    productId = data.id;
  }

  await supabase.from('product_images').delete().eq('product_id', productId);
  await supabase.from('product_sizes').delete().eq('product_id', productId);

  const images = (payload.images?.length ? payload.images : ['/placeholder-shoe.svg']).map((image, index) => ({ product_id: productId, image_url: image, sort_order: index }));
  const sizes = (payload.sizes || []).map((size) => ({ product_id: productId, size: size.size, stock: Number(size.stock || 0) }));
  if (images.length) {
    const { error } = await supabase.from('product_images').insert(images);
    if (error) throw error;
  }
  if (sizes.length) {
    const { error } = await supabase.from('product_sizes').insert(sizes);
    if (error) throw error;
  }

  return productId;
}

export async function deleteProductFromDb(id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

export function orderFromRow(row: any): Order {
  return {
    id: String(row.order_number || row.id).replace(/-/g, '').slice(0, 8),
    dbId: row.id,
    createdAt: row.created_at,
    telegramId: row.telegram_id || '',
    telegramUsername: row.telegram_username || '',
    customerName: row.customer_name || '',
    phone: row.customer_phone || '',
    city: row.delivery_city || '',
    cdekPoint: row.delivery_point || row.delivery_address || row.cdek_point_address || row.cdek_recipient_address || '',
    deliveryType: row.delivery_type || 'cdek',
    cdekDeliveryMode: row.cdek_delivery_mode || '',
    cdekCityCode: row.cdek_city_code || null,
    cdekPointCode: row.cdek_point_code || '',
    cdekPointAddress: row.cdek_point_address || '',
    cdekRecipientAddress: row.cdek_recipient_address || '',
    cdekDeliveryPrice: Number(row.cdek_delivery_price || 0),
    cdekTariffCode: row.cdek_tariff_code || null,
    cdekPackagePairCount: Number(row.cdek_package_pair_count || 0),
    cdekPackageType: row.cdek_package_type || '',
    cdekPackageBoxCount: Number(row.cdek_package_box_count || 0),
    cdekPackageWeight: Number(row.cdek_package_weight || 0),
    cdekPackageLength: Number(row.cdek_package_length || 0),
    cdekPackageWidth: Number(row.cdek_package_width || 0),
    cdekPackageHeight: Number(row.cdek_package_height || 0),
    cdekOrderUuid: row.cdek_order_uuid || '',
    cdekStatus: row.cdek_status || '',
    cdekStatusDescription: row.cdek_status_description || '',
    cdekStatusUpdatedAt: row.cdek_status_updated_at || '',
    total: Number(row.total_amount || 0),
    status: (row.order_status || 'Новый') as OrderStatus,
    paymentStatus: row.payment_status || 'pending',
    yookassaPaymentId: row.yookassa_payment_id || '',
    paymentUrl: row.yookassa_payment_url || '',
    paidAt: row.paid_at || '',
    reservationExpiresAt: row.reservation_expires_at || '',
    stockReleasedAt: row.stock_released_at || '',
    trackNumber: row.cdek_tracking_number || row.cdek_number || '',
    items: (row.order_items || []).map((item: any) => ({
      title: item.product_title,
      size: item.size,
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 1),
    })),
  };
}

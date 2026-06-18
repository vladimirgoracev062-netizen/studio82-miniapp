import { NextResponse } from 'next/server';
import { fetchProductsFromDb, isAdminRequest, upsertProduct, getSupabaseAdmin, hasSupabase } from '@/lib/supabase-server';
import { releaseExpiredReservations } from '@/lib/order-lifecycle';
import type { Product } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const admin = url.searchParams.get('admin') === '1';
    if (admin && !isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (hasSupabase()) await releaseExpiredReservations(getSupabaseAdmin());
    const products = await fetchProductsFromDb({ admin });
    return NextResponse.json({ products });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to load products' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const product = (await request.json()) as Product;
    const id = await upsertProduct(product);
    const products = await fetchProductsFromDb({ admin: true });
    return NextResponse.json({ id, products });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to save product' }, { status: 500 });
  }
}

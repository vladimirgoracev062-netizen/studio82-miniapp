import { NextResponse } from 'next/server';
import { deleteProductFromDb, fetchProductsFromDb, isAdminRequest, upsertProduct } from '@/lib/supabase-server';
import type { Product } from '@/types';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const product = (await request.json()) as Product;
    await upsertProduct({ ...product, id: params.id });
    const products = await fetchProductsFromDb({ admin: true });
    return NextResponse.json({ products });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await deleteProductFromDb(params.id);
    const products = await fetchProductsFromDb({ admin: true });
    return NextResponse.json({ products });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete product' }, { status: 500 });
  }
}

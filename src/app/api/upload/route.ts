import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminRequest } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const formData = await request.formData();
    const files = formData.getAll('files').filter((item): item is File => item instanceof File);
    if (!files.length) return NextResponse.json({ urls: [] });

    const supabase = getSupabaseAdmin();
    const urls: string[] = [];

    for (const file of files) {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const bytes = await file.arrayBuffer();
      const { error } = await supabase.storage.from('product-images').upload(path, bytes, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from('product-images').getPublicUrl(path);
      urls.push(data.publicUrl);
    }

    return NextResponse.json({ urls });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}

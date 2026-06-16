import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminRequest } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const MAX_FILES = 8;
const MAX_FILE_SIZE = 6 * 1024 * 1024;

function safeExtension(file: File) {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

export async function POST(request: Request) {
  try {
    if (!isAdminRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const formData = await request.formData();
    const files = formData.getAll('files').filter((item): item is File => item instanceof File);

    if (!files.length) return NextResponse.json({ urls: [] });
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `За один раз можно загрузить максимум ${MAX_FILES} фото` }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const urls: string[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ error: 'Можно загружать только изображения' }, { status: 400 });
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'Фото слишком большое. Загрузите JPG/PNG до 6 МБ или сожмите фото.' }, { status: 400 });
      }

      const ext = safeExtension(file);
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
    return NextResponse.json({ error: error.message || 'Не удалось загрузить фото' }, { status: 500 });
  }
}

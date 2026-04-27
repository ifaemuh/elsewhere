import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';
import { isLocalDev } from '@lib/storage';
import { createStorageAdapter } from '@lib/storage';
import { referencePhotoStore } from '@lib/stores/memory';
import { randomUUID } from 'crypto';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(req);
    const formData = await req.formData();

    const file = formData.get('file') as File | null;
    const fileName = formData.get('fileName') as string | null;
    const contentType = formData.get('contentType') as string | null;

    if (!file || !fileName || !contentType) {
      return NextResponse.json(
        { error: 'Missing required fields: file, fileName, contentType' },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: 'Invalid content type. Allowed: image/jpeg, image/png, image/webp' },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB.' },
        { status: 400 },
      );
    }

    const photoId = randomUUID();
    const ext = fileName.split('.').pop() ?? 'jpg';
    const storagePath = `reference-photos/${user.id}/${photoId}.${ext}`;

    const storage = createStorageAdapter(isLocalDev() ? undefined : supabase);
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await storage.upload(storagePath, buffer, contentType);

    if (isLocalDev()) {
      referencePhotoStore.create({
        user_id: user.id,
        file_name: fileName,
        storage_path: storagePath,
        content_type: contentType,
        url,
        status: 'validated',
      });
      // Use the store-generated ID for consistency
      const photos = referencePhotoStore.listByUser(user.id);
      const created = photos[photos.length - 1];
      return NextResponse.json(
        { photoId: created.id, url: created.url, status: created.status },
        { status: 201 },
      );
    }

    // Production: store in Supabase
    const { data, error } = await supabase
      .from('reference_photos')
      .insert({
        id: photoId,
        user_id: user.id,
        file_name: fileName,
        storage_path: storagePath,
        content_type: contentType,
        status: 'validated',
      })
      .select('id')
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Failed to save photo record', message: error?.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ photoId: data.id, url, status: 'validated' }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(req);

    if (isLocalDev()) {
      const photos = referencePhotoStore.listByUser(user.id);
      return NextResponse.json(
        photos.map((p) => ({
          id: p.id,
          userId: p.user_id,
          fileName: p.file_name,
          url: p.url,
          contentType: p.content_type,
          status: p.status,
          createdAt: p.created_at,
        })),
      );
    }

    const { data, error } = await supabase
      .from('reference_photos')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const storage = createStorageAdapter(supabase);

    return NextResponse.json(
      (data ?? []).map((p: Record<string, unknown>) => ({
        id: p.id,
        userId: p.user_id,
        fileName: p.file_name,
        url: storage.getPublicUrl(p.storage_path as string),
        contentType: p.content_type,
        status: p.status,
        createdAt: p.created_at,
      })),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

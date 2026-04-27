import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';
import { isLocalDev } from '@lib/storage';
import { createStorageAdapter } from '@lib/storage';
import { referencePhotoStore } from '@lib/stores/memory';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> },
) {
  try {
    const { user, supabase } = await getAuthUser(req);
    const { photoId } = await params;

    if (isLocalDev()) {
      const photo = referencePhotoStore.get(photoId);
      if (!photo || photo.user_id !== user.id) {
        return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
      }
      return NextResponse.json({
        id: photo.id,
        userId: photo.user_id,
        fileName: photo.file_name,
        url: photo.url,
        contentType: photo.content_type,
        status: photo.status,
        createdAt: photo.created_at,
      });
    }

    const { data, error } = await supabase
      .from('reference_photos')
      .select('*')
      .eq('id', photoId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: data.id,
      userId: data.user_id,
      fileName: data.file_name,
      url: data.storage_path,
      contentType: data.content_type,
      status: data.status,
      createdAt: data.created_at,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> },
) {
  try {
    const { user, supabase } = await getAuthUser(req);
    const { photoId } = await params;

    if (isLocalDev()) {
      const photo = referencePhotoStore.get(photoId);
      if (!photo || photo.user_id !== user.id) {
        return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
      }
      const storage = createStorageAdapter();
      await storage.delete(photo.storage_path);
      referencePhotoStore.delete(photoId);
      return NextResponse.json({ deleted: true });
    }

    const { data, error } = await supabase
      .from('reference_photos')
      .select('storage_path')
      .eq('id', photoId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    // Delete from storage
    const storage = createStorageAdapter(supabase);
    await storage.delete(data.storage_path);

    // Soft-delete the record
    await supabase
      .from('reference_photos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', photoId);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}

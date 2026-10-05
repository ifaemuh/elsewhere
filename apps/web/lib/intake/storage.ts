import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/** Private bucket for raw forwarded mail and screenshots; retention deletes objects after 30 days. */
export const INBOUND_BUCKET = 'inbound';

export async function putInbound(objectPath: string, data: Uint8Array | string, contentType: string): Promise<string> {
  const { error } = await createAdminClient().storage.from(INBOUND_BUCKET).upload(objectPath, data, { contentType, upsert: true });
  if (error) throw new Error(`inbound upload failed: ${error.message}`);
  return objectPath;
}

export async function getInbound(objectPath: string): Promise<Uint8Array> {
  const { data, error } = await createAdminClient().storage.from(INBOUND_BUCKET).download(objectPath);
  if (error || !data) throw new Error(`inbound download failed: ${error?.message ?? 'empty'}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeInbound(objectPaths: string[]): Promise<void> {
  if (objectPaths.length === 0) return;
  const { error } = await createAdminClient().storage.from(INBOUND_BUCKET).remove(objectPaths);
  if (error) throw new Error(`inbound delete failed: ${error.message}`);
}

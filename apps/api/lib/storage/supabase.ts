import type { SupabaseClient } from '@supabase/supabase-js';
import type { StorageAdapter } from './types';

export class SupabaseStorageAdapter implements StorageAdapter {
  private bucket: string;
  private client: SupabaseClient;

  constructor(client: SupabaseClient, bucket = 'preview-assets') {
    this.client = client;
    this.bucket = bucket;
  }

  async upload(path: string, data: Buffer | Uint8Array, contentType: string): Promise<string> {
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(path, data, { contentType, upsert: true });
    if (error) throw error;
    return this.getPublicUrl(path);
  }

  async download(path: string): Promise<Buffer> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .download(path);
    if (error || !data) throw error ?? new Error('Download failed');
    return Buffer.from(await data.arrayBuffer());
  }

  async delete(path: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucket)
      .remove([path]);
    if (error) throw error;
  }

  getPublicUrl(path: string): string {
    const { data } = this.client.storage
      .from(this.bucket)
      .getPublicUrl(path);
    return data.publicUrl;
  }
}

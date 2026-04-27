import type { SupabaseClient } from '@supabase/supabase-js';
import type { StorageAdapter } from './types';
import { LocalStorageAdapter } from './local';
import { SupabaseStorageAdapter } from './supabase';

export type { StorageAdapter } from './types';

export function isLocalDev(): boolean {
  return (
    process.env.ELSEWHERE_ENVIRONMENT === 'dev' &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

export function createStorageAdapter(supabase?: SupabaseClient, bucket?: string): StorageAdapter {
  if (isLocalDev()) {
    return new LocalStorageAdapter();
  }
  if (!supabase) {
    throw new Error('Supabase client required for non-local storage');
  }
  return new SupabaseStorageAdapter(supabase, bucket);
}

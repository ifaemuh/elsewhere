import { NextRequest } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isLocalDev } from '../storage';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

interface AuthResult {
  user: { id: string; email?: string };
  supabase: SupabaseClient;
  token: string;
}

const DEV_USER = { id: 'dev-user-000', email: 'dev@elsewhere.test' };

export async function getAuthUser(req: NextRequest): Promise<AuthResult> {
  if (isLocalDev()) {
    // In local dev without Supabase, return a mock user.
    // The mock supabase client is a placeholder — routes that need
    // Supabase in dev should use the in-memory stores instead.
    const mockSupabase = createDevSupabaseStub();
    return { user: DEV_USER, supabase: mockSupabase, token: 'dev-token' };
  }

  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) throw new AuthError('Missing authorization token');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new AuthError('Invalid or expired token');

  return { user, supabase, token };
}

function createDevSupabaseStub(): SupabaseClient {
  // Return a minimal proxy that throws helpful errors if called unexpectedly.
  // Routes should use in-memory stores in dev mode, not this stub.
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      if (prop === 'storage') {
        return {
          from: () => ({
            upload: () => { throw new Error('Use StorageAdapter in dev mode, not supabase.storage directly'); },
            download: () => { throw new Error('Use StorageAdapter in dev mode'); },
            getPublicUrl: () => { throw new Error('Use StorageAdapter in dev mode'); },
          }),
        };
      }
      if (prop === 'from') {
        return () => new Proxy({} as never, {
          get() {
            throw new Error('Use in-memory stores in dev mode, not supabase client directly');
          },
        });
      }
      return undefined;
    },
  });
}

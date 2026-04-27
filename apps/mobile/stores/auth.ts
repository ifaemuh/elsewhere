import { create } from 'zustand';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const isDevMode = !SUPABASE_URL;

let supabase: SupabaseClient | null = null;
if (!isDevMode) {
  supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
}

const DEV_SESSION: Session = {
  access_token: 'dev-token',
  refresh_token: 'dev-refresh',
  expires_in: 999999,
  token_type: 'bearer',
  user: {
    id: 'dev-user-000',
    email: 'dev@elsewhere.test',
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
    app_metadata: {},
    user_metadata: {},
  },
};

interface AuthState {
  session: Session | null;
  isLoading: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isLoading: true,

  initialize: async () => {
    if (isDevMode) {
      set({ session: DEV_SESSION, isLoading: false });
      return;
    }

    const { data: { session } } = await supabase!.auth.getSession();
    set({ session, isLoading: false });

    supabase!.auth.onAuthStateChange((_event, session) => {
      set({ session });
    });
  },

  signIn: async (email, password) => {
    if (isDevMode) {
      set({ session: DEV_SESSION });
      return;
    }
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  signUp: async (email, password) => {
    if (isDevMode) {
      set({ session: DEV_SESSION });
      return;
    }
    const { error } = await supabase!.auth.signUp({ email, password });
    if (error) throw error;
  },

  signOut: async () => {
    if (!isDevMode) {
      await supabase!.auth.signOut();
    }
    set({ session: null });
  },
}));

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env';

/** Service role. Webhooks, workflows, and telemetry only; never pass results to a client unfiltered. */
export function createAdminClient() {
  return createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

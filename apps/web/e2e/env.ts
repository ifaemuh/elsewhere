import { existsSync } from 'node:fs';
import path from 'node:path';
import { TEST_WEBHOOK_SECRET } from '../test/helpers/webhooks';

const ENV_FILE = path.resolve(__dirname, '../.env.e2e.local');
if (!existsSync(ENV_FILE)) throw new Error('Missing apps/web/.env.e2e.local. Create the e2e branch first (Task 17, Step 1).');
process.loadEnvFile(ENV_FILE);

export const PORT = 3200;
export const BASE_URL = `http://localhost:${PORT}`;

const RUN = path.resolve(__dirname, '.run');
export const RUN_DIRS = {
  ai: path.join(RUN, 'ai'),
  inbound: path.join(RUN, 'inbound'),
  aeroapi: path.join(RUN, 'aeroapi'),
  outbox: path.join(RUN, 'outbox'),
  workflow: path.join(RUN, 'workflow'),
} as const;

/** Local-only secrets shared by the e2e server and the spec. */
export const E2E = {
  inboundDomain: 'in.e2e.example.com',
  stripeWebhookSecret: 'whsec_e2e_local_only',
  aeroapiWebhookSecret: 'e2e-aeroapi-secret',
} as const;

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from apps/web/.env.e2e.local`);
  return value;
}

/** Everything the server needs. No variable here reaches a real provider. */
export function serverEnv(): Record<string, string> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    NEXT_PUBLIC_APP_URL: BASE_URL,
    PORT: String(PORT),
    TRIPS_OPEN: 'true',
    SMS_ENABLED: 'false',
    INBOUND_DOMAIN: E2E.inboundDomain,
    RESEND_API_KEY: 're_e2e_unused',
    RESEND_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
    EMAIL_FROM: 'Elsewhere <e2e@example.com>',
    STRIPE_SECRET_KEY: 'sk_test_e2e_unused',
    STRIPE_WEBHOOK_SECRET: E2E.stripeWebhookSecret,
    AEROAPI_KEY: 'e2e-unused',
    AEROAPI_WEBHOOK_SECRET: E2E.aeroapiWebhookSecret,
    JOIN_LINK_SECRET: 'e2e-join-link-secret-never-used-in-production',
    CRON_SECRET: 'e2e-cron-secret',
    ADMIN_EMAILS: '',
    ELSEWHERE_ENABLE_FUNNEL_TELEMETRY: 'true',
    ELSEWHERE_AI_FAKE_DIR: RUN_DIRS.ai,
    ELSEWHERE_INBOUND_FIXTURE_DIR: RUN_DIRS.inbound,
    ELSEWHERE_AEROAPI_FIXTURE_DIR: RUN_DIRS.aeroapi,
    ELSEWHERE_OUTBOX_DIR: RUN_DIRS.outbox,
    WORKFLOW_LOCAL_DATA_DIR: RUN_DIRS.workflow,
    WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: 'false',
  };
}

// Usage (Node 24, from apps/web):
//   node --env-file=.env.local --conditions=react-server --import tsx scripts/create-partner-key.ts <partner-id> [rate-limit-rule]
// Prints the key once. Only its sha256 hash is stored.
import { createAdminClient } from '../lib/supabase/admin';
import { generateKey, hashKey } from '../lib/rules-api/auth';

async function main(): Promise<void> {
  const [partnerId, rateLimitRule = 'rules-partner'] = process.argv.slice(2);
  if (!partnerId || !/^[a-z0-9-]{2,40}$/.test(partnerId)) {
    console.error('Usage: create-partner-key.ts <partner-id: a-z0-9-> [rate-limit-rule]');
    process.exit(1);
  }
  const key = generateKey();
  const { data, error } = await createAdminClient()
    .from('api_keys')
    .insert({ partner_id: partnerId, key_hash: hashKey(key), rate_limit_rule: rateLimitRule })
    .select('id')
    .single();
  if (error) throw error;
  console.log(`Partner: ${partnerId}\nKey ID:  ${data.id}\nKey:     ${key}\n\nSend the key once over a secure channel. It cannot be shown again.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

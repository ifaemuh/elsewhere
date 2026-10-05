// Creates the private bucket for raw inbound mail and screenshots. Safe to re-run.
//   node --env-file=.env.e2e.local --import tsx scripts/setup-storage.mts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
const admin = createClient(url, key, { auth: { persistSession: false } });

const { data: existing } = await admin.storage.getBucket('inbound');
if (existing) {
  if (existing.public) throw new Error('The inbound bucket is public. Make it private in the dashboard before going further.');
  console.log('inbound bucket already exists and is private');
} else {
  const { error } = await admin.storage.createBucket('inbound', {
    public: false,
    fileSizeLimit: '10MB',
    allowedMimeTypes: ['application/json', 'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  });
  if (error) throw new Error(`could not create the inbound bucket: ${error.message}`);
  console.log('created the private inbound bucket');
}

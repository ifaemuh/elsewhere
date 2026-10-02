// Creates the trip-pass product, the $9 and $19 prices, and the webhook endpoint. Idempotent.
// Usage (Node 24, from apps/web):
//   STRIPE_SECRET_KEY=sk_test_... NEXT_PUBLIC_APP_URL=https://<domain> npx tsx scripts/stripe-setup.mts
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');
if (!key || !appUrl) throw new Error('Set STRIPE_SECRET_KEY and NEXT_PUBLIC_APP_URL');
const stripe = new Stripe(key);

async function ensurePrice(lookupKey: string, cents: number, productId: string): Promise<string> {
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  return (await stripe.prices.create({ product: productId, unit_amount: cents, currency: 'usd', lookup_key: lookupKey })).id;
}

const found = await stripe.products.search({ query: "metadata['elsewhere']:'trip_pass'" });
const product =
  found.data[0] ??
  (await stripe.products.create({
    name: 'Elsewhere trip pass',
    description: 'Flight watching, cited playbooks, and group alerts for one trip, up to 12 people.',
    metadata: { elsewhere: 'trip_pass' },
  }));

const p9 = await ensurePrice('pass_p9', 900, product.id);
const p19 = await ensurePrice('pass_p19', 1900, product.id);

const webhookUrl = `${appUrl}/api/webhooks/stripe`;
const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
const existingHook = hooks.data.find((hook) => hook.url === webhookUrl);

if (existingHook && existingHook.api_version !== Stripe.API_VERSION) {
  console.log(`WARNING: Webhook ${webhookUrl} has api_version ${existingHook.api_version}, but SDK has ${Stripe.API_VERSION}. Please recreate the endpoint.`);
}

const created = existingHook ? null : await stripe.webhookEndpoints.create({
  url: webhookUrl,
  enabled_events: ['checkout.session.completed'],
  api_version: Stripe.API_VERSION,
});

console.log(`STRIPE_PRICE_P9=${p9}`);
console.log(`STRIPE_PRICE_P19=${p19}`);
console.log(created?.secret ? `STRIPE_WEBHOOK_SECRET=${created.secret}` : `Webhook ${webhookUrl} already exists; copy its signing secret from the Stripe dashboard.`);

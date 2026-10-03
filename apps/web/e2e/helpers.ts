import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { localDateTime } from '../lib/flights/geo';
import { E2E, RUN_DIRS, requiredEnv } from './env';

let client: SupabaseClient | null = null;

/** Service-role client on the e2e branch, for setup, assertions, and cleanup only. */
export function db(): SupabaseClient {
  client ??= createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  return client;
}

export interface TestUser {
  id: string;
  email: string;
}

export async function createTestUser(email: string): Promise<TestUser> {
  const { data, error } = await db().auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return { id: data.user.id, email };
}

/** Signs in through the real code form. The code comes from the admin API, so no email is sent. */
export async function signIn(page: Page, email: string, next: string): Promise<void> {
  const { data, error } = await db().auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error(`generateLink failed: ${error.message}`);
  await page.goto(`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(email)}&step=verify`);
  await page.getByLabel('Code').fill(data.properties.email_otp);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL((url) => url.pathname === next);
}

/**
 * Polls `read` until `accept` passes on a row, then returns that row. Typed on the whole response, so the
 * result is never null: a supabase `.single()` or `.maybeSingle()` response types `data` as `Row | null`.
 */
export async function pollRow<R extends { data: unknown }>(
  read: () => PromiseLike<R>,
  accept: (row: NonNullable<R['data']>) => boolean,
  timeout = 90_000,
): Promise<NonNullable<R['data']>> {
  let found: NonNullable<R['data']> | null = null;
  await expect
    .poll(
      async () => {
        const { data } = await read();
        found = data !== null && data !== undefined && accept(data as NonNullable<R['data']>) ? (data as NonNullable<R['data']>) : null;
        return found !== null;
      },
      { timeout, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
  // `found` is assigned inside the poll closure, which TypeScript cannot see, so it narrows it to null here.
  return found as unknown as NonNullable<R['data']>;
}

export function stripeSignature(payload: string): string {
  return new Stripe('sk_test_e2e_unused').webhooks.generateTestHeaderString({ payload, secret: E2E.stripeWebhookSecret });
}

export interface OutboxLine {
  channel: 'email' | 'sms';
  to: string;
  subject: string | null;
  body: string;
  providerMessageId: string;
}

/** Every message the app "sent", in send order. */
export function readOutbox(): OutboxLine[] {
  const file = path.join(RUN_DIRS.outbox, 'outbox.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OutboxLine);
}

const DAY = 24 * 3600_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export interface FlightPlan {
  tripStart: string;
  tripEnd: string;
  scheduledOut: string;
  scheduledIn: string;
  departureLocal: string;
  arrivalLocal: string;
}

/** TP 204 Newark → Lisbon, 30 days from now, leaving 23:15 UTC. */
export function flightPlan(now = new Date()): FlightPlan {
  const depart = new Date(now.getTime() + 30 * DAY);
  const scheduledOut = `${isoDate(depart)}T23:15:00Z`;
  const scheduledIn = `${isoDate(new Date(depart.getTime() + DAY))}T06:35:00Z`;
  return {
    tripStart: isoDate(depart),
    tripEnd: isoDate(new Date(depart.getTime() + 7 * DAY)),
    scheduledOut,
    scheduledIn,
    departureLocal: localDateTime(scheduledOut, 'America/New_York'),
    arrivalLocal: localDateTime(scheduledIn, 'Europe/Lisbon'),
  };
}

export const REFUND_RULE = 'fixture-us-refund-cancelled-flight';

function write(dir: string, file: string, value: unknown): void {
  writeFileSync(path.join(dir, file), JSON.stringify(value, null, 2));
}

/** Canned model output and flight data for this run's dates. */
export function writeRunFixtures(plan: FlightPlan): void {
  write(RUN_DIRS.ai, 'extraction.json', {
    bookings: [
      {
        kind: 'flight',
        provider: 'TAP Air Portugal',
        confirmation_code: 'E2ETAP',
        booked_via: null,
        booked_at: null,
        passenger_names: ['PLANNER/PAT MR', 'MEMBER/MO MS'],
        segments: [
          { carrier_iata: 'TP', flight_number: '204', origin_iata: 'EWR', destination_iata: 'LIS', departure_local: plan.departureLocal, arrival_local: plan.arrivalLocal },
        ],
        confidence: { confirmation_code: 0.99, passengers: 0.98, segments: 0.97 },
      },
    ],
  });
  // Passes the real citation check: the only quantity is "7 business days", which the refund rule's timing states,
  // and no money is named, so nothing needs an "up to" hedge.
  write(RUN_DIRS.ai, 'playbook.json', {
    summary: 'TP 204 was cancelled. If you don’t take the rebooking, the airline owes you a cash refund.',
    owed: [{ text: 'A refund to your original payment method, within 7 business days for card purchases.', rule_ids: [REFUND_RULE] }],
    steps: [
      { text: 'Decline the rebooking or the travel credit if you don’t want it.', rule_ids: [REFUND_RULE] },
      { text: 'Ask for a refund to your original payment method, in writing.', rule_ids: [REFUND_RULE] },
    ],
    messages: [
      {
        to: 'airline',
        channel: 'email',
        body: 'Hello, our flight TP 204 was cancelled and we are not accepting the rebooking. Please refund our original payment method. For card purchases this is due within 7 business days.',
        rule_ids: [REFUND_RULE],
      },
    ],
    caveats: [],
  });

  const aero = RUN_DIRS.aeroapi;
  write(path.join(aero, 'schedules'), 'TP204.json', [
    { ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: plan.scheduledOut, scheduled_in: plan.scheduledIn },
  ]);
  // The fixture reader returns these as written (only the live parser upper-cases), so they are upper case here.
  write(path.join(aero, 'airports'), 'EWR.json', { code_iata: 'EWR', country_code: 'US', latitude: 40.6925, longitude: -74.1687, timezone: 'America/New_York' });
  write(path.join(aero, 'airports'), 'LIS.json', { code_iata: 'LIS', country_code: 'PT', latitude: 38.7813, longitude: -9.1359, timezone: 'Europe/Lisbon' });
  const nextDay = new Date(new Date(plan.scheduledOut).getTime() + DAY);
  // The route list includes the cancelled flight itself, on its own day: the vote must not offer it back.
  write(path.join(aero, 'routes'), 'EWR-LIS.json', [
    { ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: plan.scheduledOut, scheduled_in: plan.scheduledIn },
    { ident_iata: 'UA64', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: `${isoDate(nextDay)}T22:00:00Z`, scheduled_in: `${isoDate(new Date(nextDay.getTime() + DAY))}T05:30:00Z` },
    { ident_iata: 'TP202', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: `${isoDate(nextDay)}T23:30:00Z`, scheduled_in: `${isoDate(new Date(nextDay.getTime() + DAY))}T06:50:00Z` },
  ]);
}

export function writeInboundEmail(emailId: string, from: string, plan: FlightPlan): void {
  write(RUN_DIRS.inbound, `${emailId}.json`, {
    id: emailId,
    from,
    subject: 'Fwd: Your TAP Air Portugal booking E2ETAP',
    text: `Booking reference E2ETAP\nPassengers: PLANNER/PAT MR, MEMBER/MO MS\nTP 204 Newark (EWR) to Lisbon (LIS), departs ${plan.departureLocal.replace('T', ' ')}`,
    html: null,
    attachments: [],
  });
}

/** AeroAPI's alert payload for a cancelled TP 204. */
export function cancelledAlert(alertId: string, plan: FlightPlan) {
  return {
    alert_id: alertId,
    event_code: 'cancelled',
    flight: {
      fa_flight_id: `TAP204-e2e-${plan.tripStart}`,
      ident_iata: 'TP204',
      cancelled: true,
      diverted: false,
      scheduled_out: plan.scheduledOut,
      estimated_out: null,
      actual_out: null,
      scheduled_in: plan.scheduledIn,
      estimated_in: null,
      actual_in: null,
      departure_delay: null,
      arrival_delay: null,
      origin: { code_iata: 'EWR', timezone: 'America/New_York' },
      destination: { code_iata: 'LIS', timezone: 'Europe/Lisbon' },
    },
  };
}

/** Deletes the trip (rows cascade), its raw inbound files, and the test users. Never fails the run. */
export async function cleanup(tripId: string | null, users: TestUser[]): Promise<void> {
  try {
    if (tripId) {
      const { data: messages } = await db().from('inbound_messages').select('storage_path').eq('trip_id', tripId).not('storage_path', 'is', null);
      for (const { storage_path } of messages ?? []) {
        const folder = path.posix.dirname(storage_path as string);
        const { data: objects } = await db().storage.from('inbound').list(folder);
        await db().storage.from('inbound').remove([storage_path as string, ...(objects ?? []).map((o) => `${folder}/${o.name}`)]);
      }
      const { error } = await db().from('trips').delete().eq('id', tripId);
      if (error) console.warn('trip cleanup failed', error.message);
    }
    for (const user of users) await db().auth.admin.deleteUser(user.id);
  } catch (error) {
    console.warn('e2e cleanup failed', error);
  }
}

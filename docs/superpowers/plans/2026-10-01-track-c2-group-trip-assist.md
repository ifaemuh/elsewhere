# Track C2 — Group-Trip Assist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build group-trip Assist on top of C1:
- **Joining:** members join from one link, with no app.
- **Intake:** forwarded bookings and screenshots become a confirmed itinerary.
- **Documents:** everyone's documents are checked against verified rules.
- **Monitoring:** every confirmed flight is watched.
- **Disruptions:** a disruption becomes a cited playbook, a question when a fact is missing, a vote, and alerts to the affected members only.
- **Costs:** new costs become who-owes-what.
- **Hand-run trips:** the founder can run comped trips by hand from `/admin`.

**Architecture:**
- **Workflows:** durable work runs as Vercel Workflow runs: `intakeWorkflow`, `tripMonitorWorkflow`, `segmentMonitorWorkflow`, and `incidentWorkflow`.
- **Workflow bodies:** each is thin orchestration over steps. Steps call `lib/` modules, which carry all the logic and are unit tested directly.
- **Ports:** workflow side effects go through `WorkflowPorts`. The live implementation runs in production. A memory implementation, selected by a guarded test seam, drives `@workflow/vitest` integration tests.
- **Rules:** matching is deterministic, using `matchRules()` from `@elsewhere/rules` over `getLibrary()`. AI only drafts text, and a deterministic citation check gates every playbook.
- **Notifications:** queued rows, delivered by Resend email and Twilio SMS. SMS stays switched off until A2P 10DLC clears.

**Tech Stack:**
- Everything from C1, plus `workflow` 5.0.1, `@workflow/vitest` 5.0.1, `ai` 7.0.127 through Vercel AI Gateway, `resend` 6.32.0, `standardwebhooks` 1.1.1 (tests), `twilio` 6.1.2, FlightAware AeroAPI 4.17, and `@playwright/test` 1.63.0.

**Spec:** `docs/superpowers/specs/2026-10-01-group-trip-web-app-design.md` (primary) and `docs/superpowers/specs/2026-10-01-elsewhere-restart-program.md`.

**Depends on:**
- **Every C1 task.** The schema, clients, proxy, `getLibrary()`, the cast, sign-in, trips, the trip pass, and the Stripe webhook must all exist.
- **Track A, including its Task 18 contract amendment,** which adds the facts `flight.departs_us` and `flight.scheduled_duration_minutes`.
- **Track A's rule conventions,** which C2 relies on. C2's tests pin them with fixtures. Report gaps to Track A; do not edit rules here.
  - A document-requirement rule encodes the failing condition, so `applies` means action is needed.
  - Its minimum is in `entitlement.amount.min_months_valid_after_return`.

## Global Constraints

- **Node:** use Node 24 for every command: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`. `node -v` must print `v24.x`.
- **Pinned versions:**
  - `workflow` 5.0.1, `@workflow/vitest` 5.0.1, `ai` 7.0.127
  - `resend` 6.32.0, `twilio` 6.1.2, `@playwright/test` 1.63.0, `standardwebhooks` 1.1.1 (dev)
  - everything C1 pins
- **AI SDK 7:** `generateObject` no longer exists. Use `generateText({ model, output: Output.object({ schema }), instructions, prompt | messages })` and read `result.output`. Use `instructions` for system text, not the deprecated `system`.
- **AI Gateway model IDs** (verified in `@ai-sdk/gateway` 4.0.103; the spec's dashed IDs are wrong):
  - extraction: `anthropic/claude-haiku-4.5`
  - playbooks: `anthropic/claude-sonnet-5.5`
- **Workflow SDK:**
  - **Imports:** `start`, `resumeHook`, and `getRun` come from `workflow/api`. `sleep`, `createHook`, and `FatalError` come from `workflow`. Wrap the Next config with `withWorkflow` from `workflow/next`.
  - **Determinism:** workflow bodies are deterministic. `Date` is fixed per run. All I/O happens in `"use step"` functions.
  - **Starting runs:** call `start()` only from route handlers, server actions, or workflow bodies.
- **Next 16 patterns, as in C1:**
  - Runtime reads (cookies, Supabase session) sit inside `<Suspense>`, with params awaited inside the child.
  - `proxy.ts` already excludes `/.well-known/workflow/`.
- **Rules:**
  - App code imports only types and pure functions (`matchRules`, `matchRule`) from `@elsewhere/rules`. It never calls `loadRules` at runtime.
  - The library comes from `getLibrary()`.
  - Only `verified` rules are cited. `needs_review` rules appear only in caveats, as "being re-checked."
- **Copy rules:**
  - Say "we drafted," never "we filed." Elsewhere never books, rebooks, or contacts an airline for anyone.
  - Never put a document date in a `document_checks.detail` string, or in anything the planner sees about another member.
- **Data:** store passport issuing country and expiry, and a REAL ID yes/no, nothing more. Raw inbound files live 30 days. Bookings live for the trip plus one year.
- **SMS:** sent only when `SMS_ENABLED=true` and the member opted in. Email always goes out for incidents.
- **The cast in the app:**
  - **Allowed:** join and onboarding, document-check cards (the owl for deadlines), the incident header (the matched rule's `lead_character`, small, with text leading), the "all clear" card (the capybara), and empty states.
  - **Never:** booking lists, the money ledger, or forms.
- **Test seams:** each of these environment variables calls `assertTestSeamAllowed()` before switching on, and throws when `VERCEL_ENV === 'production'`:
  - `ELSEWHERE_AI_FAKE_DIR`
  - `ELSEWHERE_INBOUND_FIXTURE_DIR`
  - `ELSEWHERE_AEROAPI_FIXTURE_DIR`
  - `ELSEWHERE_OUTBOX_DIR`
  - `ELSEWHERE_PORTS=memory`
- **Commit trailers:** every commit message ends with these two lines:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
  ```
- **[Founder confirms]:** a step marked this way is outward-facing (provider accounts, DNS, A2P registration, production deploys). Stop and get explicit approval first.
- **Working directory:** paths are relative to the repo root, `/Users/eapha/Github/elsewhere-restart`.

## New environment variables

| Name | Used by |
|---|---|
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM` | Inbound email (Tasks 5 and 6) and outbound email (Task 2) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `SMS_ENABLED` | SMS (Task 2) and phone sign-in (Task 1) |
| `AEROAPI_KEY`, `AEROAPI_WEBHOOK_SECRET` | Flights (Tasks 4 and 9) |
| `AI_GATEWAY_API_KEY` | Local AI calls; on Vercel, OIDC replaces it |
| `JOIN_LINK_SECRET` | Join links (Task 1) |
| `CRON_SECRET` | Vercel cron routes (Tasks 2 and 16) |
| `ADMIN_EMAILS` | `/admin` (Task 16) |
| `SUPPORT_EMAIL` | The privacy and SMS terms pages, and Twilio's HELP reply (Task 18) |

## File Structure

```
apps/web/
  next.config.ts                       # modify: withWorkflow
  vitest.integration.config.ts         # create
  playwright.config.ts                 # create
  vercel.json                          # create: crons
  workflows/intake.ts  trip-monitor.ts  segment-monitor.ts  incident.ts
  app/
    login/{page.tsx,login-form.tsx,actions.ts}          # modify: phone codes
    join/[token]/{page.tsx,join-form.tsx,actions.ts,opengraph-image.tsx}
    trips/[id]/page.tsx                                 # rewrite: smart feed
    trips/[id]/actions.ts                               # modify: join link
    trips/[id]/members/page.tsx
    trips/[id]/bookings/{page.tsx,actions.ts}
    trips/[id]/documents/{page.tsx,actions.ts}
    trips/[id]/incidents/[incidentId]/{page.tsx,actions.ts}
    trips/[id]/votes/[voteId]/{page.tsx,actions.ts}
    trips/[id]/money/{page.tsx,actions.ts}
    privacy/page.tsx  sms-terms/page.tsx                # Task 18: the pages A2P registration links to
    admin/{page.tsx,playbook-editor.tsx,actions.ts}
    api/webhooks/inbound-email/route.ts
    api/webhooks/aeroapi/[secret]/route.ts
    api/webhooks/twilio/route.ts
    api/webhooks/stripe/route.ts                        # modify: start monitoring
    api/cron/notifications/route.ts
    api/cron/retention/route.ts
    api/cron/document-checks/route.ts                   # Task 16: the T-30 document check
  lib/
    types/trip-room.ts
    auth/phone.ts
    trips/join-token.ts  trips/join-preview.ts  trips/join-lookup.ts  trips/feed.ts
    notify/quiet-hours.ts  notify/templates.ts  notify/plan.ts  notify/deliver.ts  notify/queue.ts  notify/sms-consent.ts
    ai/models.ts
    intake/sender.ts  intake/inbound-source.ts  intake/storage.ts  intake/extract.ts
    intake/normalize.ts  intake/passengers.ts  intake/process.ts  intake/live-deps.ts
    flights/aeroapi.ts  flights/fixture-aeroapi.ts  flights/geo.ts  flights/resolve.ts
    documents/facts.ts  documents/check.ts  documents/deadlines.ts  documents/service.ts
    monitor/snapshot.ts  monitor/record.ts
    workflows/tokens.ts  workflows/ports.ts  workflows/live-ports.ts  workflows/memory-ports.ts
    assist/carriers.ts  assist/situation.ts  assist/questions.ts  assist/assess.ts
    assist/playbook.ts  assist/citation-check.ts  assist/template.ts  assist/incidents.ts
    votes/tally.ts
    expenses/settle.ts  expenses/pay-links.ts
    admin/emails.ts  admin/guard.ts  retention.ts
  scripts/setup-storage.mts  eval-extraction.mts  eval-replay.mts  resend-setup.mts  smoke-production.mts
  test/
    helpers/webhooks.ts  helpers/mock-model.ts  fixtures/e2e/**
    **/*.test.ts(x)  workflows/*.integration.test.ts
  e2e/prepare.sh  e2e/helpers.ts  e2e/group-trip.spec.ts
```

---

### Task 1: Group join by link, phone codes, and the join-link preview

**Files:**
- Create: `apps/web/lib/types/trip-room.ts`, `apps/web/lib/auth/phone.ts`, `apps/web/lib/trips/join-token.ts`, `apps/web/lib/trips/join-preview.ts`, `apps/web/lib/trips/join-lookup.ts`, `apps/web/app/join/[token]/page.tsx`, `apps/web/app/join/[token]/join-form.tsx`, `apps/web/app/join/[token]/actions.ts`, `apps/web/app/join/[token]/opengraph-image.tsx`, `apps/web/test/auth/phone.test.ts`, `apps/web/test/trips/join-token.test.ts`, `apps/web/test/trips/join-preview.test.ts`
- Modify: `apps/web/app/login/actions.ts`, `apps/web/app/login/login-form.tsx`, `apps/web/app/login/page.tsx`, `apps/web/app/trips/[id]/actions.ts`, `apps/web/app/trips/[id]/page.tsx`, `.env.example`

**Interfaces:**
- Consumes: C1's `create_trip`/`join_trip` SQL, `requireUser`, `createClient`, `createAdminClient`, `Character`, `CHARACTER_NAMES`, `characterDataUrl`, and `formatIsoDate`.
- Produces:
  - **Archived trip-room types** (`lib/types/trip-room.ts`): `TripActionItem`, `TripActionItemKind`, `TripActionItemStatus`, `TripVote`, `TripVoteOption`
  - **Phone helpers:** `parsePhone(v): string | null` (E.164) and `smsEnabled(): boolean`
  - **Join tokens:**
    - `joinToken(secret, tripId, expiresAtIso): string` (22 base64url characters)
    - `hashJoinToken(token): string` (64 hex characters)
    - `joinExpiry(endDate, now?): string`
    - `isJoinTokenShape(token): boolean`
  - **Join preview:**
    - `joinPreview(trip, memberCount): JoinPreview`, where `JoinPreview = { tripName; dates; travelerCount }`
    - `findJoinableTrip(token): Promise<{ trip: { id; name; start_date; end_date }; memberCount } | null>`
  - **Planner actions** (`app/trips/[id]/actions.ts`):
    - `createJoinLink(tripId): Promise<string>`
    - `currentJoinLink(tripId): Promise<string | null>`
  - **Login:** `LoginState = { step: 'contact' | 'verify'; channel: 'email' | 'phone'; contact: string; error: string | null }`, which replaces C1's shape.
  - **Join action:** `joinTripAction(token, prev, form)`. Task 7 adds a document-check call to it.

- [ ] **Step 1: Restore the archived trip-room types**

```bash
git show archive/mobile-expo-2026-10:packages/shared/src/types/trip-room.ts > /tmp/trip-room.ts
```
Create `apps/web/lib/types/trip-room.ts`. It holds only the contracts C2 uses, copied verbatim from `/tmp/trip-room.ts`:
```ts
// Contracts kept from the archived trip room:
// archive/mobile-expo-2026-10:packages/shared/src/types/trip-room.ts
export type TripActionItemKind = 'approval' | 'payment' | 'document' | 'checklist' | 'assist' | 'booking' | 'media';
export type TripActionItemStatus = 'open' | 'snoozed' | 'done';

export interface TripActionItem {
  id: string;
  tripId: string;
  kind: TripActionItemKind;
  title: string;
  detail: string;
  assignedUserIds: string[];
  dueAt: string | null;
  status: TripActionItemStatus;
  relatedEntityId: string | null;
  notificationState: 'enabled' | 'quiet' | 'sent';
}

export interface TripVoteOption {
  id: string;
  label: string;
  votes: number;
}

export interface TripVote {
  id: string;
  tripId: string;
  title: string;
  detail: string;
  options: TripVoteOption[];
  requiredParticipantIds: string[];
  deadline: string | null;
  status: 'open' | 'closed';
}
```
Run `diff <(sed -n '/^export interface TripVoteOption/,/^}/p' /tmp/trip-room.ts) <(sed -n '/^export interface TripVoteOption/,/^}/p' apps/web/lib/types/trip-room.ts)`. Expected: no output.

- [ ] **Step 2: Write the failing tests**

`apps/web/test/auth/phone.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parsePhone } from '@/lib/auth/phone';

describe('parsePhone', () => {
  it('normalizes US numbers to E.164', () => {
    expect(parsePhone('(555) 123-4567')).toBe('+15551234567');
    expect(parsePhone('1 555 123 4567')).toBe('+15551234567');
    expect(parsePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('rejects junk', () => {
    expect(parsePhone('12345')).toBeNull();
    expect(parsePhone('+0 123')).toBeNull();
    expect(parsePhone(null)).toBeNull();
  });
});
```

`apps/web/test/trips/join-token.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { hashJoinToken, isJoinTokenShape, joinExpiry, joinToken } from '@/lib/trips/join-token';

describe('join tokens', () => {
  const expires = '2026-11-17T23:59:59.123Z';

  it('is deterministic for a trip and expiry, so the planner can see the link again', () => {
    expect(joinToken('s3cret', 'trip-1', expires)).toBe(joinToken('s3cret', 'trip-1', expires));
    expect(isJoinTokenShape(joinToken('s3cret', 'trip-1', expires))).toBe(true);
  });

  it('changes when the link is reset or the secret changes', () => {
    expect(joinToken('s3cret', 'trip-1', expires)).not.toBe(joinToken('s3cret', 'trip-1', '2026-11-17T23:59:59.124Z'));
    expect(joinToken('s3cret', 'trip-1', expires)).not.toBe(joinToken('other', 'trip-1', expires));
  });

  it('hashes to 64 hex characters', () => {
    expect(hashJoinToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('expires seven days after the trip ends', () => {
    expect(joinExpiry('2026-11-10', new Date('2026-10-01T00:00:00.123Z'))).toBe('2026-11-17T23:59:59.123Z');
  });
});
```

`apps/web/test/trips/join-preview.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { joinPreview } from '@/lib/trips/join-preview';

describe('joinPreview', () => {
  it('exposes only the trip name, dates, and traveler count', () => {
    const preview = joinPreview({ name: 'Lisbon 2026', start_date: '2026-11-03', end_date: '2026-11-10' }, 4);
    expect(preview).toEqual({ tripName: 'Lisbon 2026', dates: 'Nov 3 – Nov 10, 2026', travelerCount: 4 });
    expect(Object.keys(preview).sort()).toEqual(['dates', 'travelerCount', 'tripName']);
  });

  it('handles missing dates', () => {
    expect(joinPreview({ name: 'Somewhere', start_date: null, end_date: null }, 1).dates).toBe('Dates to be set');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/auth/phone.test.ts test/trips/join-token.test.ts test/trips/join-preview.test.ts; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 4: Implement the pure modules**

`apps/web/lib/auth/phone.ts`:
```ts
export function parsePhone(value: FormDataEntryValue | string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  const e164 = raw.startsWith('+')
    ? `+${digits}`
    : digits.length === 10
      ? `+1${digits}`
      : digits.length === 11 && digits.startsWith('1')
        ? `+${digits}`
        : null;
  return e164 && /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
}

/** SMS sign-in and alerts stay off until US carriers clear our A2P 10DLC registration. */
export function smsEnabled(): boolean {
  return process.env.SMS_ENABLED === 'true';
}
```

`apps/web/lib/trips/join-token.ts`:
```ts
import { createHash, createHmac } from 'node:crypto';

/**
 * The token is derived, not stored: HMAC(secret, tripId:expiresAt). The database keeps only its hash,
 * so a database leak alone never reveals a working link. Resetting the expiry rotates the link.
 */
export function joinToken(secret: string, tripId: string, expiresAtIso: string): string {
  return createHmac('sha256', secret).update(`${tripId}:${new Date(expiresAtIso).toISOString()}`).digest('base64url').slice(0, 22);
}

export function hashJoinToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Trip end plus seven days, with the current millisecond folded in so a reset always rotates the token. */
export function joinExpiry(endDate: string, now: Date = new Date()): string {
  const base = new Date(`${endDate}T23:59:59.000Z`).getTime() + 7 * 24 * 60 * 60 * 1000;
  return new Date(base + (now.getTime() % 1000)).toISOString();
}

export function isJoinTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(token);
}
```

`apps/web/lib/trips/join-preview.ts`:
```ts
export interface JoinPreview {
  tripName: string;
  dates: string;
  travelerCount: number;
}

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const year = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'UTC' });

/** The only trip data a join link may reveal, including inside Messages or WhatsApp link previews. */
export function joinPreview(trip: { name: string; start_date: string | null; end_date: string | null }, memberCount: number): JoinPreview {
  const dates =
    trip.start_date && trip.end_date
      ? `${day.format(new Date(`${trip.start_date}T00:00:00Z`))} – ${day.format(new Date(`${trip.end_date}T00:00:00Z`))}, ${year.format(new Date(`${trip.end_date}T00:00:00Z`))}`
      : 'Dates to be set';
  return { tripName: trip.name, dates, travelerCount: memberCount };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd apps/web && npx vitest run test/auth/phone.test.ts test/trips/join-token.test.ts test/trips/join-preview.test.ts; cd ../..
```
Expected: PASS.

- [ ] **Step 6: Write the server lookup, planner link actions, and phone-aware sign-in**

`apps/web/lib/trips/join-lookup.ts`:
```ts
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashJoinToken, isJoinTokenShape } from './join-token';

/** Service role, because the visitor is not a member yet. Selects only what joinPreview may reveal. */
export async function findJoinableTrip(token: string) {
  if (!isJoinTokenShape(token)) return null;
  const admin = createAdminClient();
  const { data: trip } = await admin
    .from('trips')
    .select('id, name, start_date, end_date')
    .eq('join_token_hash', hashJoinToken(token))
    .gt('join_token_expires_at', new Date().toISOString())
    .maybeSingle();
  if (!trip) return null;
  const { count } = await admin.from('trip_members').select('id', { count: 'exact', head: true }).eq('trip_id', trip.id);
  return { trip, memberCount: count ?? 0 };
}
```

Append to `apps/web/app/trips/[id]/actions.ts`:
```ts
import { revalidatePath } from 'next/cache';
import { joinExpiry, joinToken, hashJoinToken } from '@/lib/trips/join-token';
import { requireEnv } from '@/lib/env';

async function requirePlanner(tripId: string) {
  await requireUser(`/trips/${tripId}`);
  const supabase = await createClient();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: tripId });
  if (isPlanner !== true) throw new Error('Only the planner can do that.');
  return supabase;
}

export async function createJoinLink(tripId: string): Promise<string> {
  const supabase = await requirePlanner(tripId);
  const { data: trip, error } = await supabase.from('trips').select('end_date').eq('id', tripId).single();
  if (error || !trip?.end_date) throw new Error('Set the trip dates before inviting the group.');
  const expiresAt = joinExpiry(trip.end_date);
  const token = joinToken(requireEnv('JOIN_LINK_SECRET'), tripId, expiresAt);
  const { error: updateError } = await supabase
    .from('trips')
    .update({ join_token_hash: hashJoinToken(token), join_token_expires_at: expiresAt })
    .eq('id', tripId);
  if (updateError) throw new Error(updateError.message);
  // The trip page shows the link; re-render it.
  revalidatePath(`/trips/${tripId}`);
  return `${appUrl()}/join/${token}`;
}

export async function currentJoinLink(tripId: string): Promise<string | null> {
  const supabase = await requirePlanner(tripId);
  const { data: trip } = await supabase.from('trips').select('join_token_expires_at').eq('id', tripId).single();
  if (!trip?.join_token_expires_at || new Date(trip.join_token_expires_at) < new Date()) return null;
  return `${appUrl()}/join/${joinToken(requireEnv('JOIN_LINK_SECRET'), tripId, trip.join_token_expires_at)}`;
}
```
Merge the new imports into the file's existing import block. Don't duplicate `requireUser`, `createClient`, or `appUrl`.

`apps/web/app/login/actions.ts`. Replace the whole file:
```ts
'use server';

import { redirect } from 'next/navigation';
import { parseEmail, parseOtpCode } from '@/lib/auth/otp';
import { parsePhone, smsEnabled } from '@/lib/auth/phone';
import { safeNext } from '@/lib/auth/safe-next';
import { createClient } from '@/lib/supabase/server';

export interface LoginState {
  step: 'contact' | 'verify';
  channel: 'email' | 'phone';
  contact: string;
  error: string | null;
}

export async function loginAction(prev: LoginState, form: FormData): Promise<LoginState> {
  const supabase = await createClient();
  const channel = form.get('channel') === 'phone' && smsEnabled() ? 'phone' : 'email';

  if (form.get('intent') === 'verify') {
    const contact = String(form.get('contact') ?? prev.contact);
    const code = parseOtpCode(form.get('code'));
    if (!code) return { ...prev, step: 'verify', error: 'Enter the code we sent you.' };
    const { error } =
      channel === 'phone'
        ? await supabase.auth.verifyOtp({ phone: contact, token: code, type: 'sms' })
        : await supabase.auth.verifyOtp({ email: contact, token: code, type: 'email' });
    if (error) return { ...prev, step: 'verify', error: 'That code did not work. Check it, or go back and request a new one.' };
    redirect(safeNext(String(form.get('next') ?? '')));
  }

  const contact = channel === 'phone' ? parsePhone(form.get('contact')) : parseEmail(form.get('contact'));
  if (!contact) {
    return { step: 'contact', channel, contact: '', error: channel === 'phone' ? 'Enter a valid mobile number.' : 'Enter a valid email address.' };
  }
  const { error } =
    channel === 'phone'
      ? await supabase.auth.signInWithOtp({ phone: contact, options: { shouldCreateUser: true } })
      : await supabase.auth.signInWithOtp({ email: contact, options: { shouldCreateUser: true } });
  if (error) return { step: 'contact', channel, contact, error: 'We could not send a code just now. Try again in a minute.' };
  return { step: 'verify', channel, contact, error: null };
}
```

`apps/web/app/login/login-form.tsx`. Replace the whole file:
```tsx
'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { loginAction, type LoginState } from './actions';

const inputClass = 'w-full rounded-md border border-[#d9d3c2] bg-white px-3 py-2';

export function LoginForm({
  next,
  initialContact,
  initialStep,
  phoneAvailable,
}: {
  next: string;
  initialContact: string;
  initialStep: 'contact' | 'verify';
  phoneAvailable: boolean;
}) {
  const [channel, setChannel] = useState<'email' | 'phone'>('email');
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {
    step: initialStep,
    channel: 'email',
    contact: initialContact,
    error: null,
  });
  const activeChannel = state.step === 'verify' ? state.channel : channel;
  return (
    <form action={formAction} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="channel" value={activeChannel} />
      {state.step === 'contact' ? (
        <>
          {phoneAvailable ? (
            <div className="flex gap-2 text-sm" role="radiogroup" aria-label="How should we send your code?">
              <Button type="button" variant={channel === 'email' ? 'default' : 'outline'} size="sm" onClick={() => setChannel('email')}>
                Email
              </Button>
              <Button type="button" variant={channel === 'phone' ? 'default' : 'outline'} size="sm" onClick={() => setChannel('phone')}>
                Text message
              </Button>
            </div>
          ) : null}
          <label htmlFor="contact" className="block text-sm font-medium">
            {channel === 'phone' ? 'Mobile number' : 'Email'}
          </label>
          <input
            id="contact"
            name="contact"
            type={channel === 'phone' ? 'tel' : 'email'}
            autoComplete={channel === 'phone' ? 'tel' : 'email'}
            required
            defaultValue={state.contact}
            className={inputClass}
          />
          <input type="hidden" name="intent" value="send" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Sending…' : 'Send me a code'}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-[#4b5745]">We sent a code to {state.contact}.</p>
          <input type="hidden" name="contact" value={state.contact} />
          <label htmlFor="code" className="block text-sm font-medium">Code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required className={`${inputClass} tracking-widest`} />
          <input type="hidden" name="intent" value="verify" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Checking…' : 'Continue'}
          </Button>
        </>
      )}
      {state.error ? (
        <p role="alert" className="text-sm text-[#b42318]">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
```

In `apps/web/app/login/page.tsx`:
1. Add `import { smsEnabled } from '@/lib/auth/phone';`.
2. In `LoginContent`, render:
   ```tsx
   <LoginForm next={safeNext(params.next)} initialContact={params.email ?? ''} initialStep={params.step === 'verify' ? 'verify' : 'contact'} phoneAvailable={smsEnabled()} />
   ```
3. Change the sub-copy to: `We send you a one-time code. No password.`

- [ ] **Step 7: Write the join page, form, action, and link preview**

`apps/web/app/join/[token]/actions.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { smsEnabled } from '@/lib/auth/phone';
import { requireUser } from '@/lib/auth/user';
import { createClient } from '@/lib/supabase/server';
import { hashJoinToken, isJoinTokenShape } from '@/lib/trips/join-token';

export interface JoinState {
  error: string | null;
}

const JoinInput = z.object({
  displayName: z.string().trim().min(1, 'Add your name.').max(80),
  venmo: z.string().trim().regex(/^@?[A-Za-z0-9_-]{5,30}$/, 'That Venmo username looks off.').optional().or(z.literal('')),
  cashtag: z.string().trim().regex(/^\$?[A-Za-z][A-Za-z0-9]{0,19}$/, 'That $cashtag looks off.').optional().or(z.literal('')),
  smsOptIn: z.boolean(),
  timezone: z.string().max(64),
});

// Not exported: a 'use server' file may export only async functions.
const SMS_POLICY_VERSION = 'sms-2026-10';
const EMAIL_POLICY_VERSION = 'email-2026-10';

export async function joinTripAction(token: string, _prev: JoinState, form: FormData): Promise<JoinState> {
  if (!isJoinTokenShape(token)) return { error: 'This invite link is not valid.' };
  const user = await requireUser(`/join/${token}`);
  const parsed = JoinInput.safeParse({
    displayName: form.get('displayName') ?? '',
    venmo: form.get('venmo') ?? '',
    cashtag: form.get('cashtag') ?? '',
    smsOptIn: form.get('smsOptIn') === 'on',
    timezone: form.get('timezone') ?? 'America/New_York',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: tripId, error } = await supabase.rpc('join_trip', { p_token_hash: hashJoinToken(token), p_display_name: parsed.data.displayName });
  if (error || typeof tripId !== 'string') return { error: 'This invite link has expired. Ask the planner for a new one.' };

  const smsOptIn = parsed.data.smsOptIn && smsEnabled() && Boolean(user.phone);
  const validZone = Intl.supportedValuesOf('timeZone').includes(parsed.data.timezone) ? parsed.data.timezone : 'America/New_York';
  await supabase
    .from('profiles')
    .update({
      venmo_username: parsed.data.venmo ? parsed.data.venmo.replace(/^@/, '') : null,
      cashtag: parsed.data.cashtag ? parsed.data.cashtag.replace(/^\$/, '') : null,
      sms_opt_in: smsOptIn,
      timezone: validZone,
    })
    .eq('id', user.id);

  const consents = [
    ...(user.email ? [{ user_id: user.id, kind: 'email', policy_version: EMAIL_POLICY_VERSION }] : []),
    ...(smsOptIn ? [{ user_id: user.id, kind: 'sms', policy_version: SMS_POLICY_VERSION }] : []),
  ];
  if (consents.length > 0) await supabase.from('consents').insert(consents);

  redirect(`/trips/${tripId}`);
}
```

`apps/web/app/join/[token]/join-form.tsx`:
```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { joinTripAction, type JoinState } from './actions';

const inputClass = 'mt-1 w-full rounded-md border border-[#d9d3c2] bg-white px-3 py-2';

export function JoinForm({ token, offerSms }: { token: string; offerSms: boolean }) {
  const [state, formAction, pending] = useActionState<JoinState, FormData>(joinTripAction.bind(null, token), { error: null });
  const [timezone, setTimezone] = useState('America/New_York');
  useEffect(() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  return (
    <form action={formAction} className="mt-8 space-y-5">
      <input type="hidden" name="timezone" value={timezone} />
      <label className="block text-sm font-medium">
        Your name, as the group knows you
        <input name="displayName" required className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        Venmo username (optional, so the group can pay you back)
        <input name="venmo" placeholder="@your-name" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        Cash App $cashtag (optional)
        <input name="cashtag" placeholder="$yourname" className={inputClass} />
      </label>
      {offerSms ? (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="smsOptIn" className="mt-1" />
          <span>Text me if something affects my flights. Message and data rates may apply. Reply STOP to opt out.</span>
        </label>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-[#b42318]">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Joining…' : 'Join the trip'}
      </Button>
    </form>
  );
}
```

`apps/web/app/join/[token]/page.tsx`:
```tsx
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Character } from '@/components/character';
import { smsEnabled } from '@/lib/auth/phone';
import { getCurrentUser } from '@/lib/auth/user';
import { CHARACTER_NAMES } from '@/lib/characters';
import { findJoinableTrip } from '@/lib/trips/join-lookup';
import { joinPreview } from '@/lib/trips/join-preview';
import { LoginForm } from '@/app/login/login-form';
import { JoinForm } from './join-form';

type Params = Promise<{ token: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = await findJoinableTrip((await params).token);
  if (!found) return { title: 'Elsewhere invite' };
  const preview = joinPreview(found.trip, found.memberCount);
  return {
    title: `${preview.tripName} · you’re invited`,
    description: `${preview.travelerCount} traveler${preview.travelerCount === 1 ? '' : 's'} · ${preview.dates}`,
    robots: { index: false },
  };
}

export default function JoinPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <div className="flex justify-center gap-2" aria-hidden>
        {CHARACTER_NAMES.map((character) => (
          <Character key={character} character={character} variant="avatar" width={56} />
        ))}
      </div>
      <Suspense fallback={<p className="mt-8 text-center text-[#4b5745]">Opening the invite…</p>}>
        <JoinContent params={params} />
      </Suspense>
    </main>
  );
}

async function JoinContent({ params }: { params: Params }) {
  const { token } = await params;
  const found = await findJoinableTrip(token);
  if (!found) {
    return (
      <p className="mt-8 text-center text-lg">This invite link has expired. Ask the planner to send a new one.</p>
    );
  }
  const preview = joinPreview(found.trip, found.memberCount);
  const user = await getCurrentUser();
  return (
    <>
      <h1 className="mt-6 text-center text-3xl font-bold tracking-tight">{preview.tripName}</h1>
      <p className="mt-2 text-center text-[#4b5745]">
        {preview.dates} · {preview.travelerCount} traveler{preview.travelerCount === 1 ? '' : 's'} so far
      </p>
      <p className="mt-4 text-center">Join to see the plan and get told what you’re owed if a flight goes sideways.</p>
      {user ? (
        <JoinForm token={token} offerSms={smsEnabled() && Boolean(user.phone)} />
      ) : (
        <LoginForm next={`/join/${token}`} initialContact="" initialStep="contact" phoneAvailable={smsEnabled()} />
      )}
    </>
  );
}
```

`apps/web/app/join/[token]/opengraph-image.tsx`:
```tsx
import { ImageResponse } from 'next/og';
import { CHARACTER_NAMES } from '@/lib/characters';
import { characterDataUrl } from '@/lib/og/assets';
import { findJoinableTrip } from '@/lib/trips/join-lookup';
import { joinPreview } from '@/lib/trips/join-preview';

export const alt = 'You’re invited to a trip on Elsewhere';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Renders inside Messages and WhatsApp. It may show only the trip name, dates, and traveler count.
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const found = await findJoinableTrip((await params).token);
  const preview = found ? joinPreview(found.trip, found.memberCount) : null;
  const portraits = await Promise.all(CHARACTER_NAMES.map((character) => characterDataUrl(character)));
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#faf8f1', padding: 48 }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2, color: '#b4532a' }}>ELSEWHERE</div>
        <div style={{ fontSize: 60, fontWeight: 800, color: '#2f3a2c', marginTop: 8 }}>
          {preview ? `${preview.tripName} · you’re invited` : 'You’re invited'}
        </div>
        <div style={{ fontSize: 32, color: '#4b5745', marginTop: 8 }}>
          {preview ? `${preview.travelerCount} traveler${preview.travelerCount === 1 ? '' : 's'} · ${preview.dates}` : 'Join the trip on Elsewhere'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', marginTop: 'auto' }}>
          {portraits.map((src) => (
            <img key={src.slice(-24)} src={src} width={200} height={300} style={{ objectFit: 'contain' }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
```

- [ ] **Step 8: Let the planner create and copy the invite link**

In `apps/web/app/trips/[id]/page.tsx` (C1's page; Task 15 replaces it), add an invite section after the forwarding address.

Add the imports:
```tsx
import { createJoinLink, currentJoinLink } from './actions';
```

Inside `TripContent`, after the forwarding `</section>`, add:
```tsx
      <InviteSection tripId={trip.id} />
```

At the bottom of the file:
```tsx
async function InviteSection({ tripId }: { tripId: string }) {
  const supabase = await createClient();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: tripId });
  if (isPlanner !== true) return null;
  const link = await currentJoinLink(tripId);
  return (
    <section className="mt-6 rounded-xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="font-semibold">Invite the group</h2>
      {link ? (
        <p className="mt-2 break-all font-mono text-sm">{link}</p>
      ) : (
        <p className="mt-2 text-sm text-[#4b5745]">Create a link and drop it in the group chat. Anyone with it can join until a week after the trip.</p>
      )}
      <form
        action={async () => {
          'use server';
          await createJoinLink(tripId);
        }}
        className="mt-3"
      >
        <Button type="submit" variant="outline">
          {link ? 'Reset the link' : 'Create invite link'}
        </Button>
      </form>
    </section>
  );
}
```
Add `import { Button } from '@/components/ui/button';` if it isn't already imported.

Append to `.env.example`:
```bash
# Group join links (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JOIN_LINK_SECRET=
# SMS stays off until Twilio A2P 10DLC registration clears
SMS_ENABLED=false
```

- [ ] **Step 9: Run the tests, typecheck, and build**

```bash
cd apps/web && npx vitest run && npm run typecheck && npm run build; cd ../..
```
Expected: all tests pass, typecheck is clean, and the build succeeds. `/join/[token]` and its OG image are dynamic routes.

- [ ] **Step 10: Commit**

```bash
git add apps/web .env.example
git commit -F - <<'EOF'
Let the group join from one link, with phone codes behind a flag

The planner drops one link in the group chat. Tokens are derived from a
server secret, so only their hash is stored, and resetting the link
rotates them. The join page and its link preview reveal only the trip
name, dates, and traveler count. Members add pay handles and opt in to
texts, and consent is recorded. Phone sign-in waits for SMS_ENABLED.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 2: Notifications — quiet hours, email, SMS, and the outbox seam

**Files:**
- Create: `apps/web/lib/notify/quiet-hours.ts`, `apps/web/lib/notify/templates.ts`, `apps/web/lib/notify/plan.ts`, `apps/web/lib/notify/deliver.ts`, `apps/web/lib/notify/queue.ts`, `apps/web/app/api/webhooks/twilio/route.ts`, `apps/web/app/api/cron/notifications/route.ts`, `apps/web/vercel.json`, `apps/web/test/notify/quiet-hours.test.ts`, `apps/web/test/notify/templates.test.ts`, `apps/web/test/notify/plan.test.ts`, `apps/web/test/notify/deliver.test.ts`, `apps/web/test/notify/twilio-route.test.ts`
- Modify: `apps/web/package.json` (dependencies `resend`, `twilio`), `.env.example`

**Interfaces:**
- Produces:
  - **Quiet hours:**
    - `isQuietHours(date, tz): boolean`
    - `nextSendTime(date, tz): Date`
  - **Templates:**
    - `Rendered = { subject: string; text: string; sms: string }`
    - `incidentNotice({ tripName, headline, url })`
    - `questionNotice({ tripName, prompt, url })`
    - `voteNotice({ tripName, title, url })`
    - `documentNotice({ tripName, url })`
    - `briefingNotice({ tripName, url })`
    - `reviewHoldNotice({ tripName, url })`
  - **Planning:**
    - `planDeliveries(recipients, input, now, smsOn): PlannedNotification[]`
    - `NotifyInput = { userIds: string[]; tripId: string | null; template: string; rendered: Rendered; urgent: boolean; relatedEntityId?: string | null }`
  - **Delivery:**
    - `deliver({ channel, to, subject, body }): Promise<{ providerMessageId: string }>`
    - `queueNotifications(input, now?): Promise<void>`
    - `flushDue(now?): Promise<number>`
  - **Routes:** `POST /api/webhooks/twilio` and `GET /api/cron/notifications` (Bearer `CRON_SECRET`).

- [ ] **Step 1: Add the provider SDKs**

```bash
npm install resend@6.32.0 twilio@6.1.2 -w @elsewhere/web
```

- [ ] **Step 2: Write the failing tests**

`apps/web/test/notify/quiet-hours.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isQuietHours, nextSendTime } from '@/lib/notify/quiet-hours';

describe('quiet hours', () => {
  it('treats 9pm to 8am local as quiet', () => {
    expect(isQuietHours(new Date('2026-11-04T03:00:00Z'), 'America/New_York')).toBe(true); // 10pm EST
    expect(isQuietHours(new Date('2026-11-04T15:00:00Z'), 'America/New_York')).toBe(false); // 10am EST
  });

  it('defers a quiet-hours send to 8am local', () => {
    const next = nextSendTime(new Date('2026-11-04T03:00:00Z'), 'America/New_York');
    expect(next.toISOString()).toBe('2026-11-04T13:00:00.000Z'); // 8am EST
  });

  it('leaves daytime sends alone', () => {
    const now = new Date('2026-11-04T15:00:00Z');
    expect(nextSendTime(now, 'America/New_York')).toEqual(now);
  });
});
```

`apps/web/test/notify/templates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { incidentNotice, questionNotice, voteNotice } from '@/lib/notify/templates';

describe('templates', () => {
  it('keeps SMS short and always includes the link', () => {
    const notice = incidentNotice({ tripName: 'Lisbon 2026', headline: 'TP 204 on Nov 3 was cancelled. You may be owed a cash refund.', url: 'https://x.test/trips/1/incidents/2' });
    expect(notice.sms.length).toBeLessThanOrEqual(320);
    expect(notice.sms).toContain('https://x.test/trips/1/incidents/2');
    expect(notice.text).toContain('We drafted');
  });

  it('asks the planner one question with a link', () => {
    const notice = questionNotice({ tripName: 'Lisbon 2026', prompt: 'Did anyone accept the airline’s new flight or a travel credit?', url: 'https://x.test/q' });
    expect(notice.subject).toContain('Lisbon 2026');
    expect(notice.sms).toContain('https://x.test/q');
  });

  it('links votes', () => {
    expect(voteNotice({ tripName: 'Lisbon 2026', title: 'Which flight?', url: 'https://x.test/v' }).sms).toContain('https://x.test/v');
  });
});
```

`apps/web/test/notify/plan.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { planDeliveries } from '@/lib/notify/plan';

const rendered = { subject: 'S', text: 'T', sms: 'M' };
const now = new Date('2026-11-04T03:00:00Z'); // 10pm in New York

const recipients = [
  { id: 'u1', email: 'a@x.test', phone: '+15550000001', sms_opt_in: true, timezone: 'America/New_York' },
  { id: 'u2', email: null, phone: '+15550000002', sms_opt_in: false, timezone: 'America/New_York' },
];

describe('planDeliveries', () => {
  it('sends urgent alerts now, by email and by SMS where the member opted in', () => {
    const rows = planDeliveries(recipients, { userIds: ['u1', 'u2'], tripId: 't', template: 'incident', rendered, urgent: true }, now, true);
    expect(rows.map((r) => [r.user_id, r.channel, r.send_after])).toEqual([
      ['u1', 'email', now.toISOString()],
      ['u1', 'sms', now.toISOString()],
    ]);
  });

  it('holds non-urgent messages until morning and skips SMS when it is switched off', () => {
    const rows = planDeliveries(recipients, { userIds: ['u1'], tripId: 't', template: 'briefing', rendered, urgent: false }, now, false);
    expect(rows).toHaveLength(1);
    expect(rows[0].channel).toBe('email');
    expect(rows[0].send_after).toBe('2026-11-04T13:00:00.000Z');
  });
});
```

`apps/web/test/notify/deliver.test.ts`:
```ts
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { deliver } from '@/lib/notify/deliver';

afterEach(() => {
  delete process.env.ELSEWHERE_OUTBOX_DIR;
  delete process.env.VERCEL_ENV;
});

describe('deliver', () => {
  it('writes to the outbox seam instead of calling providers', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'outbox-'));
    process.env.ELSEWHERE_OUTBOX_DIR = dir;
    const result = await deliver({ channel: 'email', to: 'a@x.test', subject: 'Hi', body: 'Body' });
    expect(result.providerMessageId).toMatch(/^outbox-/);
    const line = JSON.parse(readFileSync(path.join(dir, 'outbox.jsonl'), 'utf8').trim());
    expect(line).toMatchObject({ channel: 'email', to: 'a@x.test', subject: 'Hi', body: 'Body' });
  });

  it('refuses the outbox seam in production', async () => {
    process.env.ELSEWHERE_OUTBOX_DIR = tmpdir();
    process.env.VERCEL_ENV = 'production';
    await expect(deliver({ channel: 'email', to: 'a@x.test', subject: 'Hi', body: 'Body' })).rejects.toThrow(/test seam/);
  });
});
```

`apps/web/test/notify/twilio-route.test.ts`:
```ts
import twilio from 'twilio';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const updates: { table: string; values: unknown }[] = [];

/** A PostgREST-style builder: every filter returns itself, and awaiting it resolves { error: null }. */
function chain() {
  const builder: Record<string, unknown> = {};
  builder.eq = () => builder;
  builder.is = () => builder;
  builder.then = (resolve: (value: unknown) => unknown) => resolve({ error: null });
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      update: (values: unknown) => {
        updates.push({ table, values });
        return chain();
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'user-1' }, error: null }) }) }),
    }),
  }),
}));

beforeAll(() => {
  process.env.TWILIO_AUTH_TOKEN = 'tw-token';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';
});

function signedRequest(params: Record<string, string>, signature?: string) {
  const url = 'https://app.example.test/api/webhooks/twilio';
  const sig = signature ?? twilio.getExpectedTwilioSignature('tw-token', url, params);
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig },
    body: new URLSearchParams(params).toString(),
  });
}

describe('POST /api/webhooks/twilio', () => {
  it('rejects bad signatures', async () => {
    const { POST } = await import('@/app/api/webhooks/twilio/route');
    expect((await POST(signedRequest({ MessageSid: 'SM1', MessageStatus: 'delivered' }, 'bad'))).status).toBe(403);
  });

  it('records delivery status', async () => {
    const { POST } = await import('@/app/api/webhooks/twilio/route');
    const res = await POST(signedRequest({ MessageSid: 'SM1', MessageStatus: 'delivered' }));
    expect(res.status).toBe(200);
    expect(updates).toContainEqual({ table: 'notifications', values: { status: 'delivered' } });
  });

  it('mirrors STOP to the profile and the consent record', async () => {
    const { POST } = await import('@/app/api/webhooks/twilio/route');
    await POST(signedRequest({ From: '+15550000001', OptOutType: 'STOP', Body: 'STOP' }));
    expect(updates).toContainEqual({ table: 'profiles', values: { sms_opt_in: false } });
    expect(updates.some((u) => u.table === 'consents')).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/notify; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 4: Implement**

`apps/web/lib/notify/quiet-hours.ts`:
```ts
const QUIET_START = 21;
const QUIET_END = 8;

export function localHour(date: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(date));
}

export function isQuietHours(date: Date, timeZone: string): boolean {
  const hour = localHour(date, timeZone);
  return hour >= QUIET_START || hour < QUIET_END;
}

/** Non-urgent messages wait for 8am local. Steps on the quarter hour, at most 12 hours ahead. */
export function nextSendTime(date: Date, timeZone: string): Date {
  if (!isQuietHours(date, timeZone)) return date;
  const quarter = 15 * 60 * 1000;
  let t = new Date(Math.ceil(date.getTime() / quarter) * quarter);
  for (let i = 0; i < 48 && isQuietHours(t, timeZone); i += 1) t = new Date(t.getTime() + quarter);
  return t;
}
```

`apps/web/lib/notify/templates.ts`:
```ts
export interface Rendered {
  subject: string;
  text: string;
  sms: string;
}

function sms(body: string, url: string): string {
  const prefix = 'Elsewhere: ';
  const room = 320 - prefix.length - url.length - 1;
  return `${prefix}${body.length > room ? `${body.slice(0, room - 1)}…` : body} ${url}`;
}

export function incidentNotice({ tripName, headline, url }: { tripName: string; headline: string; url: string }): Rendered {
  return {
    subject: `${tripName}: ${headline}`,
    text: `${headline}\n\nWe drafted what you’re owed and what to send, with the rules cited:\n${url}\n\nElsewhere drafts; you decide and send. Not legal advice.`,
    sms: sms(headline, url),
  };
}

export function questionNotice({ tripName, prompt, url }: { tripName: string; prompt: string; url: string }): Rendered {
  return {
    subject: `${tripName}: one quick question`,
    text: `${prompt}\n\nYour answer decides which rules apply. Answer here:\n${url}`,
    sms: sms(`Quick question for ${tripName}: ${prompt}`, url),
  };
}

export function voteNotice({ tripName, title, url }: { tripName: string; title: string; url: string }): Rendered {
  return {
    subject: `${tripName}: vote — ${title}`,
    text: `The group needs to decide: ${title}\n\nVote here:\n${url}`,
    sms: sms(`${tripName} vote: ${title}`, url),
  };
}

export function documentNotice({ tripName, url }: { tripName: string; url: string }): Rendered {
  return {
    subject: `${tripName}: check your travel documents`,
    text: `One of your documents may not meet the rules for this trip. See what to do and by when:\n${url}`,
    sms: sms(`${tripName}: one of your travel documents needs attention.`, url),
  };
}

export function briefingNotice({ tripName, url }: { tripName: string; url: string }): Rendered {
  return {
    subject: `${tripName}: you leave in three days`,
    text: `Your trip starts soon. Here’s what’s confirmed and anything still open:\n${url}`,
    sms: sms(`${tripName} starts in 3 days. Your briefing:`, url),
  };
}

export function reviewHoldNotice({ tripName, url }: { tripName: string; url: string }): Rendered {
  return {
    subject: `[Hand-run] ${tripName}: playbook waiting for review`,
    text: `A playbook is held for review before it goes to the group. Edit or release it within two hours:\n${url}`,
    sms: sms(`[Hand-run] ${tripName} playbook waiting for review.`, url),
  };
}
```

`apps/web/lib/notify/plan.ts`:
```ts
import { nextSendTime } from './quiet-hours';
import type { Rendered } from './templates';

export interface NotifyInput {
  userIds: string[];
  tripId: string | null;
  template: string;
  rendered: Rendered;
  urgent: boolean;
  relatedEntityId?: string | null;
}

export interface Recipient {
  id: string;
  email: string | null;
  phone: string | null;
  sms_opt_in: boolean;
  timezone: string;
}

export interface PlannedNotification {
  trip_id: string | null;
  user_id: string;
  channel: 'email' | 'sms';
  template: string;
  subject: string | null;
  body: string;
  urgent: boolean;
  send_after: string;
  related_entity_id: string | null;
}

/** Email always (when we have an address); SMS only for opted-in members while SMS is switched on. */
export function planDeliveries(recipients: Recipient[], input: NotifyInput, now: Date, smsOn: boolean): PlannedNotification[] {
  const rows: PlannedNotification[] = [];
  for (const recipient of recipients) {
    if (!input.userIds.includes(recipient.id)) continue;
    const sendAfter = (input.urgent ? now : nextSendTime(now, recipient.timezone)).toISOString();
    const base = { trip_id: input.tripId, user_id: recipient.id, template: input.template, urgent: input.urgent, send_after: sendAfter, related_entity_id: input.relatedEntityId ?? null };
    if (recipient.email) rows.push({ ...base, channel: 'email', subject: input.rendered.subject, body: input.rendered.text });
    if (smsOn && recipient.phone && recipient.sms_opt_in) rows.push({ ...base, channel: 'sms', subject: null, body: input.rendered.sms });
  }
  return rows;
}
```

`apps/web/lib/notify/deliver.ts`:
```ts
import 'server-only';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { Resend } from 'resend';
import twilio from 'twilio';
import { appUrl, assertTestSeamAllowed, requireEnv } from '@/lib/env';

export interface Delivery {
  channel: 'email' | 'sms';
  to: string;
  subject: string | null;
  body: string;
}

export async function deliver(delivery: Delivery): Promise<{ providerMessageId: string }> {
  const outbox = process.env.ELSEWHERE_OUTBOX_DIR;
  if (outbox) {
    assertTestSeamAllowed('ELSEWHERE_OUTBOX_DIR');
    mkdirSync(outbox, { recursive: true });
    const providerMessageId = `outbox-${crypto.randomUUID()}`;
    appendFileSync(path.join(outbox, 'outbox.jsonl'), `${JSON.stringify({ ...delivery, providerMessageId })}\n`);
    return { providerMessageId };
  }
  if (delivery.channel === 'email') {
    const { data, error } = await new Resend(requireEnv('RESEND_API_KEY')).emails.send({
      from: requireEnv('EMAIL_FROM'),
      to: delivery.to,
      subject: delivery.subject ?? 'Elsewhere',
      text: delivery.body,
    });
    if (error || !data) throw new Error(`email failed: ${error?.message ?? 'no id'}`);
    return { providerMessageId: data.id };
  }
  const client = twilio(requireEnv('TWILIO_ACCOUNT_SID'), requireEnv('TWILIO_AUTH_TOKEN'));
  const message = await client.messages.create({
    messagingServiceSid: requireEnv('TWILIO_MESSAGING_SERVICE_SID'),
    to: delivery.to,
    body: delivery.body,
    statusCallback: `${appUrl()}/api/webhooks/twilio`,
  });
  return { providerMessageId: message.sid };
}
```

`apps/web/lib/notify/queue.ts`:
```ts
import 'server-only';
import { smsEnabled } from '@/lib/auth/phone';
import { createAdminClient } from '@/lib/supabase/admin';
import { deliver } from './deliver';
import { planDeliveries, type NotifyInput, type Recipient } from './plan';

export async function queueNotifications(input: NotifyInput, now: Date = new Date()): Promise<void> {
  if (input.userIds.length === 0) return;
  const admin = createAdminClient();
  const { data: recipients, error } = await admin
    .from('profiles')
    .select('id, email, phone, sms_opt_in, timezone')
    .in('id', input.userIds);
  if (error) throw new Error(error.message);
  const rows = planDeliveries((recipients ?? []) as Recipient[], input, now, smsEnabled());
  if (rows.length > 0) {
    const { error: insertError } = await admin.from('notifications').insert(rows);
    if (insertError) throw new Error(insertError.message);
  }
  await flushDue(now);
}

/** Sends everything due. Undelivered SMS fall back on the email that was queued alongside it. */
export async function flushDue(now: Date = new Date()): Promise<number> {
  const admin = createAdminClient();
  const { data: due, error } = await admin
    .from('notifications')
    .select('id, channel, subject, body, profiles!inner(email, phone)')
    .eq('status', 'queued')
    .lte('send_after', now.toISOString())
    .order('created_at')
    .limit(50);
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const row of due ?? []) {
    const profile = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as { email: string | null; phone: string | null };
    const to = row.channel === 'email' ? profile.email : profile.phone;
    if (!to) {
      await admin.from('notifications').update({ status: 'skipped' }).eq('id', row.id);
      continue;
    }
    try {
      const { providerMessageId } = await deliver({ channel: row.channel, to, subject: row.subject, body: row.body });
      await admin.from('notifications').update({ status: 'sent', provider_message_id: providerMessageId }).eq('id', row.id);
      sent += 1;
    } catch (deliveryError) {
      console.error('notification failed', row.id, deliveryError);
      await admin.from('notifications').update({ status: 'failed' }).eq('id', row.id);
    }
  }
  return sent;
}
```

`apps/web/app/api/webhooks/twilio/route.ts`:
```ts
import twilio from 'twilio';
import { appUrl } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

const STATUS_MAP: Record<string, string> = { delivered: 'delivered', sent: 'sent', failed: 'failed', undelivered: 'failed' };

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const params = Object.fromEntries(new URLSearchParams(body));
  const url = `${appUrl()}/api/webhooks/twilio`;
  const signature = request.headers.get('x-twilio-signature') ?? '';
  if (!twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN ?? '', signature, url, params)) {
    return new Response('invalid signature', { status: 403 });
  }
  const admin = createAdminClient();

  if (params.MessageSid && params.MessageStatus && STATUS_MAP[params.MessageStatus]) {
    await admin.from('notifications').update({ status: STATUS_MAP[params.MessageStatus] }).eq('provider_message_id', params.MessageSid);
  }

  // Twilio Advanced Opt-Out handles STOP/HELP replies; we mirror the opt-out so we never queue SMS again.
  if (params.OptOutType === 'STOP' && params.From) {
    const { data: profile } = await admin.from('profiles').select('id').eq('phone', params.From).maybeSingle();
    if (profile) {
      await admin.from('profiles').update({ sms_opt_in: false }).eq('id', profile.id);
      await admin
        .from('consents')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', profile.id)
        .eq('kind', 'sms')
        .is('revoked_at', null);
    }
  }
  return new Response('<Response/>', { headers: { 'content-type': 'text/xml' } });
}
```

`apps/web/app/api/cron/notifications/route.ts`:
```ts
import { flushDue } from '@/lib/notify/queue';

export async function GET(request: Request): Promise<Response> {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }
  return Response.json({ sent: await flushDue() });
}
```

`apps/web/vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [{ "path": "/api/cron/notifications", "schedule": "*/15 * * * *" }]
}
```

Append to `.env.example`:
```bash
# Outbound email and inbound mail (Resend)
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
EMAIL_FROM=Elsewhere <trips@example.test>
# SMS (Twilio)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
# Vercel cron
CRON_SECRET=
# Test seam: write notifications to <dir>/outbox.jsonl instead of sending
ELSEWHERE_OUTBOX_DIR=
```

- [ ] **Step 5: Run the tests**

```bash
cd apps/web && npx vitest run test/notify; cd ../..
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web .env.example package-lock.json
git commit -F - <<'EOF'
Add notifications: quiet hours, email, SMS, and an outbox seam

Urgent alerts go out at once; everything else waits for 8am in the
member's time zone. Email always goes out; SMS only for opted-in members
once SMS_ENABLED is on. Twilio delivery status and STOP replies are
mirrored back. Tests and e2e write to an outbox file instead of calling
providers.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 3: Booking extraction — schema, model, normalization, and passenger matching

**Files:**
- Create: `apps/web/lib/ai/models.ts`, `apps/web/lib/intake/extract.ts`, `apps/web/lib/intake/normalize.ts`, `apps/web/lib/intake/passengers.ts`, `apps/web/test/helpers/mock-model.ts`, `apps/web/test/intake/extract.test.ts`, `apps/web/test/intake/normalize.test.ts`, `apps/web/test/intake/passengers.test.ts`
- Modify: `apps/web/package.json` (dependency `ai`), `.env.example`

**Interfaces:**
- Produces:
  - **Models:**
    - `MODEL_IDS = { extraction: 'anthropic/claude-haiku-4.5', playbook: 'anthropic/claude-sonnet-5.5' }`
    - `model(kind): Promise<LanguageModel>`, which honours `ELSEWHERE_AI_FAKE_DIR`
    - `NO_TRAINING = { gateway: { disallowPromptTraining: true } }`, passed as `providerOptions` on every model call. AI Gateway then routes only to providers that never train on our prompts.
  - **Extraction:**
    - `ExtractionSchema`
    - `ExtractionInput = { text: string | null; html: string | null; images: { data: Uint8Array; mediaType: string }[]; pdfs: { data: Uint8Array; mediaType: string }[] }`
    - `extractBookings(input, opts?: { model?: LanguageModel }): Promise<NormalizedBooking[]>`
  - **Normalization:**
    - `NormalizedBooking = { kind; provider; confirmationCode: string | null; bookedVia: string | null; passengerNames: string[]; segments: NormalizedSegment[]; confidence: number; dedupeKey: string; problems: string[] }`
    - `NormalizedSegment = { carrierIata; flightNumber; originIata; destinationIata; departureLocal; arrivalLocal: string | null }`
    - `normalizeBooking(raw): NormalizedBooking`
    - `CONFIDENCE_THRESHOLD = 0.9`
  - **Passenger matching:** `matchPassengers(passengers: string[], members: { id: string; display_name: string }[]): { matched: Record<string, string>; unmatched: string[] }`
  - **Test helper:** `mockModel(object)` returns a `MockLanguageModelV4` that answers with the given JSON.

- [ ] **Step 1: Add the AI SDK**

```bash
npm install ai@7.0.127 -w @elsewhere/web
```
Append to `.env.example`:
```bash
# AI Gateway (local only; Vercel uses OIDC)
AI_GATEWAY_API_KEY=
# Test seam: directory of <kind>.json canned model outputs (extraction.json, playbook.json)
ELSEWHERE_AI_FAKE_DIR=
```

- [ ] **Step 2: Write the failing tests**

`apps/web/test/helpers/mock-model.ts`:
```ts
import { MockLanguageModelV4 } from 'ai/test';

export function mockModel(...outputs: unknown[]) {
  return new MockLanguageModelV4({
    doGenerate: outputs.map((output) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 10, text: 10, reasoning: 0 },
      },
      warnings: [],
    })),
  });
}
```

`apps/web/test/intake/normalize.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CONFIDENCE_THRESHOLD, normalizeBooking } from '@/lib/intake/normalize';

const raw = {
  kind: 'flight' as const,
  provider: 'TAP Air Portugal',
  confirmation_code: ' abc123 ',
  booked_via: null,
  passenger_names: ['DOE/PAT MR', 'JONES/SAMANTHA MS'],
  segments: [{ carrier_iata: 'tp', flight_number: '0204', origin_iata: 'ewr', destination_iata: 'lis', departure_local: '2026-11-03T18:15', arrival_local: '2026-11-04T06:35' }],
  confidence: { confirmation_code: 0.98, passengers: 0.95, segments: 0.97 },
};

describe('normalizeBooking', () => {
  it('cleans codes and builds a stable dedupe key', () => {
    const booking = normalizeBooking(raw);
    expect(booking.confirmationCode).toBe('ABC123');
    expect(booking.segments[0]).toEqual({ carrierIata: 'TP', flightNumber: '204', originIata: 'EWR', destinationIata: 'LIS', departureLocal: '2026-11-03T18:15', arrivalLocal: '2026-11-04T06:35' });
    expect(booking.dedupeKey).toBe('ABC123|TP204@2026-11-03');
    expect(booking.confidence).toBe(0.95);
    expect(booking.confidence >= CONFIDENCE_THRESHOLD).toBe(true);
  });

  it('zeroes confidence for fields that fail validation', () => {
    const booking = normalizeBooking({ ...raw, segments: [{ ...raw.segments[0], origin_iata: 'Newark', departure_local: 'Nov 3' }] });
    expect(booking.confidence).toBe(0);
    expect(booking.problems).toContain('segment 1: origin "Newark" is not an airport code');
  });
});
```

`apps/web/test/intake/passengers.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { matchPassengers, splitName } from '@/lib/intake/passengers';

describe('splitName', () => {
  it('reads airline LAST/FIRST TITLE and plain forms', () => {
    expect(splitName('DOE/PAT MR')).toEqual({ first: 'pat', last: 'doe' });
    expect(splitName('Samantha Jones')).toEqual({ first: 'samantha', last: 'jones' });
  });
});

describe('matchPassengers', () => {
  const members = [
    { id: 'm-pat', display_name: 'Pat' },
    { id: 'm-sam', display_name: 'Sam Jones' },
    { id: 'm-jo', display_name: 'Jo' },
  ];

  it('matches nicknames by first-name prefix and full names exactly', () => {
    expect(matchPassengers(['DOE/PAT MR', 'JONES/SAMANTHA MS'], members)).toEqual({
      matched: { 'DOE/PAT MR': 'm-pat', 'JONES/SAMANTHA MS': 'm-sam' },
      unmatched: [],
    });
  });

  it('leaves ambiguous or unknown passengers for the planner', () => {
    const result = matchPassengers(['JO/ANNE', 'SMITH/TERRY'], [...members, { id: 'm-joanne', display_name: 'Joanne' }]);
    expect(result.unmatched).toEqual(['JO/ANNE', 'SMITH/TERRY']);
  });
});
```

`apps/web/test/intake/extract.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { extractBookings } from '@/lib/intake/extract';
import { mockModel } from '../helpers/mock-model';

describe('extractBookings', () => {
  it('returns normalized bookings from the model output', async () => {
    const model = mockModel({
      bookings: [
        {
          kind: 'flight',
          provider: 'TAP Air Portugal',
          confirmation_code: 'ABC123',
          booked_via: 'Expedia',
          passenger_names: ['DOE/PAT MR'],
          segments: [{ carrier_iata: 'TP', flight_number: '204', origin_iata: 'EWR', destination_iata: 'LIS', departure_local: '2026-11-03T18:15', arrival_local: null }],
          confidence: { confirmation_code: 0.99, passengers: 0.97, segments: 0.96 },
        },
      ],
    });
    const bookings = await extractBookings({ text: 'Your TAP itinerary ABC123 …', html: null, images: [], pdfs: [] }, { model });
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({ provider: 'TAP Air Portugal', bookedVia: 'Expedia', dedupeKey: 'ABC123|TP204@2026-11-03' });
    expect(model.doGenerateCalls[0].prompt.some((m) => m.role === 'system')).toBe(true);
    expect(model.doGenerateCalls[0].providerOptions).toEqual({ gateway: { disallowPromptTraining: true } });
  });

  it('returns nothing when the email holds no booking', async () => {
    const bookings = await extractBookings({ text: 'Newsletter', html: null, images: [], pdfs: [] }, { model: mockModel({ bookings: [] }) });
    expect(bookings).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/intake/normalize.test.ts test/intake/passengers.test.ts test/intake/extract.test.ts; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 4: Implement**

`apps/web/lib/ai/models.ts`:
```ts
import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { LanguageModel } from 'ai';
import { assertTestSeamAllowed } from '@/lib/env';

export const MODEL_IDS = {
  extraction: 'anthropic/claude-haiku-4.5',
  playbook: 'anthropic/claude-sonnet-5.5',
} as const;

/** Passed as `providerOptions` on every call: AI Gateway routes only to providers that never train on our prompts. */
export const NO_TRAINING = { gateway: { disallowPromptTraining: true } };

export type ModelKind = keyof typeof MODEL_IDS;

/** Gateway model id in normal runs; a canned replay from <ELSEWHERE_AI_FAKE_DIR>/<kind>.json in e2e. */
export async function model(kind: ModelKind): Promise<LanguageModel> {
  const fakeDir = process.env.ELSEWHERE_AI_FAKE_DIR;
  if (!fakeDir) return MODEL_IDS[kind];
  assertTestSeamAllowed('ELSEWHERE_AI_FAKE_DIR');
  const { MockLanguageModelV4 } = await import('ai/test');
  const text = readFileSync(path.join(fakeDir, `${kind}.json`), 'utf8');
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
      warnings: [],
    },
  });
}
```

`apps/web/lib/intake/normalize.ts`:
```ts
import type { z } from 'zod';
import type { ExtractedBookingSchema } from './extract';

export const CONFIDENCE_THRESHOLD = 0.9;

export interface NormalizedSegment {
  carrierIata: string;
  flightNumber: string;
  originIata: string;
  destinationIata: string;
  departureLocal: string;
  arrivalLocal: string | null;
}

export interface NormalizedBooking {
  kind: 'flight' | 'hotel' | 'rental' | 'car' | 'rail' | 'activity';
  provider: string;
  confirmationCode: string | null;
  bookedVia: string | null;
  passengerNames: string[];
  segments: NormalizedSegment[];
  confidence: number;
  dedupeKey: string;
  problems: string[];
}

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function normalizeBooking(raw: z.infer<typeof ExtractedBookingSchema>): NormalizedBooking {
  const problems: string[] = [];
  let segmentsOk = true;
  const segments = raw.segments.map((segment, index) => {
    const n = index + 1;
    const carrierIata = segment.carrier_iata.trim().toUpperCase();
    const flightNumber = segment.flight_number.trim().replace(/^0+(?=\d)/, '');
    const originIata = segment.origin_iata.trim().toUpperCase();
    const destinationIata = segment.destination_iata.trim().toUpperCase();
    if (!/^[A-Z0-9]{2}$/.test(carrierIata)) problems.push(`segment ${n}: carrier "${segment.carrier_iata}" is not an airline code`);
    if (!/^\d{1,4}$/.test(flightNumber)) problems.push(`segment ${n}: flight number "${segment.flight_number}" is not numeric`);
    if (!/^[A-Z]{3}$/.test(originIata)) problems.push(`segment ${n}: origin "${segment.origin_iata}" is not an airport code`);
    if (!/^[A-Z]{3}$/.test(destinationIata)) problems.push(`segment ${n}: destination "${segment.destination_iata}" is not an airport code`);
    if (!LOCAL_DATETIME.test(segment.departure_local)) problems.push(`segment ${n}: departure "${segment.departure_local}" is not a date and time`);
    if (problems.length > 0) segmentsOk = false;
    return {
      carrierIata,
      flightNumber,
      originIata,
      destinationIata,
      departureLocal: segment.departure_local,
      arrivalLocal: segment.arrival_local && LOCAL_DATETIME.test(segment.arrival_local) ? segment.arrival_local : null,
    };
  });

  const confirmationCode = raw.confirmation_code ? raw.confirmation_code.trim().toUpperCase() : null;
  const groups = [
    confirmationCode ? raw.confidence.confirmation_code : 0.5,
    raw.passenger_names.length > 0 ? raw.confidence.passengers : 0,
    raw.kind === 'flight' ? (segmentsOk && segments.length > 0 ? raw.confidence.segments : 0) : raw.confidence.segments,
  ];
  const confidence = Math.max(0, Math.min(1, Math.min(...groups)));
  const segmentKey = segments.map((s) => `${s.carrierIata}${s.flightNumber}@${s.departureLocal.slice(0, 10)}`).join(',');
  const dedupeKey = `${confirmationCode ?? 'NOCODE'}|${segmentKey || raw.provider.trim().toUpperCase()}`;

  return {
    kind: raw.kind,
    provider: raw.provider.trim(),
    confirmationCode,
    bookedVia: raw.booked_via?.trim() || null,
    passengerNames: raw.passenger_names.map((name) => name.trim()).filter(Boolean),
    segments,
    confidence: segmentsOk ? confidence : 0,
    dedupeKey,
    problems,
  };
}
```

`apps/web/lib/intake/extract.ts`:
```ts
import 'server-only';
import { generateText, Output, type LanguageModel, type UserContent } from 'ai';
import { z } from 'zod';
import { model as defaultModel, NO_TRAINING } from '@/lib/ai/models';
import { normalizeBooking, type NormalizedBooking } from './normalize';

export const ExtractedSegmentSchema = z.object({
  carrier_iata: z.string().describe('Two-character IATA airline code, e.g. "TP"'),
  flight_number: z.string().describe('Flight number digits only, e.g. "204"'),
  origin_iata: z.string().describe('Three-letter IATA departure airport code'),
  destination_iata: z.string().describe('Three-letter IATA arrival airport code'),
  departure_local: z.string().describe('Local departure date and time exactly as printed, formatted "YYYY-MM-DDTHH:mm"'),
  arrival_local: z.string().nullable().describe('Local arrival date and time "YYYY-MM-DDTHH:mm", or null if not shown'),
});

export const ExtractedBookingSchema = z.object({
  kind: z.enum(['flight', 'hotel', 'rental', 'car', 'rail', 'activity']),
  provider: z.string().describe('Airline, hotel, or company providing the service'),
  confirmation_code: z.string().nullable().describe('Booking reference or record locator; null if not shown'),
  booked_via: z.string().nullable().describe('Travel agency or booking site name if booked through one (e.g. "Expedia"); null if booked directly'),
  passenger_names: z.array(z.string()).describe('Traveler names exactly as printed'),
  segments: z.array(ExtractedSegmentSchema).describe('Flight legs; empty for non-flight bookings'),
  confidence: z
    .object({
      confirmation_code: z.number().min(0).max(1),
      passengers: z.number().min(0).max(1),
      segments: z.number().min(0).max(1),
    })
    .describe('How certain you are of each group of fields, 0 to 1. Use below 0.9 when anything was inferred rather than printed.'),
});

export const ExtractionSchema = z.object({ bookings: z.array(ExtractedBookingSchema) });

export interface ExtractionInput {
  text: string | null;
  html: string | null;
  images: { data: Uint8Array; mediaType: string }[];
  pdfs: { data: Uint8Array; mediaType: string }[];
}

const INSTRUCTIONS = `You extract travel bookings from a forwarded confirmation email, its attachments, or a screenshot.
Only extract what is explicitly printed. Never guess a flight number, airport, date, time, or name.
Write local times exactly as printed, as YYYY-MM-DDTHH:mm. Use IATA codes.
If something is unclear, still extract it but lower that group's confidence below 0.9.
If the content is not a booking confirmation, return {"bookings": []}.`;

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

export async function extractBookings(input: ExtractionInput, opts: { model?: LanguageModel } = {}): Promise<NormalizedBooking[]> {
  const body = (input.text ?? (input.html ? htmlToText(input.html) : '')).slice(0, 60_000);
  const content: UserContent = [
    { type: 'text', text: body ? `Email content:\n${body}` : 'Extract the booking from the attached image or document.' },
    ...input.images.map((image) => ({ type: 'image' as const, image: image.data, mediaType: image.mediaType })),
    ...input.pdfs.map((pdf) => ({ type: 'file' as const, data: pdf.data, mediaType: pdf.mediaType })),
  ];
  const { output } = await generateText({
    model: opts.model ?? (await defaultModel('extraction')),
    output: Output.object({ schema: ExtractionSchema, name: 'bookings' }),
    instructions: INSTRUCTIONS,
    messages: [{ role: 'user', content }],
    providerOptions: NO_TRAINING,
  });
  return output.bookings.map(normalizeBooking);
}
```

`apps/web/lib/intake/passengers.ts`:
```ts
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'mstr', 'dr', 'prof', 'mx']);

export function splitName(name: string): { first: string; last: string } {
  const cleaned = name.toLowerCase().replace(/[^a-z/ '-]/g, ' ').trim();
  if (cleaned.includes('/')) {
    const [last, rest] = cleaned.split('/', 2);
    const firstWords = rest.split(/\s+/).filter((word) => word && !TITLES.has(word));
    return { first: firstWords[0] ?? '', last: last.trim().split(/\s+/).pop() ?? '' };
  }
  const words = cleaned.split(/\s+/).filter((word) => word && !TITLES.has(word));
  return { first: words[0] ?? '', last: words.length > 1 ? words[words.length - 1] : '' };
}

/**
 * Members join with informal names ("Sam"); tickets carry legal names ("JONES/SAMANTHA MS").
 * A match needs one unambiguous member: an exact first-plus-last match, or a first-name prefix of 3+ letters.
 */
export function matchPassengers(
  passengers: string[],
  members: { id: string; display_name: string }[],
): { matched: Record<string, string>; unmatched: string[] } {
  const matched: Record<string, string> = {};
  const unmatched: string[] = [];
  for (const passenger of passengers) {
    const p = splitName(passenger);
    const candidates = members.filter((member) => {
      const m = splitName(member.display_name);
      if (m.last && p.last) return m.last === p.last && (p.first.startsWith(m.first) || m.first.startsWith(p.first));
      return m.first.length >= 3 && (p.first === m.first || p.first.startsWith(m.first));
    });
    if (candidates.length === 1) matched[passenger] = candidates[0].id;
    else unmatched.push(passenger);
  }
  return { matched, unmatched };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd apps/web && npx vitest run test/intake; cd ../..
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web .env.example package-lock.json
git commit -F - <<'EOF'
Extract bookings with confidence, and match passengers to members

AI SDK 7 structured output on Claude Haiku through AI Gateway reads
emails, PDFs, and screenshots. Normalization validates every code and
time and zeroes confidence on anything malformed. Legal ticket names
match members' informal names only when exactly one member fits, and
everything else goes to the planner. Every model call asks AI Gateway
for providers that never train on our prompts.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 4: AeroAPI client, segment resolution, and the after-confirmation hook

**Files:**
- Create: `apps/web/lib/flights/aeroapi.ts`, `apps/web/lib/flights/fixture-aeroapi.ts`, `apps/web/lib/flights/geo.ts`, `apps/web/lib/flights/resolve.ts`, `apps/web/lib/bookings/confirm.ts`, `apps/web/test/flights/aeroapi.test.ts`, `apps/web/test/flights/resolve.test.ts`, `apps/web/test/flights/geo.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces:
  - **AeroAPI types:**
    - `AeroFlight`: `fa_flight_id`, `ident_iata`, `cancelled`, `diverted`, `scheduled_out`, `estimated_out`, `actual_out`, `scheduled_in`, `estimated_in`, `actual_in`, `arrival_delay` (seconds), `departure_delay` (seconds), and `origin`/`destination` (`{ code_iata; timezone } | null`)
    - `AeroAirport = { code_iata; country_code; latitude; longitude; timezone }`
    - `AeroScheduled = { ident_iata; origin_iata; destination_iata; scheduled_out; scheduled_in }`
  - **AeroAPI client:**
    - `interface AeroApi { schedules(start, end, airline, flightNumber); airport(iata); flights(ident, startIso, endIso); createAlert({ ident, origin, destination, date, targetUrl }): Promise<string>; deleteAlert(id) }`
    - `httpAeroApi(key, fetchImpl?)` and `aeroApi(): Promise<AeroApi>`, which honours `ELSEWHERE_AEROAPI_FIXTURE_DIR`
  - **Geography:** `haversineKm(a, b): number` and `localDateTime(utcIso, timeZone): string` (`YYYY-MM-DDTHH:mm`)
  - **Segment resolution:**
    - `resolveSegment(segment, api): Promise<Resolution>`
    - `Resolution = { kind: 'resolved'; scheduledOut; scheduledIn; originCountry; destinationCountry; distanceKm; durationMinutes } | { kind: 'not_found' }`
  - **After confirmation:** `onBookingsConfirmed(tripId, bookingIds): Promise<{ monitorSegmentIds: string[] }>`. This version resolves segments and raises "flight not found." Task 7 adds document checks, and Task 9 fills `monitorSegmentIds`.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/flights/geo.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { haversineKm, localDateTime } from '@/lib/flights/geo';

describe('geo', () => {
  it('measures great-circle distance', () => {
    // EWR (40.6925, -74.1687) to LIS (38.7813, -9.13592): about 5,450 km
    expect(Math.round(haversineKm({ latitude: 40.6925, longitude: -74.1687 }, { latitude: 38.7813, longitude: -9.13592 }) / 10) * 10).toBe(5450);
  });

  it('renders a UTC instant as local wall-clock time', () => {
    expect(localDateTime('2026-11-03T23:15:00Z', 'America/New_York')).toBe('2026-11-03T18:15');
  });
});
```

`apps/web/test/flights/aeroapi.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { httpAeroApi } from '@/lib/flights/aeroapi';

function fakeFetch(responses: Record<string, { status: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(responses).find((k) => url.includes(k));
    const r = key ? responses[key] : { status: 404 };
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: r.headers });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('httpAeroApi', () => {
  it('sends the API key and reads schedules', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/schedules/2026-11-02/2026-11-05': { status: 200, body: { scheduled: [{ ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-03T23:15:00Z', scheduled_in: '2026-11-04T06:35:00Z' }] } },
    });
    const api = httpAeroApi('k3y', fetchImpl);
    const scheduled = await api.schedules('2026-11-02', '2026-11-05', 'TP', '204');
    expect(scheduled).toHaveLength(1);
    expect(new Headers(calls[0].init?.headers).get('x-apikey')).toBe('k3y');
    expect(calls[0].url).toContain('airline=TP');
    expect(calls[0].url).toContain('flight_number=204');
  });

  it('returns null for an unknown airport', async () => {
    const { fetchImpl } = fakeFetch({});
    expect(await httpAeroApi('k', fetchImpl).airport('ZZZ')).toBeNull();
  });

  it('creates an alert and reads its id from Location', async () => {
    const { fetchImpl, calls } = fakeFetch({ '/alerts': { status: 201, headers: { location: '/alerts/987' } } });
    const id = await httpAeroApi('k', fetchImpl).createAlert({ ident: 'TP204', origin: 'EWR', destination: 'LIS', date: '2026-11-03', targetUrl: 'https://x.test/api/webhooks/aeroapi/s' });
    expect(id).toBe('987');
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toMatchObject({ ident: 'TP204', start: '2026-11-03', end: '2026-11-03', target_url: 'https://x.test/api/webhooks/aeroapi/s' });
    expect(body.events).toMatchObject({ cancelled: true, departure: true, arrival: true, diverted: true });
  });
});
```

`apps/web/test/flights/resolve.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { AeroApi } from '@/lib/flights/aeroapi';
import { resolveSegment } from '@/lib/flights/resolve';

const airports = {
  EWR: { code_iata: 'EWR', country_code: 'US', latitude: 40.6925, longitude: -74.1687, timezone: 'America/New_York' },
  LIS: { code_iata: 'LIS', country_code: 'PT', latitude: 38.7813, longitude: -9.13592, timezone: 'Europe/Lisbon' },
};

function api(scheduled: Awaited<ReturnType<AeroApi['schedules']>>): AeroApi {
  return {
    schedules: async () => scheduled,
    airport: async (iata) => airports[iata as keyof typeof airports] ?? null,
    flights: async () => [],
    createAlert: async () => 'a1',
    deleteAlert: async () => undefined,
  };
}

const segment = { id: 's1', carrierIata: 'TP', flightNumber: '204', originIata: 'EWR', destinationIata: 'LIS', departureLocal: '2026-11-03T18:15' };

describe('resolveSegment', () => {
  it('picks the scheduled flight whose local departure matches the confirmation', async () => {
    const result = await resolveSegment(
      segment,
      api([
        { ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-02T23:15:00Z', scheduled_in: '2026-11-03T06:35:00Z' },
        { ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-03T23:15:00Z', scheduled_in: '2026-11-04T06:35:00Z' },
      ]),
    );
    expect(result).toEqual({
      kind: 'resolved',
      scheduledOut: '2026-11-03T23:15:00Z',
      scheduledIn: '2026-11-04T06:35:00Z',
      originCountry: 'US',
      destinationCountry: 'PT',
      distanceKm: 5450,
      durationMinutes: 440,
    });
  });

  it('reports a flight that is not in the schedule', async () => {
    expect(await resolveSegment(segment, api([]))).toEqual({ kind: 'not_found' });
  });
});
```
`distanceKm` is rounded to the nearest 10 km in `resolveSegment`, so it does not jitter between airport data updates.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/flights; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 3: Implement**

`apps/web/lib/flights/geo.ts`:
```ts
export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function localDateTime(utcIso: string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(utcIso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
```

`apps/web/lib/flights/aeroapi.ts`:
```ts
import { assertTestSeamAllowed, requireEnv } from '@/lib/env';

const BASE = 'https://aeroapi.flightaware.com/aeroapi';

export interface AeroFlight {
  fa_flight_id: string;
  ident_iata: string | null;
  cancelled: boolean;
  diverted: boolean;
  scheduled_out: string | null;
  estimated_out: string | null;
  actual_out: string | null;
  scheduled_in: string | null;
  estimated_in: string | null;
  actual_in: string | null;
  departure_delay: number | null;
  arrival_delay: number | null;
  origin: { code_iata: string | null; timezone: string | null } | null;
  destination: { code_iata: string | null; timezone: string | null } | null;
}

export interface AeroAirport {
  code_iata: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

export interface AeroScheduled {
  ident_iata: string | null;
  origin_iata: string | null;
  destination_iata: string | null;
  scheduled_out: string;
  scheduled_in: string;
}

export interface AeroApi {
  schedules(dateStart: string, dateEnd: string, airline: string, flightNumber: string): Promise<AeroScheduled[]>;
  airport(iata: string): Promise<AeroAirport | null>;
  flights(ident: string, startIso: string, endIso: string): Promise<AeroFlight[]>;
  createAlert(input: { ident: string; origin: string; destination: string; date: string; targetUrl: string }): Promise<string>;
  deleteAlert(id: string): Promise<void>;
}

export function httpAeroApi(key: string, fetchImpl: typeof fetch = fetch): AeroApi {
  const headers = { 'x-apikey': key, accept: 'application/json' };
  async function get<T>(path: string, query: Record<string, string> = {}): Promise<T | null> {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const response = await fetchImpl(url.toString(), { headers });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`AeroAPI ${path} failed with ${response.status}`);
    return (await response.json()) as T;
  }
  return {
    async schedules(dateStart, dateEnd, airline, flightNumber) {
      const body = await get<{ scheduled: AeroScheduled[] }>(`/schedules/${dateStart}/${dateEnd}`, { airline, flight_number: flightNumber });
      return body?.scheduled ?? [];
    },
    async airport(iata) {
      return get<AeroAirport>(`/airports/${encodeURIComponent(iata)}`);
    },
    async flights(ident, startIso, endIso) {
      const body = await get<{ flights: AeroFlight[] }>(`/flights/${encodeURIComponent(ident)}`, { ident_type: 'designator', start: startIso, end: endIso });
      return body?.flights ?? [];
    },
    async createAlert({ ident, origin, destination, date, targetUrl }) {
      const response = await fetchImpl(`${BASE}/alerts`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
          ident,
          origin,
          destination,
          start: date,
          end: date,
          events: { arrival: true, cancelled: true, departure: true, diverted: true, filed: true, out: true, in: true },
          target_url: targetUrl,
        }),
      });
      const location = response.headers.get('location');
      if (response.status !== 201 || !location) throw new Error(`AeroAPI alert creation failed with ${response.status}`);
      return location.split('/').pop()!;
    },
    async deleteAlert(id) {
      await fetchImpl(`${BASE}/alerts/${encodeURIComponent(id)}`, { method: 'DELETE', headers });
    },
  };
}

/** Async so the fixture module loads lazily; production never reads flight data from disk. */
export async function aeroApi(): Promise<AeroApi> {
  const fixtureDir = process.env.ELSEWHERE_AEROAPI_FIXTURE_DIR;
  if (fixtureDir) {
    assertTestSeamAllowed('ELSEWHERE_AEROAPI_FIXTURE_DIR');
    const { fixtureAeroApi } = await import('./fixture-aeroapi');
    return fixtureAeroApi(fixtureDir);
  }
  return httpAeroApi(requireEnv('AEROAPI_KEY'));
}
```

`apps/web/lib/flights/fixture-aeroapi.ts`:
```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { AeroAirport, AeroApi, AeroFlight, AeroScheduled } from './aeroapi';

/** Reads <dir>/schedules/<CC><NNN>.json, <dir>/airports/<IATA>.json, and <dir>/flights/<IDENT>.json. E2E rewrites flights between polls. */
export function fixtureAeroApi(dir: string): AeroApi {
  const read = <T>(file: string, fallback: T): T => {
    const full = path.join(dir, file);
    return existsSync(full) ? (JSON.parse(readFileSync(full, 'utf8')) as T) : fallback;
  };
  return {
    async schedules(_start, _end, airline, flightNumber) {
      return read<AeroScheduled[]>(`schedules/${airline}${flightNumber}.json`, []);
    },
    async airport(iata) {
      return read<AeroAirport | null>(`airports/${iata}.json`, null);
    },
    async flights(ident) {
      return read<AeroFlight[]>(`flights/${ident}.json`, []);
    },
    async createAlert({ ident }) {
      return `fixture-${ident}`;
    },
    async deleteAlert() {
      return undefined;
    },
  };
}
```

`apps/web/lib/flights/resolve.ts`:
```ts
import type { AeroApi } from './aeroapi';
import { haversineKm, localDateTime } from './geo';

export interface SegmentToResolve {
  id: string;
  carrierIata: string;
  flightNumber: string;
  originIata: string;
  destinationIata: string;
  departureLocal: string;
}

export type Resolution =
  | {
      kind: 'resolved';
      scheduledOut: string;
      scheduledIn: string;
      originCountry: string | null;
      destinationCountry: string | null;
      distanceKm: number | null;
      durationMinutes: number;
    }
  | { kind: 'not_found' };

const MATCH_WINDOW_MINUTES = 90;

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function minutesBetweenLocal(a: string, b: string): number {
  return Math.abs(new Date(`${a}:00Z`).getTime() - new Date(`${b}:00Z`).getTime()) / 60000;
}

/** Turns "TP 204, Nov 3 18:15 local" into scheduled UTC times, countries, distance, and duration. */
export async function resolveSegment(segment: SegmentToResolve, api: AeroApi): Promise<Resolution> {
  const date = segment.departureLocal.slice(0, 10);
  const [scheduled, origin, destination] = await Promise.all([
    api.schedules(shiftDate(date, -1), shiftDate(date, 2), segment.carrierIata, segment.flightNumber),
    api.airport(segment.originIata),
    api.airport(segment.destinationIata),
  ]);
  const timeZone = origin?.timezone ?? 'UTC';
  const match = scheduled
    .filter((s) => s.origin_iata === segment.originIata && s.destination_iata === segment.destinationIata)
    .map((s) => ({ s, gap: minutesBetweenLocal(localDateTime(s.scheduled_out, timeZone), segment.departureLocal) }))
    .filter(({ gap }) => gap <= MATCH_WINDOW_MINUTES)
    .sort((a, b) => a.gap - b.gap)[0]?.s;
  if (!match) return { kind: 'not_found' };

  const distance =
    origin?.latitude != null && origin.longitude != null && destination?.latitude != null && destination.longitude != null
      ? Math.round(haversineKm({ latitude: origin.latitude, longitude: origin.longitude }, { latitude: destination.latitude, longitude: destination.longitude }) / 10) * 10
      : null;
  return {
    kind: 'resolved',
    scheduledOut: match.scheduled_out,
    scheduledIn: match.scheduled_in,
    originCountry: origin?.country_code ?? null,
    destinationCountry: destination?.country_code ?? null,
    distanceKm: distance,
    durationMinutes: Math.round((new Date(match.scheduled_in).getTime() - new Date(match.scheduled_out).getTime()) / 60000),
  };
}
```

`apps/web/lib/bookings/confirm.ts`:
```ts
import 'server-only';
import { aeroApi } from '@/lib/flights/aeroapi';
import { resolveSegment } from '@/lib/flights/resolve';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Runs whenever bookings become confirmed: by the planner, by high-confidence intake, or by manual entry.
 * Returns the segment ids the caller should start monitoring (Task 9 fills this in).
 */
export async function onBookingsConfirmed(tripId: string, bookingIds: string[]): Promise<{ monitorSegmentIds: string[] }> {
  if (bookingIds.length === 0) return { monitorSegmentIds: [] };
  const admin = createAdminClient();
  const api = await aeroApi();
  const { data: segments, error } = await admin
    .from('booking_segments')
    .select('id, booking_id, carrier_iata, flight_number, origin_iata, destination_iata, departure_local, scheduled_out')
    .in('booking_id', bookingIds)
    .is('scheduled_out', null);
  if (error) throw new Error(error.message);

  const { data: planner } = await admin.from('trip_members').select('user_id').eq('trip_id', tripId).eq('role', 'planner').single();
  for (const segment of segments ?? []) {
    const resolution = await resolveSegment(
      { id: segment.id, carrierIata: segment.carrier_iata, flightNumber: segment.flight_number, originIata: segment.origin_iata, destinationIata: segment.destination_iata, departureLocal: segment.departure_local },
      api,
    );
    if (resolution.kind === 'not_found') {
      await admin.from('action_items').upsert(
        {
          trip_id: tripId,
          kind: 'booking',
          title: 'Check this flight number',
          detail: `We couldn’t find ${segment.carrier_iata} ${segment.flight_number} from ${segment.origin_iata} on ${segment.departure_local.slice(0, 10)}. Check the flight number and date.`,
          assigned_user_ids: planner ? [planner.user_id] : [],
          source_kind: 'flight_not_found',
          related_entity_id: segment.id,
        },
        { onConflict: 'trip_id,source_kind,related_entity_id,title', ignoreDuplicates: true },
      );
      continue;
    }
    await admin
      .from('booking_segments')
      .update({
        scheduled_out: resolution.scheduledOut,
        scheduled_in: resolution.scheduledIn,
        origin_country: resolution.originCountry,
        destination_country: resolution.destinationCountry,
        distance_km: resolution.distanceKm,
      })
      .eq('id', segment.id);
  }
  return { monitorSegmentIds: [] };
}
```

The segment's scheduled duration is derived when it is needed, from `scheduled_in - scheduled_out`, so it needs no column.

Append to `.env.example`:
```bash
# FlightAware AeroAPI
AEROAPI_KEY=
AEROAPI_WEBHOOK_SECRET=
# Test seam: directory of canned AeroAPI responses
ELSEWHERE_AEROAPI_FIXTURE_DIR=
```

- [ ] **Step 4: Run the tests and typecheck**

```bash
cd apps/web && npx vitest run test/flights && npm run typecheck; cd ../..
```
Expected: PASS, and typecheck is clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web .env.example
git commit -F - <<'EOF'
Resolve confirmed flights against FlightAware schedules

A confirmed "TP 204, Nov 3 18:15" becomes scheduled UTC times, origin
and destination countries, distance, and duration. AeroAPI's schedules
cover dates beyond the two-day /flights window. A flight missing from the
schedule asks the planner to check the number. Tests and e2e read canned
AeroAPI responses through a guarded fixture seam.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 5: Intake — processing forwarded messages durably

**Files:**
- Create: `apps/web/lib/intake/inbound-source.ts`, `apps/web/lib/intake/storage.ts`, `apps/web/lib/intake/process.ts`, `apps/web/lib/intake/live-deps.ts`, `apps/web/workflows/intake.ts`, `apps/web/workflows/segment-monitor.ts` (stub, filled in by Task 9; see Step 4), `apps/web/test/intake/process.test.ts`
- Modify: `apps/web/next.config.ts` (`withWorkflow`), `apps/web/package.json` (dependency `workflow`)

**Interfaces:**
- Consumes:
  - Task 3: `extractBookings`, `CONFIDENCE_THRESHOLD`, `matchPassengers`
  - Task 4: `onBookingsConfirmed`
  - C1: `recordEvent`, `createAdminClient`
- Produces:
  - **Inbound email:**
    - `InboundEmail = { id; from; subject; text: string | null; html: string | null; attachments: { filename: string | null; contentType: string; data: Uint8Array }[] }`
    - `fetchInboundEmail(emailId): Promise<InboundEmail>`, which honours `ELSEWHERE_INBOUND_FIXTURE_DIR`
  - **Storage:** `INBOUND_BUCKET = 'inbound'`, `putInbound(path, data, contentType)`, `getInbound(path)`, and `removeInbound(paths)`
  - **Processing:**
    - `IntakeDeps`
    - `processInboundMessage(messageId, deps): Promise<IntakeResult>`
    - `IntakeResult = { status: 'missing' } | { status: 'failed'; reason } | { status: 'parsed' | 'needs_confirmation'; bookingIds: string[]; monitorSegmentIds: string[] }`
    - `liveIntakeDeps(): IntakeDeps`
  - **Workflow:** `intakeWorkflow(messageId)`

- [ ] **Step 1: Install the Workflow SDK and wire it into Next**

```bash
npm install workflow@5.0.1 -w @elsewhere/web
```
In `apps/web/next.config.ts`, add `import { withWorkflow } from 'workflow/next';` and change the last line to `export default withWorkflow(nextConfig);`.

- [ ] **Step 2: Write the failing test**

`apps/web/test/intake/process.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { NormalizedBooking } from '@/lib/intake/normalize';
import { processInboundMessage, type IntakeDeps } from '@/lib/intake/process';

const booking = (overrides: Partial<NormalizedBooking> = {}): NormalizedBooking => ({
  kind: 'flight',
  provider: 'TAP Air Portugal',
  confirmationCode: 'ABC123',
  bookedVia: null,
  passengerNames: ['DOE/PAT MR', 'JONES/SAMANTHA MS'],
  segments: [{ carrierIata: 'TP', flightNumber: '204', originIata: 'EWR', destinationIata: 'LIS', departureLocal: '2026-11-03T18:15', arrivalLocal: null }],
  confidence: 0.97,
  dedupeKey: 'ABC123|TP204@2026-11-03',
  problems: [],
  ...overrides,
});

function harness(opts: { source?: 'email' | 'screenshot'; bookings?: NormalizedBooking[]; existing?: string[] } = {}) {
  const log = {
    saved: [] as { dedupeKey: string; confirmed: boolean }[],
    assigned: [] as { bookingId: string; memberIds: string[] }[],
    items: [] as { source_kind: string; title: string }[],
    status: [] as string[],
    forwarded: 0,
    confirmed: [] as string[][],
    extracted: [] as unknown[],
  };
  const deps: IntakeDeps = {
    loadMessage: async () => ({ id: 'msg-1', tripId: 'trip-1', source: opts.source ?? 'email', providerMessageId: 'em_1', storagePath: opts.source === 'screenshot' ? 'trip-1/screenshots/a.png' : null, subject: 'Your TAP booking' }),
    loadEmail: async () => ({ id: 'em_1', from: 'pat@example.test', subject: 'Your TAP booking', text: 'itinerary', html: null, attachments: [] }),
    storeEmail: async () => 'trip-1/msg-1/email.json',
    loadScreenshot: async () => ({ data: new Uint8Array([1, 2, 3]), mediaType: 'image/png' }),
    extract: async (input) => {
      log.extracted.push(input);
      return opts.bookings ?? [booking()];
    },
    members: async () => [
      { id: 'm-pat', user_id: 'u-pat', display_name: 'Pat', role: 'planner' },
      { id: 'm-sam', user_id: 'u-sam', display_name: 'Sam Jones', role: 'member' },
    ],
    saveBooking: async (_message, b, { confirmed }) => {
      log.saved.push({ dedupeKey: b.dedupeKey, confirmed });
      return { bookingId: `bk-${b.dedupeKey}`, created: !(opts.existing ?? []).includes(b.dedupeKey) };
    },
    assignMembers: async (_tripId, bookingId, memberIds) => {
      log.assigned.push({ bookingId, memberIds });
    },
    addActionItem: async (item) => {
      log.items.push({ source_kind: item.source_kind, title: item.title });
    },
    setStatus: async (_id, status) => {
      log.status.push(status);
    },
    recordForwarded: async () => {
      log.forwarded += 1;
    },
    afterConfirmed: async (_tripId, bookingIds) => {
      log.confirmed.push(bookingIds);
      return { monitorSegmentIds: ['seg-1'] };
    },
  };
  return { deps, log };
}

describe('processInboundMessage', () => {
  it('auto-confirms a clear booking whose passengers all match', async () => {
    const { deps, log } = harness();
    const result = await processInboundMessage('msg-1', deps);
    expect(result).toEqual({ status: 'parsed', bookingIds: ['bk-ABC123|TP204@2026-11-03'], monitorSegmentIds: ['seg-1'] });
    expect(log.saved).toEqual([{ dedupeKey: 'ABC123|TP204@2026-11-03', confirmed: true }]);
    expect(log.assigned).toEqual([{ bookingId: 'bk-ABC123|TP204@2026-11-03', memberIds: ['m-pat', 'm-sam'] }]);
    expect(log.confirmed).toEqual([['bk-ABC123|TP204@2026-11-03']]);
    expect(log.forwarded).toBe(1);
  });

  it('asks the planner to confirm a low-confidence booking', async () => {
    const { deps, log } = harness({ bookings: [booking({ confidence: 0.6 })] });
    const result = await processInboundMessage('msg-1', deps);
    expect(result.status).toBe('needs_confirmation');
    expect(log.saved[0].confirmed).toBe(false);
    expect(log.items).toContainEqual({ source_kind: 'booking_confirmation', title: 'Confirm this booking' });
    expect(log.confirmed).toEqual([]);
  });

  it('asks who an unmatched passenger is', async () => {
    const { deps, log } = harness({ bookings: [booking({ passengerNames: ['DOE/PAT MR', 'SMITH/TERRY'] })] });
    await processInboundMessage('msg-1', deps);
    expect(log.items).toContainEqual({ source_kind: 'passenger_match', title: 'Who is on this booking?' });
    expect(log.saved[0].confirmed).toBe(false);
  });

  it('fails clearly when nothing was found', async () => {
    const { deps, log } = harness({ bookings: [] });
    expect(await processInboundMessage('msg-1', deps)).toEqual({ status: 'failed', reason: 'no booking found' });
    expect(log.status).toEqual(['failed']);
    expect(log.items[0].title).toBe('We couldn’t read a booking');
  });

  it('does not reprocess a booking it already has', async () => {
    const { deps, log } = harness({ existing: ['ABC123|TP204@2026-11-03'] });
    await processInboundMessage('msg-1', deps);
    expect(log.assigned).toEqual([]);
    expect(log.forwarded).toBe(0);
  });

  it('reads screenshots as images', async () => {
    const { deps, log } = harness({ source: 'screenshot' });
    await processInboundMessage('msg-1', deps);
    expect(log.extracted[0]).toMatchObject({ text: null, images: [{ mediaType: 'image/png' }] });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd apps/web && npx vitest run test/intake/process.test.ts; cd ../..
```
Expected: FAIL, with module not found.

- [ ] **Step 4: Implement**

`apps/web/lib/intake/inbound-source.ts`:
```ts
import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Resend } from 'resend';
import { assertTestSeamAllowed, requireEnv } from '@/lib/env';

export interface InboundEmail {
  id: string;
  from: string;
  subject: string;
  text: string | null;
  html: string | null;
  attachments: { filename: string | null; contentType: string; data: Uint8Array }[];
}

const USEFUL_ATTACHMENTS = /^(application\/pdf|image\/(png|jpeg|webp|gif))$/;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Resend's webhook carries metadata only; the body and attachments come from its API. */
export async function fetchInboundEmail(emailId: string): Promise<InboundEmail> {
  const fixtureDir = process.env.ELSEWHERE_INBOUND_FIXTURE_DIR;
  if (fixtureDir) {
    assertTestSeamAllowed('ELSEWHERE_INBOUND_FIXTURE_DIR');
    const fixture = JSON.parse(readFileSync(path.join(fixtureDir, `${emailId}.json`), 'utf8')) as Omit<InboundEmail, 'attachments'> & {
      attachments?: { filename: string | null; contentType: string; base64: string }[];
    };
    return {
      ...fixture,
      attachments: (fixture.attachments ?? []).map((a) => ({ filename: a.filename, contentType: a.contentType, data: Buffer.from(a.base64, 'base64') })),
    };
  }

  const resend = new Resend(requireEnv('RESEND_API_KEY'));
  const { data, error } = await resend.emails.receiving.get(emailId);
  if (error || !data) throw new Error(`could not fetch inbound email ${emailId}: ${error?.message ?? 'empty'}`);
  const attachments: InboundEmail['attachments'] = [];
  for (const meta of data.attachments) {
    if (!USEFUL_ATTACHMENTS.test(meta.content_type) || meta.size > MAX_ATTACHMENT_BYTES) continue;
    const { data: attachment } = await resend.emails.receiving.attachments.get({ emailId, id: meta.id });
    if (!attachment) continue;
    const response = await fetch(attachment.download_url);
    if (response.ok) attachments.push({ filename: meta.filename, contentType: meta.content_type, data: new Uint8Array(await response.arrayBuffer()) });
  }
  return { id: data.id, from: data.from, subject: data.subject, text: data.text, html: data.html, attachments };
}
```

`apps/web/lib/intake/storage.ts`:
```ts
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/** Private bucket for raw forwarded mail and screenshots; retention deletes objects after 30 days. */
export const INBOUND_BUCKET = 'inbound';

export async function putInbound(objectPath: string, data: Uint8Array | string, contentType: string): Promise<string> {
  const { error } = await createAdminClient().storage.from(INBOUND_BUCKET).upload(objectPath, data, { contentType, upsert: true });
  if (error) throw new Error(`inbound upload failed: ${error.message}`);
  return objectPath;
}

export async function getInbound(objectPath: string): Promise<Uint8Array> {
  const { data, error } = await createAdminClient().storage.from(INBOUND_BUCKET).download(objectPath);
  if (error || !data) throw new Error(`inbound download failed: ${error?.message ?? 'empty'}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeInbound(objectPaths: string[]): Promise<void> {
  if (objectPaths.length === 0) return;
  const { error } = await createAdminClient().storage.from(INBOUND_BUCKET).remove(objectPaths);
  if (error) throw new Error(`inbound delete failed: ${error.message}`);
}
```

`apps/web/lib/intake/process.ts`:
```ts
import type { ExtractionInput } from './extract';
import type { InboundEmail } from './inbound-source';
import { CONFIDENCE_THRESHOLD, type NormalizedBooking } from './normalize';
import { matchPassengers } from './passengers';

export interface IntakeMessage {
  id: string;
  tripId: string;
  source: 'email' | 'screenshot';
  providerMessageId: string | null;
  storagePath: string | null;
  subject: string | null;
}

export interface NewActionItem {
  trip_id: string;
  kind: 'booking' | 'approval';
  title: string;
  detail: string;
  assigned_user_ids: string[];
  source_kind: 'booking_confirmation' | 'passenger_match';
  related_entity_id: string;
}

export interface IntakeDeps {
  loadMessage(id: string): Promise<IntakeMessage | null>;
  loadEmail(providerMessageId: string): Promise<InboundEmail>;
  storeEmail(message: IntakeMessage, email: InboundEmail): Promise<string>;
  loadScreenshot(storagePath: string): Promise<{ data: Uint8Array; mediaType: string }>;
  extract(input: ExtractionInput): Promise<NormalizedBooking[]>;
  members(tripId: string): Promise<{ id: string; user_id: string; display_name: string; role: 'planner' | 'member' }[]>;
  saveBooking(message: IntakeMessage, booking: NormalizedBooking, opts: { confirmed: boolean }): Promise<{ bookingId: string; created: boolean }>;
  assignMembers(tripId: string, bookingId: string, memberIds: string[]): Promise<void>;
  addActionItem(item: NewActionItem): Promise<void>;
  setStatus(messageId: string, status: 'parsed' | 'needs_confirmation' | 'failed', error: string | null, storagePath: string | null): Promise<void>;
  recordForwarded(tripId: string): Promise<void>;
  afterConfirmed(tripId: string, bookingIds: string[]): Promise<{ monitorSegmentIds: string[] }>;
}

export type IntakeResult =
  | { status: 'missing' }
  | { status: 'failed'; reason: string }
  | { status: 'parsed' | 'needs_confirmation'; bookingIds: string[]; monitorSegmentIds: string[] };

export async function processInboundMessage(messageId: string, deps: IntakeDeps): Promise<IntakeResult> {
  const message = await deps.loadMessage(messageId);
  if (!message) return { status: 'missing' };
  const members = await deps.members(message.tripId);
  const planner = members.find((member) => member.role === 'planner');
  const plannerIds = planner ? [planner.user_id] : [];

  let input: ExtractionInput;
  let storagePath = message.storagePath;
  if (message.source === 'email') {
    if (!message.providerMessageId) {
      await deps.setStatus(message.id, 'failed', 'missing provider message id', null);
      return { status: 'failed', reason: 'missing provider message id' };
    }
    const email = await deps.loadEmail(message.providerMessageId);
    storagePath = await deps.storeEmail(message, email);
    input = {
      text: email.text,
      html: email.html,
      images: email.attachments.filter((a) => a.contentType.startsWith('image/')).map((a) => ({ data: a.data, mediaType: a.contentType })),
      pdfs: email.attachments.filter((a) => a.contentType === 'application/pdf').map((a) => ({ data: a.data, mediaType: a.contentType })),
    };
  } else {
    input = { text: null, html: null, images: [await deps.loadScreenshot(message.storagePath ?? '')], pdfs: [] };
  }

  const bookings = await deps.extract(input);
  if (bookings.length === 0) {
    await deps.setStatus(message.id, 'failed', 'No booking found', storagePath);
    await deps.addActionItem({
      trip_id: message.tripId,
      kind: 'booking',
      title: 'We couldn’t read a booking',
      detail: `We couldn’t find a booking in “${message.subject ?? 'a forwarded message'}”. You can add it by hand on the bookings page.`,
      assigned_user_ids: plannerIds,
      source_kind: 'booking_confirmation',
      related_entity_id: message.id,
    });
    return { status: 'failed', reason: 'no booking found' };
  }

  const bookingIds: string[] = [];
  const confirmedIds: string[] = [];
  let needsConfirmation = false;
  let createdAny = false;
  for (const booking of bookings) {
    const { matched, unmatched } = matchPassengers(booking.passengerNames, members);
    const unclear = booking.confidence < CONFIDENCE_THRESHOLD || booking.problems.length > 0;
    const confirmed = !unclear && unmatched.length === 0;
    const { bookingId, created } = await deps.saveBooking(message, booking, { confirmed });
    bookingIds.push(bookingId);
    if (!created) continue;
    createdAny = true;

    const memberIds = [...new Set(Object.values(matched))];
    if (memberIds.length > 0) await deps.assignMembers(message.tripId, bookingId, memberIds);
    if (confirmed) confirmedIds.push(bookingId);
    if (unclear) {
      needsConfirmation = true;
      await deps.addActionItem({
        trip_id: message.tripId,
        kind: 'booking',
        title: 'Confirm this booking',
        detail: `Check ${booking.provider}${booking.confirmationCode ? ` (${booking.confirmationCode})` : ''} before we watch it.${booking.problems.length ? ` ${booking.problems.join('; ')}.` : ''}`,
        assigned_user_ids: plannerIds,
        source_kind: 'booking_confirmation',
        related_entity_id: bookingId,
      });
    }
    if (unmatched.length > 0) {
      needsConfirmation = true;
      await deps.addActionItem({
        trip_id: message.tripId,
        kind: 'booking',
        title: 'Who is on this booking?',
        detail: `We couldn’t match ${unmatched.join(', ')} to anyone in the group. Pick who’s on ${booking.provider}.`,
        assigned_user_ids: plannerIds,
        source_kind: 'passenger_match',
        related_entity_id: bookingId,
      });
    }
  }

  const status = needsConfirmation ? 'needs_confirmation' : 'parsed';
  await deps.setStatus(message.id, status, null, storagePath);
  if (createdAny) await deps.recordForwarded(message.tripId);
  const { monitorSegmentIds } = confirmedIds.length > 0 ? await deps.afterConfirmed(message.tripId, confirmedIds) : { monitorSegmentIds: [] };
  return { status, bookingIds, monitorSegmentIds };
}
```

`apps/web/lib/intake/live-deps.ts`:
```ts
import 'server-only';
import { onBookingsConfirmed } from '@/lib/bookings/confirm';
import { recordEvent } from '@/lib/funnel/events';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractBookings } from './extract';
import { fetchInboundEmail } from './inbound-source';
import type { IntakeDeps } from './process';
import { getInbound, putInbound } from './storage';

function must<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export function liveIntakeDeps(): IntakeDeps {
  const admin = createAdminClient();
  return {
    async loadMessage(id) {
      const row = must(await admin.from('inbound_messages').select('id, trip_id, source, provider_message_id, storage_path, subject').eq('id', id).maybeSingle());
      return row
        ? { id: row.id, tripId: row.trip_id, source: row.source, providerMessageId: row.provider_message_id, storagePath: row.storage_path, subject: row.subject }
        : null;
    },
    loadEmail: fetchInboundEmail,
    async storeEmail(message, email) {
      const base = `${message.tripId}/${message.id}`;
      await putInbound(`${base}/email.json`, JSON.stringify({ from: email.from, subject: email.subject, text: email.text, html: email.html }), 'application/json');
      for (const [index, attachment] of email.attachments.entries()) {
        await putInbound(`${base}/${index}-${(attachment.filename ?? 'attachment').replace(/[^\w.-]/g, '_')}`, attachment.data, attachment.contentType);
      }
      return `${base}/email.json`;
    },
    async loadScreenshot(storagePath) {
      const mediaType = storagePath.endsWith('.png') ? 'image/png' : storagePath.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      return { data: await getInbound(storagePath), mediaType };
    },
    extract: (input) => extractBookings(input),
    async members(tripId) {
      return must(await admin.from('trip_members').select('id, user_id, display_name, role').eq('trip_id', tripId));
    },
    async saveBooking(message, booking, { confirmed }) {
      const inserted = must(
        await admin
          .from('bookings')
          .upsert(
            {
              trip_id: message.tripId,
              inbound_message_id: message.id,
              kind: booking.kind,
              provider: booking.provider,
              confirmation_code: booking.confirmationCode,
              booked_via: booking.bookedVia,
              passenger_names: booking.passengerNames,
              extraction_confidence: Math.round(booking.confidence * 100) / 100,
              dedupe_key: booking.dedupeKey,
              confirmed_at: confirmed ? new Date().toISOString() : null,
            },
            { onConflict: 'trip_id,dedupe_key', ignoreDuplicates: true },
          )
          .select('id'),
      );
      if (inserted.length === 0) {
        const existing = must(await admin.from('bookings').select('id').eq('trip_id', message.tripId).eq('dedupe_key', booking.dedupeKey).single());
        return { bookingId: existing.id, created: false };
      }
      const bookingId = inserted[0].id as string;
      if (booking.segments.length > 0) {
        must(
          await admin.from('booking_segments').insert(
            booking.segments.map((segment, index) => ({
              booking_id: bookingId,
              trip_id: message.tripId,
              position: index + 1,
              carrier_iata: segment.carrierIata,
              flight_number: segment.flightNumber,
              origin_iata: segment.originIata,
              destination_iata: segment.destinationIata,
              departure_local: segment.departureLocal,
              arrival_local: segment.arrivalLocal,
            })),
          ),
        );
      }
      return { bookingId, created: true };
    },
    async assignMembers(tripId, bookingId, memberIds) {
      must(
        await admin
          .from('booking_members')
          .upsert(memberIds.map((memberId) => ({ booking_id: bookingId, member_id: memberId, trip_id: tripId })), { ignoreDuplicates: true }),
      );
    },
    async addActionItem(item) {
      must(await admin.from('action_items').upsert(item, { onConflict: 'trip_id,source_kind,related_entity_id,title', ignoreDuplicates: true }));
    },
    async setStatus(messageId, status, error, storagePath) {
      must(await admin.from('inbound_messages').update({ status, error, storage_path: storagePath }).eq('id', messageId));
    },
    async recordForwarded(tripId) {
      const trip = must(await admin.from('trips').select('created_anonymous_id, created_utm').eq('id', tripId).single());
      if (!trip.created_anonymous_id) return;
      await recordEvent({ anonymousId: trip.created_anonymous_id, event: 'booking_forwarded', tripId, utm: trip.created_utm as Record<string, string> });
    },
    afterConfirmed: onBookingsConfirmed,
  };
}
```

`apps/web/workflows/intake.ts`:
```ts
import { start } from 'workflow/api';
import { segmentMonitorWorkflow } from './segment-monitor';

export async function intakeWorkflow(messageId: string) {
  'use workflow';
  const result = await processInboundStep(messageId);
  if ('monitorSegmentIds' in result) {
    for (const segmentId of result.monitorSegmentIds) await start(segmentMonitorWorkflow, [segmentId]);
  }
  return result;
}

async function processInboundStep(messageId: string) {
  'use step';
  const { processInboundMessage } = await import('@/lib/intake/process');
  const { liveIntakeDeps } = await import('@/lib/intake/live-deps');
  return processInboundMessage(messageId, liveIntakeDeps());
}
```

`intakeWorkflow` imports `segmentMonitorWorkflow`, which Task 9 builds. Until Task 9, `monitorSegmentIds` is always empty, because `onBookingsConfirmed` returns `[]`. To keep the import compiling now, create `apps/web/workflows/segment-monitor.ts` with the final export name. Task 9 replaces the body in place:
```ts
export async function segmentMonitorWorkflow(segmentId: string) {
  'use workflow';
  return { segmentId, status: 'not-monitored-yet' as const };
}
```
This is the only stub in C2, and Task 9 Step 5 replaces it in full. No caller reaches it before then, because `monitorSegmentIds` stays empty until Task 9.

- [ ] **Step 5: Run the tests, typecheck, and build**

```bash
cd apps/web && npx vitest run test/intake && npm run typecheck && npm run build; cd ../..
```
Expected: PASS, and the build succeeds with the workflow plugin.

- [ ] **Step 6: Commit**

```bash
git add apps/web package-lock.json
git commit -F - <<'EOF'
Process forwarded bookings in a durable intake workflow

Each forwarded email or screenshot is fetched, archived, read by the
model, and saved idempotently on a per-trip dedupe key. Clear bookings
whose passengers all match the group are confirmed automatically;
everything else becomes one specific question for the planner. The
first forwarded booking is recorded for the payment test with the trip's
original UTM tags.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 6: The inbound email webhook — verified, idempotent, and quarantining strangers

**Files:**
- Create: `apps/web/lib/intake/sender.ts`, `apps/web/app/api/webhooks/inbound-email/route.ts`, `apps/web/test/helpers/webhooks.ts`, `apps/web/test/intake/sender.test.ts`, `apps/web/test/intake/inbound-route.test.ts`
- Modify: `apps/web/package.json` (devDependency `standardwebhooks`)

**Interfaces:**
- Consumes: `inboundCodeFromAddress` (C1), `createAdminClient`, `requireEnv`, `start` from `workflow/api`, and `intakeWorkflow` (Task 5).
- Produces:
  - **Sender policy:** `parseSender(from): string | null` and `senderAllowed(sender, allowed): boolean`
  - **Test helpers:** `signStandardWebhook(payload, secret, id?)` and `TEST_WEBHOOK_SECRET`, which the e2e also uses
  - **Route:** `POST /api/webhooks/inbound-email`

Resend's `webhooks.verify()` takes `{ payload, headers: { id, timestamp, signature }, webhookSecret }`. Note that `headers` is Resend's own type, not DOM `Headers`. It verifies with `standardwebhooks`. Read the three values from the `svix-*` request headers, falling back to `webhook-*`.

- [ ] **Step 1: Add the signing library for tests**

```bash
npm install -D standardwebhooks@1.1.1 -w @elsewhere/web
```

- [ ] **Step 2: Write the failing tests**

`apps/web/test/helpers/webhooks.ts`:
```ts
import { Webhook } from 'standardwebhooks';

export const TEST_WEBHOOK_SECRET = `whsec_${Buffer.from('elsewhere-test-secret-32-bytes!!').toString('base64')}`;

/** Signs a payload the way Resend does (Standard Webhooks, sent as svix-* headers). */
export function signStandardWebhook(payload: string, secret: string, id = `msg_${crypto.randomUUID()}`): Record<string, string> {
  const timestamp = new Date();
  return {
    'svix-id': id,
    'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
    'svix-signature': new Webhook(secret).sign(id, timestamp, payload),
  };
}
```

`apps/web/test/intake/sender.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseSender, senderAllowed } from '@/lib/intake/sender';

describe('parseSender', () => {
  it('reads display-name and bare forms', () => {
    expect(parseSender('Pat Doe <Pat@Example.TEST>')).toBe('pat@example.test');
    expect(parseSender('pat@example.test')).toBe('pat@example.test');
    expect(parseSender('not an address')).toBeNull();
  });
});

describe('senderAllowed', () => {
  it('accepts only the trip’s known emails', () => {
    expect(senderAllowed('pat@example.test', ['Pat@example.test', 'sam@example.test'])).toBe(true);
    expect(senderAllowed('mallory@example.test', ['pat@example.test'])).toBe(false);
  });
});
```

`apps/web/test/intake/inbound-route.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signStandardWebhook, TEST_WEBHOOK_SECRET } from '../helpers/webhooks';

const started: unknown[] = [];
const inserted: { table: string; row: Record<string, unknown> }[] = [];

vi.mock('workflow/api', () => ({
  start: async (_workflow: unknown, args: unknown[]) => {
    started.push(args);
    return { runId: 'wrun_test' };
  },
}));
vi.mock('@/workflows/intake', () => ({ intakeWorkflow: async () => undefined }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === 'trip_members'
            ? Promise.resolve({ data: [{ user_id: 'planner-1', role: 'planner', profiles: { email: 'pat@example.test' } }], error: null })
            : { maybeSingle: async () => ({ data: table === 'trips' ? { id: 'trip-1', name: 'Lisbon 2026' } : null, error: null }) },
      }),
      insert: (row: Record<string, unknown>) => {
        inserted.push({ table, row });
        const result = { data: { id: 'msg-1' }, error: null };
        return { select: () => ({ single: async () => result }), then: (resolve: (v: unknown) => unknown) => resolve({ error: null }) };
      },
    }),
  }),
}));

beforeAll(() => {
  process.env.RESEND_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  process.env.RESEND_API_KEY = 're_test';
  process.env.INBOUND_DOMAIN = 'in.example.test';
});
beforeEach(() => {
  started.length = 0;
  inserted.length = 0;
});

function event(from: string) {
  return JSON.stringify({
    type: 'email.received',
    created_at: '2026-10-05T12:00:00Z',
    data: {
      email_id: 'em_1',
      created_at: '2026-10-05T12:00:00Z',
      from,
      to: ['trip-abcdefghjkmn@in.example.test'],
      bcc: [],
      cc: [],
      received_for: ['trip-abcdefghjkmn@in.example.test'],
      message_id: '<m@x>',
      subject: 'Your TAP booking',
      attachments: [],
    },
  });
}

async function post(payload: string, headers: Record<string, string>) {
  const { POST } = await import('@/app/api/webhooks/inbound-email/route');
  return POST(new Request('https://app.example.test/api/webhooks/inbound-email', { method: 'POST', body: payload, headers }));
}

describe('POST /api/webhooks/inbound-email', () => {
  it('rejects unsigned payloads', async () => {
    expect((await post(event('Pat <pat@example.test>'), {})).status).toBe(401);
  });

  it('starts intake for mail from a trip member', async () => {
    const payload = event('Pat <pat@example.test>');
    const res = await post(payload, signStandardWebhook(payload, TEST_WEBHOOK_SECRET));
    expect(res.status).toBe(200);
    expect(started).toEqual([['msg-1']]);
    expect(inserted.find((i) => i.table === 'inbound_messages')?.row).toMatchObject({ trip_id: 'trip-1', status: 'received', source: 'email' });
  });

  it('quarantines mail from anyone else and asks the planner', async () => {
    const payload = event('Mallory <mallory@example.test>');
    const res = await post(payload, signStandardWebhook(payload, TEST_WEBHOOK_SECRET));
    expect(res.status).toBe(200);
    expect(started).toEqual([]);
    expect(inserted.find((i) => i.table === 'inbound_messages')?.row).toMatchObject({ status: 'quarantined' });
    expect(inserted.find((i) => i.table === 'action_items')?.row).toMatchObject({ source_kind: 'inbound_quarantine', assigned_user_ids: ['planner-1'] });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/intake/sender.test.ts test/intake/inbound-route.test.ts; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 4: Implement**

`apps/web/lib/intake/sender.ts`:
```ts
const ADDRESS = /<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>|^\s*([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)\s*$/;

export function parseSender(from: string): string | null {
  const match = from.match(ADDRESS);
  const address = match?.[1] ?? match?.[2];
  return address ? address.toLowerCase() : null;
}

export function senderAllowed(sender: string, allowed: string[]): boolean {
  return allowed.some((email) => email.toLowerCase() === sender.toLowerCase());
}
```

`apps/web/app/api/webhooks/inbound-email/route.ts`:
```ts
import { Resend } from 'resend';
import { start } from 'workflow/api';
import { requireEnv } from '@/lib/env';
import { parseSender, senderAllowed } from '@/lib/intake/sender';
import { createAdminClient } from '@/lib/supabase/admin';
import { inboundCodeFromAddress } from '@/lib/trips/inbound-code';
import { intakeWorkflow } from '@/workflows/intake';

export async function POST(request: Request): Promise<Response> {
  const payload = await request.text();
  const header = (name: string) => request.headers.get(`svix-${name}`) ?? request.headers.get(`webhook-${name}`) ?? '';
  let event: ReturnType<Resend['webhooks']['verify']>;
  try {
    event = new Resend(requireEnv('RESEND_API_KEY')).webhooks.verify({
      payload,
      headers: { id: header('id'), timestamp: header('timestamp'), signature: header('signature') },
      webhookSecret: requireEnv('RESEND_WEBHOOK_SECRET'),
    });
  } catch {
    return new Response('invalid signature', { status: 401 });
  }
  if (event.type !== 'email.received') return Response.json({ ignored: event.type });

  const { data } = event;
  const inboundDomain = requireEnv('INBOUND_DOMAIN');
  const code = [...data.received_for, ...data.to].map((address) => inboundCodeFromAddress(address, inboundDomain)).find(Boolean);
  if (!code) return Response.json({ ignored: 'no trip address' });

  const admin = createAdminClient();
  const { data: trip } = await admin.from('trips').select('id, name').eq('inbound_code', code).maybeSingle();
  if (!trip) return Response.json({ ignored: 'unknown trip' });

  // Service role reads members' own emails. Only those may forward bookings in, which blocks booking injection.
  const { data: rows } = await admin.from('trip_members').select('user_id, role, profiles!inner(email)').eq('trip_id', trip.id);
  const members = (rows ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { userId: row.user_id as string, role: row.role as 'planner' | 'member', email: (profile?.email ?? null) as string | null };
  });
  const sender = parseSender(data.from);
  const permitted = sender !== null && senderAllowed(sender, members.flatMap((m) => (m.email ? [m.email] : [])));

  const { data: message, error } = await admin
    .from('inbound_messages')
    .insert({ trip_id: trip.id, source: 'email', provider_message_id: data.email_id, sender, subject: data.subject, status: permitted ? 'received' : 'quarantined' })
    .select('id')
    .single();
  if (error) {
    // provider_message_id is unique: Resend retried a delivery we already stored.
    if (error.code === '23505') return Response.json({ duplicate: data.email_id });
    return new Response('could not store message', { status: 500 });
  }

  if (!permitted) {
    const planner = members.find((member) => member.role === 'planner');
    if (planner) {
      await admin.from('action_items').insert({
        trip_id: trip.id,
        kind: 'approval',
        title: 'Approve a forwarded email',
        detail: `${sender ?? 'An unknown sender'} forwarded “${data.subject}” to the trip. Approve it only if you know them.`,
        assigned_user_ids: [planner.userId],
        source_kind: 'inbound_quarantine',
        related_entity_id: message.id,
      });
    }
    return Response.json({ quarantined: message.id });
  }

  await start(intakeWorkflow, [message.id]);
  return Response.json({ accepted: message.id });
}
```

Task 16 (`/admin`) and Task 15 (the trip feed) give the planner an "Approve" button for a quarantined message. It sets the status to `received` and calls `start(intakeWorkflow, [messageId])`.

- [ ] **Step 5: Run the tests**

```bash
cd apps/web && npx vitest run test/intake; cd ../..
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web package-lock.json
git commit -F - <<'EOF'
Accept forwarded booking emails, and quarantine strangers

The Resend webhook is signature-checked with Standard Webhooks and
idempotent on the email id. Mail to a trip's address starts intake only
when it comes from a member's own email; anything else waits for the
planner's approval, which blocks booking injection.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 7: Document checks for everyone, with official renewal routes and deadline math

**Files:**
- Create: `apps/web/lib/documents/facts.ts`, `apps/web/lib/documents/check.ts`, `apps/web/lib/documents/deadlines.ts`, `apps/web/lib/documents/service.ts`, `apps/web/app/trips/[id]/documents/page.tsx`, `apps/web/app/trips/[id]/documents/actions.ts`, `apps/web/app/trips/[id]/documents/documents-form.tsx`, `apps/web/test/documents/facts.test.ts`, `apps/web/test/documents/check.test.ts`, `apps/web/test/documents/deadlines.test.ts`
- Modify: `apps/web/lib/bookings/confirm.ts`, `apps/web/app/join/[token]/actions.ts`

**Interfaces:**
- Consumes:
  - `matchRules`, `Rule`, and `Situation` from `@elsewhere/rules`
  - `getLibrary()`
  - `queueNotifications` and `documentNotice` (Task 2)
  - `Character`
  - C1's `travel_admin_partner_routes`
- Produces:
  - **Facts:**
    - `monthsBetween(fromIso, toIso): number`
    - `documentSituation(input): Situation`
  - **Checks:**
    - `checkMember(rules, situation): MemberCheck[]`, where `MemberCheck = { result: 'ok' | 'action_needed' | 'unknown'; rule: Rule | null; detail: string }`
    - `requiredMonths(rule): number | null`
  - **Deadlines:**
    - `renewalAdvice(departureDate, route, today): RenewalAdvice`
    - `passportSentence({ expiresOn, tripEnd, requiredMonths, countryName, advice }): string`
  - **Service:** `runDocumentChecks(tripId): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`apps/web/test/documents/facts.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { documentSituation, monthsBetween } from '@/lib/documents/facts';

describe('monthsBetween', () => {
  it('counts whole months toward zero, negative when already expired', () => {
    expect(monthsBetween('2026-11-10', '2027-01-15')).toBe(2);
    expect(monthsBetween('2026-11-10', '2027-02-10')).toBe(3);
    expect(monthsBetween('2026-11-10', '2027-02-09')).toBe(2);
    expect(monthsBetween('2026-11-10', '2026-10-01')).toBe(-1);
  });
});

describe('documentSituation', () => {
  it('maps a member’s documents to rule facts and leaves unknowns out', () => {
    expect(
      documentSituation({ destinationCountry: 'PT', tripEnd: '2026-11-10', passport: { issuingCountry: 'US', expiresOn: '2027-01-15' }, realIdCompliant: null, domesticFlight: false }),
    ).toEqual({
      'trip.destination_country': 'PT',
      'passenger.nationality': 'US',
      'passenger.passport_months_valid_after_return': 2,
      'flight.is_domestic_us': false,
    });
  });
});
```

`apps/web/test/documents/check.test.ts`:
```ts
import type { Rule, RulesLibrary } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { checkMember, requiredMonths } from '@/lib/documents/check';

const rules = (fixture as unknown as RulesLibrary).rules as Rule[];

describe('checkMember', () => {
  it('flags a passport that runs out too soon after the trip, without dates in the detail', () => {
    const checks = checkMember(rules, { 'trip.destination_country': 'PT', 'passenger.passport_months_valid_after_return': 2, 'flight.is_domestic_us': false });
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ result: 'action_needed', rule: { id: 'fixture-passport-validity-pt' } });
    expect(checks[0].detail).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('reports unknown when the member has not entered their passport', () => {
    const checks = checkMember(rules, { 'trip.destination_country': 'PT', 'flight.is_domestic_us': false });
    expect(checks.map((c) => c.result)).toEqual(['unknown']);
  });

  it('reports all clear when nothing applies', () => {
    expect(checkMember(rules, { 'trip.destination_country': 'PT', 'passenger.passport_months_valid_after_return': 9, 'flight.is_domestic_us': false })).toEqual([
      { result: 'ok', rule: null, detail: 'No document issues found for this trip.' },
    ]);
  });

  it('reads the required months from the rule', () => {
    expect(requiredMonths(rules.find((r) => r.id === 'fixture-passport-validity-pt')!)).toBe(3);
  });
});
```

`apps/web/test/documents/deadlines.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { passportSentence, renewalAdvice } from '@/lib/documents/deadlines';

const route = {
  official_label: 'Renew online with the U.S. State Department',
  official_url: 'https://travel.state.gov/content/travel/en/passports/have-passport/renew-online.html',
  official_note: null,
  routine_processing_days: 56,
  expedited_processing_days: 21,
  affiliate_label: null,
  affiliate_url: null,
  affiliate_disclosure: null,
};

describe('renewalAdvice', () => {
  it('routine when there is time, expedited when it is tight, urgent when neither fits', () => {
    expect(renewalAdvice('2026-11-03', route, new Date('2026-08-01T12:00:00Z'))).toEqual({ kind: 'routine', renewBy: '2026-09-08' });
    expect(renewalAdvice('2026-11-03', route, new Date('2026-09-20T12:00:00Z'))).toEqual({ kind: 'expedited', renewBy: '2026-10-13' });
    expect(renewalAdvice('2026-11-03', route, new Date('2026-10-25T12:00:00Z'))).toEqual({ kind: 'urgent' });
  });
});

describe('passportSentence', () => {
  it('says what is wrong and what to do by when', () => {
    expect(
      passportSentence({ expiresOn: '2027-01-15', tripEnd: '2026-11-10', requiredMonths: 3, countryName: 'Portugal', advice: { kind: 'routine', renewBy: '2026-09-08' } }),
    ).toBe('Your passport expires 2 months after the trip; Portugal needs 3. Renew online by Sep 8, 2026 to make routine processing.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/documents; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 3: Implement the pure modules**

`apps/web/lib/documents/facts.ts`:
```ts
import type { Situation } from '@elsewhere/rules/core';

export function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`);
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (months > 0 && to.getUTCDate() < from.getUTCDate()) months -= 1;
  if (months < 0 && to.getUTCDate() > from.getUTCDate()) months += 1;
  return months;
}

export interface DocumentInput {
  destinationCountry: string | null;
  tripEnd: string | null;
  passport: { issuingCountry: string | null; expiresOn: string | null } | null;
  realIdCompliant: boolean | null;
  domesticFlight: boolean | null;
}

/** Leaves a fact out when we don't know it, so matching reports "may apply" instead of guessing. */
export function documentSituation(input: DocumentInput): Situation {
  const situation: Situation = {};
  if (input.destinationCountry) situation['trip.destination_country'] = input.destinationCountry;
  if (input.passport?.issuingCountry) situation['passenger.nationality'] = input.passport.issuingCountry;
  if (input.passport?.expiresOn && input.tripEnd) {
    situation['passenger.passport_months_valid_after_return'] = monthsBetween(input.tripEnd, input.passport.expiresOn);
  }
  if (input.realIdCompliant !== null) situation['passenger.has_real_id'] = input.realIdCompliant;
  if (input.domesticFlight !== null) situation['flight.is_domestic_us'] = input.domesticFlight;
  return situation;
}
```

`apps/web/lib/documents/check.ts`:
```ts
import { matchRules, type Rule, type Situation } from '@elsewhere/rules/core';

export interface MemberCheck {
  result: 'ok' | 'action_needed' | 'unknown';
  rule: Rule | null;
  detail: string;
}

/**
 * Document rules encode the failing condition, so "applies" means action is needed.
 * Details never carry dates; the planner sees them for every member.
 */
export function checkMember(rules: Rule[], situation: Situation): MemberCheck[] {
  const documentRules = rules.filter((rule) => rule.domain === 'documents');
  const byId = new Map(documentRules.map((rule) => [rule.id, rule]));
  const results = matchRules(documentRules, situation, { statuses: ['verified'] });
  const checks: MemberCheck[] = results.map((result) => {
    const rule = byId.get(result.rule_id)!;
    return result.outcome === 'applies'
      ? { result: 'action_needed', rule, detail: rule.title }
      : { result: 'unknown', rule, detail: `Hasn’t confirmed the details for: ${rule.title}` };
  });
  return checks.length > 0 ? checks : [{ result: 'ok', rule: null, detail: 'No document issues found for this trip.' }];
}

export function requiredMonths(rule: Rule): number | null {
  const value = rule.entitlement.amount?.min_months_valid_after_return;
  return typeof value === 'number' ? value : null;
}
```

`apps/web/lib/documents/deadlines.ts`:
```ts
import { formatIsoDate } from '@/lib/rules/present';
import { monthsBetween } from './facts';

export interface RenewalRoute {
  official_label: string;
  official_url: string;
  official_note: string | null;
  routine_processing_days: number | null;
  expedited_processing_days: number | null;
  affiliate_label: string | null;
  affiliate_url: string | null;
  affiliate_disclosure: string | null;
}

export type RenewalAdvice = { kind: 'routine'; renewBy: string } | { kind: 'expedited'; renewBy: string } | { kind: 'urgent' };

function minusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function renewalAdvice(departureDate: string, route: RenewalRoute, today: Date): RenewalAdvice {
  const now = today.toISOString().slice(0, 10);
  if (route.routine_processing_days) {
    const routineBy = minusDays(departureDate, route.routine_processing_days);
    if (now <= routineBy) return { kind: 'routine', renewBy: routineBy };
  }
  if (route.expedited_processing_days) {
    const expeditedBy = minusDays(departureDate, route.expedited_processing_days);
    if (now <= expeditedBy) return { kind: 'expedited', renewBy: expeditedBy };
  }
  return { kind: 'urgent' };
}

export function passportSentence({
  expiresOn,
  tripEnd,
  requiredMonths,
  countryName,
  advice,
}: {
  expiresOn: string;
  tripEnd: string;
  requiredMonths: number;
  countryName: string;
  advice: RenewalAdvice;
}): string {
  const months = monthsBetween(tripEnd, expiresOn);
  const problem =
    months < 0
      ? `Your passport expires before the trip ends; ${countryName} needs ${requiredMonths} months after you leave.`
      : `Your passport expires ${months} month${months === 1 ? '' : 's'} after the trip; ${countryName} needs ${requiredMonths}.`;
  const action =
    advice.kind === 'routine'
      ? `Renew online by ${formatIsoDate(advice.renewBy)} to make routine processing.`
      : advice.kind === 'expedited'
        ? `Routine processing won’t make it. Ask for expedited service by ${formatIsoDate(advice.renewBy)}.`
        : 'Standard processing is too slow now. You need an urgent option.';
  return `${problem} ${action}`;
}

```

- [ ] **Step 4: Run the pure tests**

```bash
cd apps/web && npx vitest run test/documents; cd ../..
```
Expected: PASS. In the "unknown" test, `matchRules` returns `may_apply` for the passport rule because `passenger.passport_months_valid_after_return` is missing. The REAL ID rule returns `does_not_apply` because `flight.is_domestic_us` is false. So the only check is `unknown`.

- [ ] **Step 5: Write the service and the documents page**

`apps/web/lib/documents/service.ts`:
```ts
import 'server-only';
import { appUrl } from '@/lib/env';
import { documentNotice } from '@/lib/notify/templates';
import { queueNotifications } from '@/lib/notify/queue';
import { getLibrary } from '@/lib/rules/library';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkMember } from './check';
import { documentSituation } from './facts';

const US = new Set(['US', 'PR', 'VI', 'GU', 'AS', 'MP']);

/** Replaces every member's checks for the trip. Runs on join, on document save, on booking confirmation, at T-30 days (Task 16's daily cron), and at T-72h. */
export async function runDocumentChecks(tripId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: trip } = await admin.from('trips').select('id, name, destination_country, end_date').eq('id', tripId).single();
  if (!trip) return;
  const { data: members } = await admin.from('trip_members').select('id, user_id').eq('trip_id', tripId);
  const { data: segments } = await admin.from('booking_segments').select('origin_country, destination_country').eq('trip_id', tripId);
  const resolved = (segments ?? []).filter((s) => s.origin_country && s.destination_country);
  const domesticFlight = resolved.length === 0 ? null : resolved.some((s) => US.has(s.origin_country!) && US.has(s.destination_country!));
  const userIds = (members ?? []).map((m) => m.user_id);
  const { data: documents } = await admin.from('member_documents').select('user_id, kind, issuing_country, expires_on, real_id_compliant').in('user_id', userIds);

  const rules = getLibrary().rules;
  const rows: Record<string, unknown>[] = [];
  const newlyFlagged: string[] = [];
  for (const member of members ?? []) {
    const mine = (documents ?? []).filter((d) => d.user_id === member.user_id);
    const passport = mine.find((d) => d.kind === 'passport');
    const realId = mine.find((d) => d.kind === 'real_id');
    const checks = checkMember(
      rules,
      documentSituation({
        destinationCountry: trip.destination_country,
        tripEnd: trip.end_date,
        passport: passport ? { issuingCountry: passport.issuing_country, expiresOn: passport.expires_on } : null,
        realIdCompliant: realId?.real_id_compliant ?? null,
        domesticFlight,
      }),
    );
    for (const check of checks) {
      rows.push({ trip_id: tripId, member_id: member.id, user_id: member.user_id, rule_id: check.rule?.id ?? null, rule_version: check.rule?.version ?? null, result: check.result, detail: check.detail });
      if (check.result === 'action_needed' && check.rule) {
        const { data: inserted } = await admin
          .from('action_items')
          .upsert(
            {
              trip_id: tripId,
              kind: 'document',
              title: 'Check your travel documents',
              detail: check.rule.title,
              assigned_user_ids: [member.user_id],
              source_kind: 'document_check',
              related_entity_id: member.id,
            },
            { onConflict: 'trip_id,source_kind,related_entity_id,title', ignoreDuplicates: true },
          )
          .select('id');
        if (inserted && inserted.length > 0) newlyFlagged.push(member.user_id);
      }
    }
  }

  await admin.from('document_checks').delete().eq('trip_id', tripId);
  if (rows.length > 0) await admin.from('document_checks').insert(rows);
  if (newlyFlagged.length > 0) {
    await queueNotifications({
      userIds: newlyFlagged,
      tripId,
      template: 'document_check',
      rendered: documentNotice({ tripName: trip.name, url: `${appUrl()}/trips/${tripId}/documents` }),
      urgent: false,
    });
  }
}
```

`apps/web/app/trips/[id]/documents/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/user';
import { runDocumentChecks } from '@/lib/documents/service';
import { createClient } from '@/lib/supabase/server';

export interface DocumentsState {
  error: string | null;
  saved: boolean;
}

const DocumentsInput = z.object({
  passportCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().or(z.literal('')),
  passportExpires: z.iso.date().optional().or(z.literal('')),
  realId: z.enum(['yes', 'no', 'unsure']),
  keepOnProfile: z.boolean(),
  consent: z.literal(true, { message: 'Tick the box so we can store these two details.' }),
});

export async function saveDocuments(tripId: string, _prev: DocumentsState, form: FormData): Promise<DocumentsState> {
  const user = await requireUser(`/trips/${tripId}/documents`);
  const parsed = DocumentsInput.safeParse({
    passportCountry: form.get('passportCountry') ?? '',
    passportExpires: form.get('passportExpires') ?? '',
    realId: form.get('realId') ?? 'unsure',
    keepOnProfile: form.get('keepOnProfile') === 'on',
    consent: form.get('consent') === 'on',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, saved: false };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const upserts = [
    ...(parsed.data.passportCountry || parsed.data.passportExpires
      ? [{ user_id: user.id, kind: 'passport', issuing_country: parsed.data.passportCountry || null, expires_on: parsed.data.passportExpires || null, keep_on_profile: parsed.data.keepOnProfile, updated_at: now }]
      : []),
    ...(parsed.data.realId !== 'unsure'
      ? [{ user_id: user.id, kind: 'real_id', real_id_compliant: parsed.data.realId === 'yes', keep_on_profile: parsed.data.keepOnProfile, updated_at: now }]
      : []),
  ];
  if (upserts.length > 0) {
    const { error } = await supabase.from('member_documents').upsert(upserts, { onConflict: 'user_id,kind' });
    if (error) return { error: 'We could not save that. Try again.', saved: false };
  }
  await supabase.from('consents').insert({ user_id: user.id, kind: 'documents', policy_version: 'documents-2026-10' });
  await runDocumentChecks(tripId);
  revalidatePath(`/trips/${tripId}/documents`);
  return { error: null, saved: true };
}
```

`apps/web/app/trips/[id]/documents/page.tsx`:
```tsx
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Character } from '@/components/character';
import { requireUser } from '@/lib/auth/user';
import { requiredMonths } from '@/lib/documents/check';
import { passportSentence, renewalAdvice, type RenewalRoute } from '@/lib/documents/deadlines';
import { getLibrary } from '@/lib/rules/library';
import { createClient } from '@/lib/supabase/server';
import { DocumentsForm } from './documents-form';

type Params = Promise<{ id: string }>;
const regionName = new Intl.DisplayNames(['en'], { type: 'region' });

export default function DocumentsPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Travel documents</h1>
      <Suspense fallback={<p className="mt-6 text-[#4b5745]">Loading…</p>}>
        <DocumentsContent params={params} />
      </Suspense>
    </main>
  );
}

async function DocumentsContent({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser(`/trips/${id}/documents`);
  const supabase = await createClient();
  const { data: trip } = await supabase.from('trips').select('id, name, destination_country, start_date, end_date').eq('id', id).maybeSingle();
  if (!trip) notFound();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: id });
  const { data: mine } = await supabase.from('member_documents').select('kind, issuing_country, expires_on, real_id_compliant');
  const { data: checks } = await supabase.from('document_checks').select('member_id, user_id, rule_id, result, detail').eq('trip_id', id);
  const { data: routes } = await supabase.from('travel_admin_partner_routes').select('*');
  const { data: directory } = await supabase.rpc('trip_directory', { p_trip_id: id });

  const passport = mine?.find((d) => d.kind === 'passport') ?? null;
  const passportRoute = routes?.find((r) => r.kind === 'passport') as RenewalRoute | undefined;
  const myChecks = (checks ?? []).filter((c) => c.user_id === user.id);
  const rules = getLibrary().rules;

  return (
    <>
      <p className="mt-2 text-[#4b5745]">We keep only your passport’s issuing country and expiry date, and whether your ID is REAL ID. Never the number.</p>

      {myChecks.map((check) => {
        const rule = rules.find((r) => r.id === check.rule_id) ?? null;
        if (check.result === 'ok') {
          return (
            <section key="ok" className="mt-6 flex items-center gap-4 rounded-xl border border-[#cfe3c8] bg-[#f1f8ee] p-5">
              <Character character="capybara" variant="avatar" width={48} />
              <p>All clear. Nothing to fix before you go.</p>
            </section>
          );
        }
        const months = rule ? requiredMonths(rule) : null;
        const advice = passportRoute && trip.start_date ? renewalAdvice(trip.start_date, passportRoute, new Date()) : null;
        const sentence =
          rule && months && passport?.expires_on && trip.end_date && advice && trip.destination_country
            ? passportSentence({ expiresOn: passport.expires_on, tripEnd: trip.end_date, requiredMonths: months, countryName: regionName.of(trip.destination_country) ?? trip.destination_country, advice })
            : check.detail;
        return (
          <section key={check.rule_id ?? check.detail} className="mt-6 flex items-start gap-4 rounded-xl border border-[#e7c37a] bg-[#fdf3dc] p-5">
            <Character character="owl" variant="avatar" width={48} />
            <div>
              <p className="font-medium">{sentence}</p>
              {passportRoute && rule?.tags.includes('passport') ? (
                <p className="mt-2 text-sm">
                  <a href={passportRoute.official_url} className="underline" rel="noopener">
                    {passportRoute.official_label}
                  </a>
                  {passportRoute.official_note ? ` — ${passportRoute.official_note}` : ''}
                </p>
              ) : null}
              {advice?.kind === 'urgent' && passportRoute?.affiliate_url ? (
                <p className="mt-2 text-sm">
                  <a href={passportRoute.affiliate_url} rel="sponsored noopener" className="underline">
                    {passportRoute.affiliate_label}
                  </a>
                  <span className="block text-xs text-[#4b5745]">{passportRoute.affiliate_disclosure}</span>
                </p>
              ) : null}
              {rule ? (
                <a href={`/rules/${rule.id}`} className="mt-2 inline-block text-sm text-[#b4532a] underline">
                  The rule, with its source
                </a>
              ) : null}
            </div>
          </section>
        );
      })}

      <DocumentsForm tripId={id} passportCountry={passport?.issuing_country ?? ''} passportExpires={passport?.expires_on ?? ''} />

      {isPlanner === true ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">The group</h2>
          <ul className="mt-3 divide-y divide-[#e4dfd0] rounded-xl border border-[#e4dfd0] bg-white">
            {(directory ?? []).map((member: { member_id: string; display_name: string }) => {
              const theirs = (checks ?? []).filter((c) => c.member_id === member.member_id);
              const status = theirs.some((c) => c.result === 'action_needed') ? 'Needs attention' : theirs.some((c) => c.result === 'unknown') ? 'Hasn’t confirmed yet' : 'All clear';
              return (
                <li key={member.member_id} className="flex justify-between px-4 py-3">
                  <span>{member.display_name}</span>
                  <span className="text-sm text-[#4b5745]">{status}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}
```

`apps/web/app/trips/[id]/documents/documents-form.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { saveDocuments, type DocumentsState } from './actions';

const inputClass = 'mt-1 w-full rounded-md border border-[#d9d3c2] bg-white px-3 py-2';

export function DocumentsForm({ tripId, passportCountry, passportExpires }: { tripId: string; passportCountry: string; passportExpires: string }) {
  const [state, formAction, pending] = useActionState<DocumentsState, FormData>(saveDocuments.bind(null, tripId), { error: null, saved: false });
  return (
    <form action={formAction} className="mt-10 space-y-4 rounded-xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="font-semibold">Your documents</h2>
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm font-medium">
          Passport issued by (two letters)
          <input name="passportCountry" maxLength={2} defaultValue={passportCountry} placeholder="US" className={`${inputClass} uppercase`} />
        </label>
        <label className="block text-sm font-medium">
          Passport expires
          <input name="passportExpires" type="date" defaultValue={passportExpires} className={inputClass} />
        </label>
      </div>
      <fieldset className="text-sm">
        <legend className="font-medium">Is your driver’s license or state ID REAL ID (it has a star)?</legend>
        <div className="mt-2 flex gap-4">
          {['yes', 'no', 'unsure'].map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input type="radio" name="realId" value={value} defaultChecked={value === 'unsure'} /> {value === 'unsure' ? 'Not sure' : value[0].toUpperCase() + value.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="keepOnProfile" className="mt-1" /> Keep these for my next trip (otherwise we delete them 30 days after this one).
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-1" /> Store my passport’s issuing country and expiry date to check this trip’s entry rules.
      </label>
      {state.error ? <p role="alert" className="text-sm text-[#b42318]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm text-[#2f6b2a]">Saved. We re-checked the trip.</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save and check'}
      </Button>
    </form>
  );
}
```

Hook the checks into joining and confirmation:
1. In `apps/web/app/join/[token]/actions.ts`, add `import { runDocumentChecks } from '@/lib/documents/service';`, and call `await runDocumentChecks(tripId);` just before `redirect(...)`.
2. In `apps/web/lib/bookings/confirm.ts`, add `import { runDocumentChecks } from '@/lib/documents/service';`, and call `await runDocumentChecks(tripId);` after the segment loop, just before `return`.

- [ ] **Step 6: Run the tests, typecheck, and build**

```bash
cd apps/web && npx vitest run && npm run typecheck && npm run build; cd ../..
```
Expected: all tests pass, typecheck is clean, and the build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -F - <<'EOF'
Check everyone's documents against verified rules

Each member's passport country and expiry, and their REAL ID answer,
become rule facts. Requirement rules that apply flag the member. The
planner sees who needs attention but never anyone's dates. The member
sees exactly what is wrong and the renew-by date, with the free official
route first and an affiliate expediter only when time has run out.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 8: The bookings page — confirm, assign, add by hand, and upload screenshots

No characters on this page. It is a dense working list.

**Files:**
- Create: `apps/web/lib/bookings/manual.ts`, `apps/web/lib/bookings/screenshot.ts`, `apps/web/app/trips/[id]/bookings/page.tsx`, `apps/web/app/trips/[id]/bookings/actions.ts`, `apps/web/app/trips/[id]/bookings/forms.tsx`, `apps/web/test/bookings/manual.test.ts`, `apps/web/test/bookings/screenshot.test.ts`
- Modify: `apps/web/next.config.ts` (server-action body limit)

**Interfaces:**
- Consumes: `onBookingsConfirmed` (Task 4), `putInbound` and `intakeWorkflow` (Task 5), `segmentMonitorWorkflow` (Task 5's stub, made real by Task 9), and C1's RLS.
- Produces:
  - **Validators:**
    - `parseManualFlight(form): { success: true; data: ManualFlight } | { success: false; error }`
    - `validateScreenshot(file: File): { ok: true; ext: 'png' | 'jpg' | 'webp' } | { ok: false; error }`
  - **Server actions:**
    - `confirmBooking(tripId, bookingId)`
    - `toggleAssignment(tripId, bookingId, memberId, on)`
    - `addManualFlight(tripId, prev, form)`
    - `uploadScreenshot(tripId, prev, form)`

- [ ] **Step 1: Write the failing tests**

`apps/web/test/bookings/manual.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseManualFlight } from '@/lib/bookings/manual';

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

describe('parseManualFlight', () => {
  it('accepts "TP 204" style flight numbers and normalizes codes', () => {
    expect(parseManualFlight(form({ flight: 'tp 204', date: '2026-11-03', time: '18:15', from: 'ewr', to: 'lis', code: 'abc123' }))).toEqual({
      success: true,
      data: { carrierIata: 'TP', flightNumber: '204', departureLocal: '2026-11-03T18:15', originIata: 'EWR', destinationIata: 'LIS', confirmationCode: 'ABC123' },
    });
  });

  it('explains what is wrong', () => {
    expect(parseManualFlight(form({ flight: 'Portugal Air', date: '2026-11-03', time: '18:15', from: 'EWR', to: 'LIS', code: '' }))).toEqual({
      success: false,
      error: 'Enter the flight like “TP 204”.',
    });
  });
});
```

`apps/web/test/bookings/screenshot.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { validateScreenshot } from '@/lib/bookings/screenshot';

describe('validateScreenshot', () => {
  it('accepts common image types under 8 MB', () => {
    expect(validateScreenshot(new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }))).toEqual({ ok: true, ext: 'png' });
    expect(validateScreenshot(new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' }))).toEqual({ ok: true, ext: 'jpg' });
  });

  it('rejects other files and big uploads', () => {
    expect(validateScreenshot(new File(['x'], 'a.pdf', { type: 'application/pdf' })).ok).toBe(false);
    expect(validateScreenshot(new File([new Uint8Array(9 * 1024 * 1024)], 'a.png', { type: 'image/png' })).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/bookings; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 3: Implement the validators**

`apps/web/lib/bookings/manual.ts`:
```ts
export interface ManualFlight {
  carrierIata: string;
  flightNumber: string;
  departureLocal: string;
  originIata: string;
  destinationIata: string;
  confirmationCode: string | null;
}

export function parseManualFlight(form: FormData): { success: true; data: ManualFlight } | { success: false; error: string } {
  const flight = String(form.get('flight') ?? '').toUpperCase().replace(/\s+/g, '');
  const match = flight.match(/^([A-Z0-9]{2})(\d{1,4})$/);
  if (!match) return { success: false, error: 'Enter the flight like “TP 204”.' };
  const date = String(form.get('date') ?? '');
  const time = String(form.get('time') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { success: false, error: 'Add the departure date and local time.' };
  const from = String(form.get('from') ?? '').trim().toUpperCase();
  const to = String(form.get('to') ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return { success: false, error: 'Use three-letter airport codes, like EWR and LIS.' };
  const code = String(form.get('code') ?? '').trim().toUpperCase();
  return {
    success: true,
    data: { carrierIata: match[1], flightNumber: match[2].replace(/^0+(?=\d)/, ''), departureLocal: `${date}T${time}`, originIata: from, destinationIata: to, confirmationCode: code || null },
  };
}
```

`apps/web/lib/bookings/screenshot.ts`:
```ts
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;
const MAX_BYTES = 8 * 1024 * 1024;

export function validateScreenshot(file: File): { ok: true; ext: 'png' | 'jpg' | 'webp' } | { ok: false; error: string } {
  const ext = TYPES[file.type as keyof typeof TYPES];
  if (!ext) return { ok: false, error: 'Upload a PNG, JPEG, or WebP screenshot.' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'That screenshot is over 8 MB.' };
  return { ok: true, ext };
}
```

- [ ] **Step 4: Write the actions and page**

`apps/web/app/trips/[id]/bookings/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { start } from 'workflow/api';
import { requireUser } from '@/lib/auth/user';
import { onBookingsConfirmed } from '@/lib/bookings/confirm';
import { parseManualFlight } from '@/lib/bookings/manual';
import { validateScreenshot } from '@/lib/bookings/screenshot';
import { putInbound } from '@/lib/intake/storage';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { intakeWorkflow } from '@/workflows/intake';
import { segmentMonitorWorkflow } from '@/workflows/segment-monitor';

async function plannerClient(tripId: string) {
  await requireUser(`/trips/${tripId}/bookings`);
  const supabase = await createClient();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: tripId });
  if (isPlanner !== true) throw new Error('Only the planner can do that.');
  return supabase;
}

async function afterConfirm(tripId: string, bookingIds: string[]) {
  const { monitorSegmentIds } = await onBookingsConfirmed(tripId, bookingIds);
  for (const segmentId of monitorSegmentIds) await start(segmentMonitorWorkflow, [segmentId]);
}

export async function confirmBooking(tripId: string, bookingId: string): Promise<void> {
  const supabase = await plannerClient(tripId);
  const { error } = await supabase.from('bookings').update({ confirmed_at: new Date().toISOString() }).eq('id', bookingId).eq('trip_id', tripId);
  if (error) throw new Error(error.message);
  await supabase.from('action_items').update({ status: 'done' }).eq('trip_id', tripId).eq('related_entity_id', bookingId);
  await afterConfirm(tripId, [bookingId]);
  revalidatePath(`/trips/${tripId}/bookings`);
}

export async function toggleAssignment(tripId: string, bookingId: string, memberId: string, on: boolean): Promise<void> {
  await requireUser(`/trips/${tripId}/bookings`);
  const supabase = await createClient();
  // RLS allows the planner, or the member themselves.
  const { error } = on
    ? await supabase.from('booking_members').insert({ booking_id: bookingId, member_id: memberId, trip_id: tripId })
    : await supabase.from('booking_members').delete().eq('booking_id', bookingId).eq('member_id', memberId);
  if (error && error.code !== '23505') throw new Error(error.message);
  revalidatePath(`/trips/${tripId}/bookings`);
}

export interface FormState {
  error: string | null;
  done: boolean;
}

export async function addManualFlight(tripId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await plannerClient(tripId);
  const parsed = parseManualFlight(form);
  if (!parsed.success) return { error: parsed.error, done: false };
  const f = parsed.data;
  const admin = createAdminClient();
  const { data: booking, error } = await admin
    .from('bookings')
    .insert({
      trip_id: tripId,
      kind: 'flight',
      provider: f.carrierIata,
      confirmation_code: f.confirmationCode,
      extraction_confidence: 1,
      dedupe_key: `${f.confirmationCode ?? 'MANUAL'}|${f.carrierIata}${f.flightNumber}@${f.departureLocal.slice(0, 10)}`,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) return { error: error.code === '23505' ? 'That flight is already on the trip.' : 'We could not add that flight.', done: false };
  await admin.from('booking_segments').insert({
    booking_id: booking.id,
    trip_id: tripId,
    position: 1,
    carrier_iata: f.carrierIata,
    flight_number: f.flightNumber,
    origin_iata: f.originIata,
    destination_iata: f.destinationIata,
    departure_local: f.departureLocal,
  });
  await afterConfirm(tripId, [booking.id]);
  revalidatePath(`/trips/${tripId}/bookings`);
  return { error: null, done: true };
}

export async function uploadScreenshot(tripId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(`/trips/${tripId}/bookings`);
  const supabase = await createClient();
  const { data: isMember } = await supabase.rpc('is_trip_member', { p_trip_id: tripId });
  if (isMember !== true) return { error: 'Join the trip first.', done: false };
  const file = form.get('screenshot');
  if (!(file instanceof File)) return { error: 'Choose a screenshot.', done: false };
  const check = validateScreenshot(file);
  if (!check.ok) return { error: check.error, done: false };
  const objectPath = await putInbound(`${tripId}/screenshots/${crypto.randomUUID()}.${check.ext}`, new Uint8Array(await file.arrayBuffer()), file.type);
  const { data: message, error } = await createAdminClient()
    .from('inbound_messages')
    .insert({ trip_id: tripId, source: 'screenshot', sender: user.email, subject: file.name, storage_path: objectPath, status: 'received' })
    .select('id')
    .single();
  if (error) return { error: 'We could not take that screenshot.', done: false };
  await start(intakeWorkflow, [message.id]);
  return { error: null, done: true };
}
```

Raise the server-action body limit for screenshots. In `apps/web/next.config.ts`, add this to `nextConfig`:
```ts
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
```

`apps/web/app/trips/[id]/bookings/page.tsx`:
```tsx
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/user';
import { createClient } from '@/lib/supabase/server';
import { confirmBooking, toggleAssignment } from './actions';
import { ManualFlightForm, ScreenshotForm } from './forms';

type Params = Promise<{ id: string }>;

export default function BookingsPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
      <Suspense fallback={<p className="mt-6 text-[#4b5745]">Loading bookings…</p>}>
        <BookingsContent params={params} />
      </Suspense>
    </main>
  );
}

async function BookingsContent({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser(`/trips/${id}/bookings`);
  const supabase = await createClient();
  const { data: isMember } = await supabase.rpc('is_trip_member', { p_trip_id: id });
  if (isMember !== true) notFound();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: id });
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, kind, provider, booked_via, passenger_names, extraction_confidence, confirmed_at, booking_segments(id, position, carrier_iata, flight_number, origin_iata, destination_iata, departure_local, scheduled_out)')
    .eq('trip_id', id)
    .order('created_at');
  const { data: assignments } = await supabase.from('booking_members').select('booking_id, member_id').eq('trip_id', id);
  const { data: directory } = await supabase.rpc('trip_directory', { p_trip_id: id });
  const me = (directory ?? []).find((m: { user_id: string }) => m.user_id === user.id) as { member_id: string } | undefined;
  // Codes come one by one through the RLS-checked function; everyone else gets null.
  const codes: Record<string, string | null> = Object.fromEntries(
    await Promise.all(
      (bookings ?? []).map(async (b) => [b.id, ((await supabase.rpc('booking_confirmation_code', { p_booking_id: b.id })).data as string | null) ?? null] as const),
    ),
  );

  return (
    <>
      <ul className="mt-6 space-y-4">
        {(bookings ?? []).map((booking) => {
          const code = codes[booking.id];
          const onIt = new Set((assignments ?? []).filter((a) => a.booking_id === booking.id).map((a) => a.member_id));
          return (
            <li key={booking.id} className="rounded-xl border border-[#e4dfd0] bg-white p-5">
              <div className="flex items-baseline justify-between">
                <p className="font-semibold">
                  {booking.provider}
                  {code ? <span className="ml-2 font-mono text-sm text-[#4b5745]">{code}</span> : null}
                </p>
                <span className="text-sm text-[#4b5745]">{booking.confirmed_at ? 'Confirmed' : 'Waiting for the planner'}</span>
              </div>
              {booking.booked_via ? <p className="text-sm text-[#4b5745]">Booked through {booking.booked_via}</p> : null}
              <ul className="mt-2 text-sm">
                {(booking.booking_segments ?? [])
                  .sort((a, b) => a.position - b.position)
                  .map((s) => (
                    <li key={s.id}>
                      {s.carrier_iata} {s.flight_number} · {s.origin_iata} → {s.destination_iata} · {s.departure_local.replace('T', ' ')}
                      {s.scheduled_out ? '' : ' · not yet matched to the schedule'}
                    </li>
                  ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {(directory ?? []).map((member: { member_id: string; display_name: string; user_id: string }) => {
                  const canToggle = isPlanner === true || member.user_id === user.id;
                  const on = onIt.has(member.member_id);
                  return canToggle ? (
                    <form key={member.member_id} action={toggleAssignment.bind(null, id, booking.id, member.member_id, !on)}>
                      <Button type="submit" size="sm" variant={on ? 'default' : 'outline'}>
                        {member.display_name}
                      </Button>
                    </form>
                  ) : (
                    <span key={member.member_id} className={on ? 'font-medium' : 'text-[#4b5745]'}>
                      {member.display_name}
                    </span>
                  );
                })}
              </div>
              {isPlanner === true && !booking.confirmed_at ? (
                <form action={confirmBooking.bind(null, id, booking.id)} className="mt-3">
                  <Button type="submit" size="sm">
                    Confirm — start watching it
                  </Button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
      {me ? <ScreenshotForm tripId={id} /> : null}
      {isPlanner === true ? <ManualFlightForm tripId={id} /> : null}
    </>
  );
}
```

`apps/web/app/trips/[id]/bookings/forms.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { addManualFlight, uploadScreenshot, type FormState } from './actions';

const inputClass = 'mt-1 w-full rounded-md border border-[#d9d3c2] bg-white px-3 py-2';

export function ScreenshotForm({ tripId }: { tripId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(uploadScreenshot.bind(null, tripId), { error: null, done: false });
  return (
    <form action={action} className="mt-10 rounded-xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="font-semibold">Add a booking from a screenshot</h2>
      <input type="file" name="screenshot" accept="image/png,image/jpeg,image/webp" required className="mt-3 block text-sm" />
      {state.error ? <p role="alert" className="mt-2 text-sm text-[#b42318]">{state.error}</p> : null}
      {state.done ? <p role="status" className="mt-2 text-sm text-[#2f6b2a]">Got it. It shows up here in a minute.</p> : null}
      <Button type="submit" disabled={pending} className="mt-3">
        {pending ? 'Uploading…' : 'Upload'}
      </Button>
    </form>
  );
}

export function ManualFlightForm({ tripId }: { tripId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addManualFlight.bind(null, tripId), { error: null, done: false });
  return (
    <form action={action} className="mt-6 grid gap-3 rounded-xl border border-[#e4dfd0] bg-white p-6 sm:grid-cols-2">
      <h2 className="font-semibold sm:col-span-2">Add a flight by hand</h2>
      <label className="text-sm font-medium">Flight<input name="flight" placeholder="TP 204" required className={inputClass} /></label>
      <label className="text-sm font-medium">Confirmation code (optional)<input name="code" className={`${inputClass} uppercase`} /></label>
      <label className="text-sm font-medium">Date<input name="date" type="date" required className={inputClass} /></label>
      <label className="text-sm font-medium">Local departure time<input name="time" type="time" required className={inputClass} /></label>
      <label className="text-sm font-medium">From<input name="from" maxLength={3} placeholder="EWR" required className={`${inputClass} uppercase`} /></label>
      <label className="text-sm font-medium">To<input name="to" maxLength={3} placeholder="LIS" required className={`${inputClass} uppercase`} /></label>
      {state.error ? <p role="alert" className="text-sm text-[#b42318] sm:col-span-2">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="sm:col-span-2">
        {pending ? 'Adding…' : 'Add flight'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Run the tests, typecheck, and build**

```bash
cd apps/web && npx vitest run && npm run typecheck && npm run build; cd ../..
```
Expected: all tests pass, typecheck is clean, and the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -F - <<'EOF'
Add the bookings page: confirm, assign, add by hand, upload screenshots

The planner confirms what intake couldn't, and assigns travelers to
each booking; members can mark themselves on or off. Confirmation codes
show only to the planner and the people on that booking. Screenshots go
through the same intake workflow as email.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 9: Monitoring — classification, flight alerts, polling, and durable monitor workflows

**Files:**
- Create: `apps/web/lib/monitor/snapshot.ts`, `apps/web/lib/monitor/record.ts`, `apps/web/lib/workflows/tokens.ts`, `apps/web/lib/workflows/ports.ts`, `apps/web/lib/workflows/live-ports.ts`, `apps/web/lib/workflows/memory-ports.ts`, `apps/web/workflows/trip-monitor.ts`, `apps/web/app/api/webhooks/aeroapi/[secret]/route.ts`, `apps/web/vitest.integration.config.ts`, `apps/web/test/monitor/snapshot.test.ts`, `apps/web/test/workflows/segment-monitor.integration.test.ts`
- Modify: `apps/web/workflows/segment-monitor.ts` (replace the stub), `apps/web/lib/bookings/confirm.ts` (fill `monitorSegmentIds`), `apps/web/app/api/webhooks/stripe/route.ts` (start trip monitoring), `apps/web/package.json` (devDependency `@workflow/vitest`, script `test:integration`)

**Interfaces:**
- Consumes: Task 4 (`aeroApi`, `AeroFlight`), Task 7 (`runDocumentChecks`), Task 2 (`queueNotifications`, `briefingNotice`), and C1 Task 9 (`handleStripeEvent`).
- Produces:
  - **Flight snapshots:**
    - `FlightSnapshot`
    - `snapshotFromAero(f): FlightSnapshot`
    - `FlightEvent = { type: 'cancellation' | 'delay' | 'schedule_change'; delayMinutes: number | null; dedupeSuffix: string }`
    - `classify(prev, next): FlightEvent | null`
    - `flightEnded(s): boolean`
    - `DELAY_BANDS = [120, 180, 360]`
  - **Recording:** `recordFlightSnapshot(segmentId, snapshot, source: 'alert' | 'poll'): Promise<{ incidentId: string | null }>`
  - **Hook tokens:** `segmentMonitorToken(id)`, `incidentAnswerToken(id)`, `incidentReleaseToken(id)`
  - **Ports:**
    - `MonitoredSegment = { id; tripId; ident; departureDate; originIata; destinationIata; scheduledOut: string | null; scheduledIn: string | null; alertId: string | null }`
    - `WorkflowPorts`, with the monitor operations listed below, including `flagMonitorTrouble(segmentId)`. Task 12 adds the incident operations.
    - `pollAndRecord` returns `{ incidentId; ended; failed? }`. `failed: true` means AeroAPI could not be reached.
    - `workflowPorts(): Promise<WorkflowPorts>`
  - **Workflows:** `tripMonitorWorkflow(tripId)` and `segmentMonitorWorkflow(segmentId)`
  - **Route:** `POST /api/webhooks/aeroapi/[secret]`

How monitoring works:
- **Alerts** go straight to the webhook route, which records the snapshot. Task 12 adds starting the incident workflow from the route.
- **Polling** is the safety net, run by `segmentMonitorWorkflow`. When an alert is registered, it polls every 6h before T-6h and hourly after that. Without an alert (`polling_only`), it polls every 2h, then every 30m.
- **Simpler than the spec's design:** this replaces the spec's "race the hook against sleep." Both alert and poll paths dedupe on the same incident key, so the behaviour is equivalent.
- **AeroAPI errors:** a failed poll returns `failed: true` instead of throwing, so monitoring never dies with AeroAPI. The next poll comes sooner, backing off exponentially from 5 minutes up to the normal interval. Three failures in a row mark the segment `polling_only`, and `/admin` lists those flights for a manual check (Task 16).

- [ ] **Step 1: Add the Workflow test plugin**

```bash
npm install -D @workflow/vitest@5.0.1 -w @elsewhere/web
```
In `apps/web/package.json` `scripts`, add `"test:integration": "vitest run --config vitest.integration.config.ts"`.

`apps/web/vitest.integration.config.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { workflow } from '@workflow/vitest';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');

export default defineConfig({
  plugins: [workflow()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}/` },
      { find: 'server-only', replacement: `${root}/test/setup/server-only.ts` },
    ],
  },
  test: {
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 60_000,
    env: { ELSEWHERE_PORTS: 'memory' },
  },
});
```

- [ ] **Step 2: Write the failing tests**

`apps/web/test/monitor/snapshot.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { classify, flightEnded, type FlightSnapshot } from '@/lib/monitor/snapshot';

const base: FlightSnapshot = {
  faFlightId: 'TAP204-1',
  cancelled: false,
  diverted: false,
  scheduledOut: '2026-11-03T23:15:00Z',
  estimatedOut: '2026-11-03T23:15:00Z',
  actualOut: null,
  scheduledIn: '2026-11-04T06:35:00Z',
  estimatedIn: '2026-11-04T06:35:00Z',
  actualIn: null,
  arrivalDelayMinutes: 0,
};

describe('classify', () => {
  it('reports a new cancellation once', () => {
    expect(classify(base, { ...base, cancelled: true })).toEqual({ type: 'cancellation', delayMinutes: null, dedupeSuffix: 'cancellation' });
    expect(classify({ ...base, cancelled: true }, { ...base, cancelled: true })).toBeNull();
  });

  it('reports delays only when they cross a new band', () => {
    expect(classify(base, { ...base, arrivalDelayMinutes: 95 })).toBeNull();
    expect(classify(base, { ...base, arrivalDelayMinutes: 130 })).toEqual({ type: 'delay', delayMinutes: 130, dedupeSuffix: 'delay-120' });
    expect(classify({ ...base, arrivalDelayMinutes: 130 }, { ...base, arrivalDelayMinutes: 170 })).toBeNull();
    expect(classify({ ...base, arrivalDelayMinutes: 170 }, { ...base, arrivalDelayMinutes: 200 })).toEqual({ type: 'delay', delayMinutes: 200, dedupeSuffix: 'delay-180' });
  });

  it('derives the delay from estimated times when AeroAPI omits it', () => {
    expect(classify(base, { ...base, arrivalDelayMinutes: null, estimatedIn: '2026-11-04T09:45:00Z' })).toMatchObject({ type: 'delay', delayMinutes: 190 });
  });

  it('treats a diversion as a schedule change', () => {
    expect(classify(base, { ...base, diverted: true })).toEqual({ type: 'schedule_change', delayMinutes: null, dedupeSuffix: 'diversion' });
  });
});

describe('flightEnded', () => {
  it('ends on arrival or cancellation', () => {
    expect(flightEnded(base)).toBe(false);
    expect(flightEnded({ ...base, actualIn: '2026-11-04T06:40:00Z' })).toBe(true);
    expect(flightEnded({ ...base, cancelled: true })).toBe(true);
  });
});
```

`apps/web/test/workflows/segment-monitor.integration.test.ts`:
```ts
import { getRun, start } from 'workflow/api';
import { waitForSleep } from '@workflow/vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { memoryState, resetMemoryPorts } from '@/lib/workflows/memory-ports';
import { segmentMonitorWorkflow } from '@/workflows/segment-monitor';

beforeEach(() => resetMemoryPorts());

describe('segmentMonitorWorkflow', () => {
  it('falls back to polling when alert registration fails, records an incident, and stops at arrival', async () => {
    const state = memoryState();
    const departs = new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString();
    const arrives = new Date(Date.now() + 38 * 60 * 60 * 1000).toISOString();
    state.segments.set('seg-1', { id: 'seg-1', tripId: 'trip-1', ident: 'TP204', departureDate: departs.slice(0, 10), originIata: 'EWR', destinationIata: 'LIS', scheduledOut: departs, scheduledIn: arrives, alertId: null });
    state.alertFails = true;
    state.pollResults = [
      { incidentId: null, ended: false },
      { incidentId: 'inc-1', ended: false },
      { incidentId: null, ended: true },
    ];

    const run = await start(segmentMonitorWorkflow, ['seg-1']);
    for (let i = 0; i < 4; i += 1) {
      const sleepId = await waitForSleep(run);
      await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });
      if (state.pollResults.length === 0) break;
    }
    const result = await run.returnValue;

    expect(state.monitorStates.get('seg-1')).toBe('polling_only');
    expect(result).toEqual({ segmentId: 'seg-1', status: 'ended', incidents: ['inc-1'] });
    expect(state.ended).toContain('seg-1');
  });

  it('exits when another run already watches the segment', async () => {
    const state = memoryState();
    const departs = new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString();
    state.segments.set('seg-2', { id: 'seg-2', tripId: 'trip-1', ident: 'TP205', departureDate: departs.slice(0, 10), originIata: 'LIS', destinationIata: 'EWR', scheduledOut: departs, scheduledIn: departs, alertId: 'a1' });
    const first = await start(segmentMonitorWorkflow, ['seg-2']);
    await waitForSleep(first);
    const second = await start(segmentMonitorWorkflow, ['seg-2']);
    expect(await second.returnValue).toEqual({ segmentId: 'seg-2', status: 'duplicate', incidents: [] });
    await getRun(first.runId).cancel();
  });

  it('keeps watching through AeroAPI errors, and flags the segment after three in a row', async () => {
    const state = memoryState();
    const departs = new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString();
    const arrives = new Date(Date.now() + 38 * 60 * 60 * 1000).toISOString();
    state.segments.set('seg-3', { id: 'seg-3', tripId: 'trip-1', ident: 'TP206', departureDate: departs.slice(0, 10), originIata: 'EWR', destinationIata: 'LIS', scheduledOut: departs, scheduledIn: arrives, alertId: 'a3' });
    state.pollResults = [
      { incidentId: null, ended: false, failed: true },
      { incidentId: null, ended: false, failed: true },
      { incidentId: null, ended: false, failed: true },
      { incidentId: null, ended: true },
    ];

    const run = await start(segmentMonitorWorkflow, ['seg-3']);
    // One sleep until T-24h, then one before each of the four polls.
    for (let i = 0; i < 5; i += 1) {
      const sleepId = await waitForSleep(run);
      await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });
    }
    const result = await run.returnValue;

    expect(state.troubled).toEqual(['seg-3']);
    expect(result).toEqual({ segmentId: 'seg-3', status: 'ended', incidents: [] });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/monitor && npm run test:integration; cd ../..
```
Expected: FAIL, with modules not found and the stub workflow lacking behaviour.

- [ ] **Step 4: Implement classification and recording**

`apps/web/lib/monitor/snapshot.ts`:
```ts
import type { AeroFlight } from '@/lib/flights/aeroapi';

export const DELAY_BANDS = [120, 180, 360] as const;

export interface FlightSnapshot {
  faFlightId: string | null;
  cancelled: boolean;
  diverted: boolean;
  scheduledOut: string | null;
  estimatedOut: string | null;
  actualOut: string | null;
  scheduledIn: string | null;
  estimatedIn: string | null;
  actualIn: string | null;
  arrivalDelayMinutes: number | null;
}

export interface FlightEvent {
  type: 'cancellation' | 'delay' | 'schedule_change';
  delayMinutes: number | null;
  dedupeSuffix: string;
}

export function snapshotFromAero(f: AeroFlight): FlightSnapshot {
  return {
    faFlightId: f.fa_flight_id,
    cancelled: f.cancelled,
    diverted: f.diverted,
    scheduledOut: f.scheduled_out,
    estimatedOut: f.estimated_out,
    actualOut: f.actual_out,
    scheduledIn: f.scheduled_in,
    estimatedIn: f.estimated_in,
    actualIn: f.actual_in,
    arrivalDelayMinutes: f.arrival_delay === null ? null : Math.round(f.arrival_delay / 60),
  };
}

function delayOf(s: FlightSnapshot): number {
  if (s.arrivalDelayMinutes !== null) return s.arrivalDelayMinutes;
  const actualOrEstimated = s.actualIn ?? s.estimatedIn;
  if (!actualOrEstimated || !s.scheduledIn) return 0;
  return Math.round((new Date(actualOrEstimated).getTime() - new Date(s.scheduledIn).getTime()) / 60000);
}

function band(minutes: number): number {
  return [...DELAY_BANDS].reverse().find((b) => minutes >= b) ?? 0;
}

/** One event per new fact: cancellation, diversion, or a delay crossing a new band. */
export function classify(prev: FlightSnapshot | null, next: FlightSnapshot): FlightEvent | null {
  if (next.cancelled && !prev?.cancelled) return { type: 'cancellation', delayMinutes: null, dedupeSuffix: 'cancellation' };
  if (next.diverted && !prev?.diverted) return { type: 'schedule_change', delayMinutes: null, dedupeSuffix: 'diversion' };
  const delay = delayOf(next);
  const newBand = band(delay);
  if (newBand > 0 && newBand > band(prev ? delayOf(prev) : 0)) return { type: 'delay', delayMinutes: delay, dedupeSuffix: `delay-${newBand}` };
  return null;
}

export function flightEnded(s: FlightSnapshot): boolean {
  return s.cancelled || Boolean(s.actualIn);
}
```

`apps/web/lib/monitor/record.ts`:
```ts
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { classify, type FlightSnapshot } from './snapshot';

/** Saves the latest snapshot and opens an incident when it reveals a new event. Safe to call twice with the same data. */
export async function recordFlightSnapshot(segmentId: string, snapshot: FlightSnapshot, source: 'alert' | 'poll'): Promise<{ incidentId: string | null }> {
  const admin = createAdminClient();
  const { data: segment } = await admin.from('booking_segments').select('id, trip_id, booking_id, last_status').eq('id', segmentId).single();
  if (!segment) return { incidentId: null };
  const event = classify((segment.last_status as FlightSnapshot | null) ?? null, snapshot);
  await admin.from('booking_segments').update({ last_status: snapshot, fa_flight_id: snapshot.faFlightId }).eq('id', segmentId);
  if (!event) return { incidentId: null };

  const { data: affected } = await admin.from('booking_members').select('trip_members!inner(user_id)').eq('booking_id', segment.booking_id);
  const affectedUserIds = (affected ?? []).map((row) => {
    const member = Array.isArray(row.trip_members) ? row.trip_members[0] : row.trip_members;
    return member.user_id as string;
  });
  const { data: inserted } = await admin
    .from('incidents')
    .upsert(
      {
        trip_id: segment.trip_id,
        segment_id: segmentId,
        event_type: event.type,
        delay_minutes: event.delayMinutes,
        dedupe_key: `${segmentId}:${event.dedupeSuffix}`,
        raw_payload: { ...snapshot, source },
        affected_user_ids: affectedUserIds,
      },
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    )
    .select('id');
  const incidentId = inserted?.[0]?.id ?? null;
  if (incidentId) await admin.from('incident_events').insert({ incident_id: incidentId, kind: 'detected', detail: { source, type: event.type, delay_minutes: event.delayMinutes } });
  return { incidentId };
}
```

- [ ] **Step 5: Implement the ports and the monitor workflows**

`apps/web/lib/workflows/tokens.ts`:
```ts
export const segmentMonitorToken = (segmentId: string) => `segment-monitor:${segmentId}`;
export const incidentAnswerToken = (incidentId: string) => `incident-answer:${incidentId}`;
export const incidentReleaseToken = (incidentId: string) => `incident-release:${incidentId}`;
```

`apps/web/lib/workflows/ports.ts`:
```ts
import { assertTestSeamAllowed } from '@/lib/env';

export interface MonitoredSegment {
  id: string;
  tripId: string;
  ident: string;
  departureDate: string;
  originIata: string;
  destinationIata: string;
  scheduledOut: string | null;
  scheduledIn: string | null;
  alertId: string | null;
}

export interface WorkflowPorts {
  listMonitorableSegmentIds(tripId: string): Promise<string[]>;
  tripTiming(tripId: string): Promise<{ firstDeparture: string | null; tripEnd: string | null }>;
  preTripChecks(tripId: string): Promise<void>;
  loadSegment(segmentId: string): Promise<MonitoredSegment | null>;
  registerAlert(segment: MonitoredSegment): Promise<'monitoring' | 'polling_only'>;
  pollAndRecord(segmentId: string): Promise<{ incidentId: string | null; ended: boolean; failed?: boolean }>;
  endSegment(segmentId: string): Promise<void>;
  flagMonitorTrouble(segmentId: string): Promise<void>;
}

/** Live ports load lazily, so memory-mode integration tests never import server-only modules. */
export async function workflowPorts(): Promise<WorkflowPorts> {
  if (process.env.ELSEWHERE_PORTS === 'memory') {
    assertTestSeamAllowed('ELSEWHERE_PORTS');
    const { memoryPorts } = await import('./memory-ports');
    return memoryPorts();
  }
  const { livePorts } = await import('./live-ports');
  return livePorts();
}
```

`apps/web/lib/workflows/memory-ports.ts`:
```ts
import type { MonitoredSegment, WorkflowPorts } from './ports';

/** Shared through globalThis: steps run from generated bundles, a different module graph from the test file. */
interface MemoryState {
  segments: Map<string, MonitoredSegment>;
  alertFails: boolean;
  monitorStates: Map<string, string>;
  pollResults: { incidentId: string | null; ended: boolean; failed?: boolean }[];
  ended: string[];
  troubled: string[];
  preTrip: string[];
  calls: string[];
}

const KEY = '__elsewhereWorkflowMemory';

export function memoryState(): MemoryState {
  const g = globalThis as unknown as Record<string, MemoryState | undefined>;
  g[KEY] ??= { segments: new Map(), alertFails: false, monitorStates: new Map(), pollResults: [], ended: [], troubled: [], preTrip: [], calls: [] };
  return g[KEY]!;
}

export function resetMemoryPorts(): void {
  (globalThis as unknown as Record<string, unknown>)[KEY] = undefined;
  memoryState();
}

export function memoryPorts(): WorkflowPorts {
  const state = memoryState();
  return {
    async listMonitorableSegmentIds(tripId) {
      state.calls.push(`list:${tripId}`);
      return [...state.segments.values()].filter((s) => s.tripId === tripId).map((s) => s.id);
    },
    async tripTiming(tripId) {
      const segments = [...state.segments.values()].filter((s) => s.tripId === tripId && s.scheduledOut);
      const firstDeparture = segments.map((s) => s.scheduledOut!).sort()[0] ?? null;
      return { firstDeparture, tripEnd: firstDeparture };
    },
    async preTripChecks(tripId) {
      state.preTrip.push(tripId);
    },
    async loadSegment(segmentId) {
      return state.segments.get(segmentId) ?? null;
    },
    async registerAlert(segment) {
      const result = state.alertFails ? 'polling_only' : 'monitoring';
      state.monitorStates.set(segment.id, result);
      return result;
    },
    async pollAndRecord(segmentId) {
      state.calls.push(`poll:${segmentId}`);
      return state.pollResults.shift() ?? { incidentId: null, ended: true };
    },
    async endSegment(segmentId) {
      state.ended.push(segmentId);
    },
    async flagMonitorTrouble(segmentId) {
      state.troubled.push(segmentId);
    },
  };
}
```

`apps/web/lib/workflows/live-ports.ts`:
```ts
import 'server-only';
import { runDocumentChecks } from '@/lib/documents/service';
import { appUrl, requireEnv } from '@/lib/env';
import { aeroApi, type AeroFlight } from '@/lib/flights/aeroapi';
import { recordFlightSnapshot } from '@/lib/monitor/record';
import { flightEnded, snapshotFromAero } from '@/lib/monitor/snapshot';
import { briefingNotice } from '@/lib/notify/templates';
import { queueNotifications } from '@/lib/notify/queue';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MonitoredSegment, WorkflowPorts } from './ports';

export function livePorts(): WorkflowPorts {
  const admin = createAdminClient();
  return {
    async listMonitorableSegmentIds(tripId) {
      const { data } = await admin
        .from('booking_segments')
        .select('id, bookings!inner(confirmed_at)')
        .eq('trip_id', tripId)
        .not('scheduled_out', 'is', null)
        .not('bookings.confirmed_at', 'is', null);
      return (data ?? []).map((s) => s.id as string);
    },
    async tripTiming(tripId) {
      const { data: trip } = await admin.from('trips').select('end_date').eq('id', tripId).single();
      const { data: first } = await admin.from('booking_segments').select('scheduled_out').eq('trip_id', tripId).not('scheduled_out', 'is', null).order('scheduled_out').limit(1).maybeSingle();
      return { firstDeparture: first?.scheduled_out ?? null, tripEnd: trip?.end_date ? `${trip.end_date}T23:59:59Z` : null };
    },
    async preTripChecks(tripId) {
      await runDocumentChecks(tripId);
      const { data: trip } = await admin.from('trips').select('name').eq('id', tripId).single();
      const { data: members } = await admin.from('trip_members').select('user_id').eq('trip_id', tripId);
      await queueNotifications({
        userIds: (members ?? []).map((m) => m.user_id),
        tripId,
        template: 'briefing',
        rendered: briefingNotice({ tripName: trip?.name ?? 'Your trip', url: `${appUrl()}/trips/${tripId}` }),
        urgent: false,
      });
    },
    async loadSegment(segmentId) {
      const { data: s } = await admin
        .from('booking_segments')
        .select('id, trip_id, carrier_iata, flight_number, origin_iata, destination_iata, departure_local, scheduled_out, scheduled_in, aeroapi_alert_id')
        .eq('id', segmentId)
        .maybeSingle();
      if (!s) return null;
      const segment: MonitoredSegment = {
        id: s.id,
        tripId: s.trip_id,
        ident: `${s.carrier_iata}${s.flight_number}`,
        departureDate: s.departure_local.slice(0, 10),
        originIata: s.origin_iata,
        destinationIata: s.destination_iata,
        scheduledOut: s.scheduled_out,
        scheduledIn: s.scheduled_in,
        alertId: s.aeroapi_alert_id,
      };
      return segment;
    },
    async registerAlert(segment) {
      if (segment.alertId) return 'monitoring';
      try {
        const api = await aeroApi();
        const alertId = await api.createAlert({
          ident: segment.ident,
          origin: segment.originIata,
          destination: segment.destinationIata,
          date: segment.departureDate,
          targetUrl: `${appUrl()}/api/webhooks/aeroapi/${requireEnv('AEROAPI_WEBHOOK_SECRET')}`,
        });
        await admin.from('booking_segments').update({ aeroapi_alert_id: alertId, monitor_state: 'monitoring' }).eq('id', segment.id);
        return 'monitoring';
      } catch (error) {
        console.error('alert registration failed; polling only', segment.id, error);
        await admin.from('booking_segments').update({ monitor_state: 'polling_only' }).eq('id', segment.id);
        return 'polling_only';
      }
    },
    async pollAndRecord(segmentId) {
      const { data: s } = await admin.from('booking_segments').select('carrier_iata, flight_number, scheduled_out').eq('id', segmentId).single();
      if (!s?.scheduled_out) return { incidentId: null, ended: false };
      const api = await aeroApi();
      const departure = new Date(s.scheduled_out);
      let flights: AeroFlight[];
      try {
        flights = await api.flights(
          `${s.carrier_iata}${s.flight_number}`,
          new Date(departure.getTime() - 12 * 3600_000).toISOString(),
          new Date(departure.getTime() + 36 * 3600_000).toISOString(),
        );
      } catch (error) {
        // AeroAPI is down or rate limiting: the workflow backs off and flags the segment if it persists.
        console.error('AeroAPI poll failed', segmentId, error);
        return { incidentId: null, ended: false, failed: true };
      }
      const flight = flights.find((f) => f.scheduled_out && Math.abs(new Date(f.scheduled_out).getTime() - departure.getTime()) < 6 * 3600_000);
      if (!flight) return { incidentId: null, ended: false };
      const snapshot = snapshotFromAero(flight);
      const { incidentId } = await recordFlightSnapshot(segmentId, snapshot, 'poll');
      return { incidentId, ended: flightEnded(snapshot) };
    },
    async endSegment(segmentId) {
      const { data: s } = await admin.from('booking_segments').select('aeroapi_alert_id').eq('id', segmentId).single();
      if (s?.aeroapi_alert_id) await (await aeroApi()).deleteAlert(s.aeroapi_alert_id).catch(() => undefined);
      await admin.from('booking_segments').update({ monitor_state: 'ended' }).eq('id', segmentId);
    },
    async flagMonitorTrouble(segmentId) {
      // /admin lists polling_only flights for a manual check until they end (Task 16).
      console.error('AeroAPI polling keeps failing', segmentId);
      await admin.from('booking_segments').update({ monitor_state: 'polling_only' }).eq('id', segmentId);
    },
  };
}
```

`apps/web/workflows/segment-monitor.ts`. Replace the stub:
```ts
import { createHook, sleep } from 'workflow';
import { workflowPorts } from '@/lib/workflows/ports';
import { segmentMonitorToken } from '@/lib/workflows/tokens';

const HOUR = 3600_000;
const MINUTE = 60_000;

export async function segmentMonitorWorkflow(segmentId: string) {
  'use workflow';
  // The token makes the run idempotent: a second start for the same segment exits.
  const claim = createHook({ token: segmentMonitorToken(segmentId) });
  if (await claim.getConflict()) return { segmentId, status: 'duplicate' as const, incidents: [] as string[] };

  const incidents: string[] = [];
  try {
    const segment = await loadSegmentStep(segmentId);
    if (!segment?.scheduledOut) return { segmentId, status: 'unresolved' as const, incidents };
    const state = await registerAlertStep(segmentId);

    const departure = new Date(segment.scheduledOut).getTime();
    const stopAt = new Date(segment.scheduledIn ?? segment.scheduledOut).getTime() + 6 * HOUR;
    const watchFrom = new Date(departure - 24 * HOUR);
    if (watchFrom.getTime() > Date.now()) await sleep(watchFrom);

    let failures = 0;
    while (Date.now() < stopAt) {
      const beforeDeparture = departure - Date.now();
      const interval = state === 'monitoring' ? (beforeDeparture > 6 * HOUR ? 6 * HOUR : HOUR) : beforeDeparture > 6 * HOUR ? 2 * HOUR : 30 * MINUTE;
      // After a failed poll, retry sooner: 5, 10, 20 minutes and so on, never later than the normal interval.
      const wait = failures === 0 ? interval : Math.min(5 * MINUTE * 2 ** (failures - 1), interval);
      await sleep(new Date(Date.now() + wait));
      const polled = await pollStep(segmentId);
      if (polled.failed) {
        failures += 1;
        if (failures === 3) await flagTroubleStep(segmentId);
        continue;
      }
      failures = 0;
      if (polled.incidentId) incidents.push(polled.incidentId);
      if (polled.ended) break;
    }
    await endStep(segmentId);
    return { segmentId, status: 'ended' as const, incidents };
  } finally {
    claim.dispose();
  }
}

async function loadSegmentStep(segmentId: string) {
  'use step';
  return (await workflowPorts()).loadSegment(segmentId);
}

async function registerAlertStep(segmentId: string) {
  'use step';
  const ports = await workflowPorts();
  const segment = await ports.loadSegment(segmentId);
  return segment ? ports.registerAlert(segment) : 'polling_only';
}

async function pollStep(segmentId: string) {
  'use step';
  return (await workflowPorts()).pollAndRecord(segmentId);
}

async function endStep(segmentId: string) {
  'use step';
  await (await workflowPorts()).endSegment(segmentId);
}

async function flagTroubleStep(segmentId: string) {
  'use step';
  await (await workflowPorts()).flagMonitorTrouble(segmentId);
}
```

`apps/web/workflows/trip-monitor.ts`:
```ts
import { sleep } from 'workflow';
import { start } from 'workflow/api';
import { workflowPorts } from '@/lib/workflows/ports';
import { segmentMonitorWorkflow } from './segment-monitor';

const DAY = 24 * 3600_000;

/** Started when a trip pass activates. Fans out one monitor per confirmed segment, briefs the group at T-72h, then ends after the trip. */
export async function tripMonitorWorkflow(tripId: string) {
  'use workflow';
  const segmentIds = await listSegmentsStep(tripId);
  for (const segmentId of segmentIds) await start(segmentMonitorWorkflow, [segmentId]);

  const timing = await timingStep(tripId);
  if (timing.firstDeparture) {
    const briefingAt = new Date(new Date(timing.firstDeparture).getTime() - 3 * DAY);
    if (briefingAt.getTime() > Date.now()) await sleep(briefingAt);
    await preTripStep(tripId);
  }
  if (timing.tripEnd) {
    const endAt = new Date(new Date(timing.tripEnd).getTime() + 7 * DAY);
    if (endAt.getTime() > Date.now()) await sleep(endAt);
  }
  return { tripId, segments: segmentIds.length };
}

async function listSegmentsStep(tripId: string) {
  'use step';
  return (await workflowPorts()).listMonitorableSegmentIds(tripId);
}

async function timingStep(tripId: string) {
  'use step';
  return (await workflowPorts()).tripTiming(tripId);
}

async function preTripStep(tripId: string) {
  'use step';
  await (await workflowPorts()).preTripChecks(tripId);
}
```

`apps/web/app/api/webhooks/aeroapi/[secret]/route.ts`:
```ts
import { timingSafeEqual } from 'node:crypto';
import { recordFlightSnapshot } from '@/lib/monitor/record';
import { snapshotFromAero } from '@/lib/monitor/snapshot';
import type { AeroFlight } from '@/lib/flights/aeroapi';
import { createAdminClient } from '@/lib/supabase/admin';

function secretMatches(given: string): boolean {
  const expected = Buffer.from(process.env.AEROAPI_WEBHOOK_SECRET ?? '');
  const actual = Buffer.from(given);
  return expected.length > 0 && expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request, { params }: { params: Promise<{ secret: string }> }): Promise<Response> {
  if (!secretMatches((await params).secret)) return new Response('not found', { status: 404 });
  const body = (await request.json()) as { alert_id: number; event_code: string; flight: AeroFlight };
  const admin = createAdminClient();
  const eventId = `${body.alert_id}:${body.event_code}:${body.flight.fa_flight_id}:${body.flight.estimated_in ?? body.flight.scheduled_in ?? ''}:${body.flight.cancelled}`;
  const { error: duplicate } = await admin.from('webhook_events').insert({ provider: 'aeroapi', event_id: eventId });
  if (duplicate?.code === '23505') return Response.json({ duplicate: eventId });

  const { data: segment } = await admin.from('booking_segments').select('id').eq('aeroapi_alert_id', String(body.alert_id)).maybeSingle();
  if (!segment) return Response.json({ ignored: 'unknown alert' });
  const { incidentId } = await recordFlightSnapshot(segment.id, snapshotFromAero(body.flight), 'alert');
  return Response.json({ incidentId });
}
```

Turn monitoring on:
1. In `apps/web/lib/bookings/confirm.ts`, collect the newly resolved segment ids. Return them when the trip pass is active. Before `return`:
   ```ts
   const { data: trip } = await admin.from('trips').select('pass_status').eq('id', tripId).single();
   const { data: ready } = await admin.from('booking_segments').select('id').in('booking_id', bookingIds).not('scheduled_out', 'is', null);
   const monitorSegmentIds = trip && trip.pass_status !== 'none' ? (ready ?? []).map((s) => s.id as string) : [];
   ```
   Then `return { monitorSegmentIds };`.
2. In `apps/web/app/api/webhooks/stripe/route.ts`, add `import { start } from 'workflow/api';` and `import { tripMonitorWorkflow } from '@/workflows/trip-monitor';`. After `handleStripeEvent`:
   ```ts
   if (outcome.kind === 'activated') await start(tripMonitorWorkflow, [outcome.tripId]);
   ```
   In C1's `test/payments/webhook-route.test.ts`, add `vi.mock('workflow/api', () => ({ start: async () => ({ runId: 'wrun_test' }) }));` and `vi.mock('@/workflows/trip-monitor', () => ({ tripMonitorWorkflow: async () => undefined }));`.

- [ ] **Step 6: Run the unit and integration tests, typecheck, and build**

```bash
cd apps/web && npx vitest run && npm run test:integration && npm run typecheck && npm run build; cd ../..
```
Expected: everything passes, and the build succeeds.

The plugin bundles steps with `apps/web/tsconfig.json`'s `paths`, so `@/` resolves inside step bundles. Memory-mode runs never load `live-ports.ts`, so no `server-only` module enters the test bundle.

- [ ] **Step 7: Commit**

```bash
git add apps/web package-lock.json
git commit -F - <<'EOF'
Watch every confirmed flight with alerts and durable polling

A trip pass starts one monitor run per confirmed segment, idempotent by
hook token. AeroAPI alerts are recorded directly. Polling is the safety
net: frequent when no alert could be registered, sparse when one was.
AeroAPI errors back off and, after three in a row, flag the flight for
/admin instead of ending its monitoring.
Snapshots open an incident only for a new cancellation, a diversion, or
a delay crossing a new band. The group gets a briefing three days out.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 10: From a flight event to rule facts, and the one question to ask

**Files:**
- Create: `apps/web/lib/assist/regions.ts`, `apps/web/lib/assist/carriers.ts`, `apps/web/lib/assist/situation.ts`, `apps/web/lib/assist/questions.ts`, `apps/web/test/assist/situation.test.ts`, `apps/web/test/assist/scenarios.test.ts`, `apps/web/test/assist/questions.test.ts`

**Interfaces:**
- Consumes: from `@elsewhere/rules`, `matchRules`, `MatchResult`, `Situation`, `Primitive`, and `Rule`, including the facts `flight.departs_us` and `flight.scheduled_duration_minutes` from Track A's Task 18 amendment. C1's fixture library.
- Produces:
  - **Region sets:** `US_JURISDICTION`, `EU261_SCOPE`, `UK`
  - **Carrier sets:** `US_CARRIERS`, `EU_CARRIERS`
  - **Situation:**
    - `SituationInput = { event: { type: 'cancellation' | 'delay' | 'schedule_change'; delayMinutes: number | null; detectedAt: string }; segment: { carrierIata; originCountry: string | null; destinationCountry: string | null; distanceKm: number | null; scheduledOut: string | null; scheduledIn: string | null }; booking: { bookedVia: string | null; segmentCount: number }; answers: Record<string, Primitive> }`
    - `buildSituation(input): Situation`
  - **Questions:**
    - `PlannerQuestion = { fact: string; prompt: string; options: { value: string; label: string }[] }`
    - `PlannerAnswer = { fact: string; value: string }`
    - `ASK_ORDER`
    - `nextQuestion(results, alreadyAsked): PlannerQuestion | null`
    - `answerValue(answer): Primitive`

- [ ] **Step 1: Write the failing tests**

`apps/web/test/assist/situation.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildSituation } from '@/lib/assist/situation';

describe('buildSituation', () => {
  it('fills every flight fact it can, including departs_us and scheduled duration', () => {
    expect(
      buildSituation({
        event: { type: 'cancellation', delayMinutes: null, detectedAt: '2026-11-01T12:00:00Z' },
        segment: { carrierIata: 'TP', originCountry: 'US', destinationCountry: 'PT', distanceKm: 5450, scheduledOut: '2026-11-03T23:15:00Z', scheduledIn: '2026-11-04T06:35:00Z' },
        booking: { bookedVia: 'Expedia', segmentCount: 1 },
        answers: { 'passenger.accepted_alternative': false },
      }),
    ).toEqual({
      'event.type': 'cancellation',
      'event.notice_days': 2,
      'flight.carrier_iata': 'TP',
      'flight.carrier_is_us': false,
      'flight.carrier_is_eu': true,
      'flight.departs_us': true,
      'flight.departs_eu': false,
      'flight.departs_uk': false,
      'flight.arrives_eu': true,
      'flight.touches_us': true,
      'flight.is_domestic_us': false,
      'flight.distance_km': 5450,
      'flight.scheduled_duration_minutes': 440,
      'trip.booked_via': 'ota',
      'passenger.accepted_alternative': false,
    });
  });

  it('leaves unknown facts out instead of guessing', () => {
    const situation = buildSituation({
      event: { type: 'delay', delayMinutes: 200, detectedAt: '2026-11-03T20:00:00Z' },
      segment: { carrierIata: 'UA', originCountry: null, destinationCountry: null, distanceKm: null, scheduledOut: null, scheduledIn: null },
      booking: { bookedVia: null, segmentCount: 2 },
      answers: {},
    });
    expect(situation).toEqual({
      'event.type': 'delay',
      'event.delay_minutes': 200,
      'flight.carrier_iata': 'UA',
      'flight.carrier_is_us': true,
      'flight.carrier_is_eu': false,
      'flight.single_ticket': true,
      'trip.booked_via': 'direct',
    });
  });
});
```

`apps/web/test/assist/scenarios.test.ts`. These are the old mock trip guides, ported as situation-to-expected-rules cases. The source is `git show archive/mobile-expo-2026-10:apps/api/lib/assist/mock-trip-guides.ts`.
```ts
import { matchRules, type Rule, type RulesLibrary } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { buildSituation, type SituationInput } from '@/lib/assist/situation';

// Incidents match flight and money rules only, the same filter assess() applies.
const rules = ((fixture as unknown as RulesLibrary).rules as Rule[]).filter((r) => r.domain === 'flights' || r.domain === 'money');
const at = '2026-11-01T12:00:00Z';

const scenarios: { name: string; input: SituationInput; applies: string[]; mayApply: string[] }[] = [
  {
    name: 'Tokyo: UA 875 SFO→HND cancelled, nobody took the rebooking',
    input: {
      event: { type: 'cancellation', delayMinutes: null, detectedAt: at },
      segment: { carrierIata: 'UA', originCountry: 'US', destinationCountry: 'JP', distanceKm: 8280, scheduledOut: '2026-11-21T18:00:00Z', scheduledIn: '2026-11-22T05:00:00Z' },
      booking: { bookedVia: null, segmentCount: 1 },
      answers: { 'passenger.accepted_alternative': false },
    },
    applies: ['fixture-us-refund-cancelled-flight'],
    // A cancellation has no delay length, so the 6-hour card benefit stays "may apply" (not askable).
    mayApply: ['fixture-card-trip-delay'],
  },
  {
    name: 'Paris: DL 8606 JFK→CDG four hours late on a US carrier',
    input: {
      event: { type: 'delay', delayMinutes: 240, detectedAt: at },
      segment: { carrierIata: 'DL', originCountry: 'US', destinationCountry: 'FR', distanceKm: 5840, scheduledOut: '2026-11-10T23:00:00Z', scheduledIn: '2026-11-11T06:30:00Z' },
      booking: { bookedVia: null, segmentCount: 1 },
      answers: {},
    },
    applies: [],
    mayApply: [],
  },
  {
    name: 'Santorini: A3 349 ATH→JTR over three hours late',
    input: {
      event: { type: 'delay', delayMinutes: 200, detectedAt: at },
      segment: { carrierIata: 'A3', originCountry: 'GR', destinationCountry: 'GR', distanceKm: 230, scheduledOut: '2026-11-05T09:00:00Z', scheduledIn: '2026-11-05T09:50:00Z' },
      booking: { bookedVia: null, segmentCount: 1 },
      answers: {},
    },
    applies: ['fixture-eu261-delay-compensation'],
    mayApply: [],
  },
  {
    name: 'Lisbon: TP 204 EWR→LIS cancelled, rebooking answer unknown',
    input: {
      event: { type: 'cancellation', delayMinutes: null, detectedAt: at },
      segment: { carrierIata: 'TP', originCountry: 'US', destinationCountry: 'PT', distanceKm: 5450, scheduledOut: '2026-11-03T23:15:00Z', scheduledIn: '2026-11-04T06:35:00Z' },
      booking: { bookedVia: null, segmentCount: 1 },
      answers: {},
    },
    applies: [],
    mayApply: ['fixture-card-trip-delay', 'fixture-eu261-delay-compensation', 'fixture-us-refund-cancelled-flight'],
  },
  {
    name: 'Bali: SQ 32 SIN→SFO nearly seven hours late on a two-leg ticket',
    input: {
      event: { type: 'delay', delayMinutes: 410, detectedAt: at },
      segment: { carrierIata: 'SQ', originCountry: 'SG', destinationCountry: 'US', distanceKm: 13590, scheduledOut: '2026-11-12T01:00:00Z', scheduledIn: '2026-11-12T16:00:00Z' },
      booking: { bookedVia: null, segmentCount: 2 },
      answers: {},
    },
    applies: ['fixture-card-trip-delay'],
    mayApply: [],
  },
];

describe('ported trip-guide scenarios', () => {
  for (const scenario of scenarios) {
    it(scenario.name, () => {
      const results = matchRules(rules, buildSituation(scenario.input), { statuses: ['verified'] });
      expect(results.filter((r) => r.outcome === 'applies').map((r) => r.rule_id).sort()).toEqual(scenario.applies);
      expect(results.filter((r) => r.outcome === 'may_apply').map((r) => r.rule_id).sort()).toEqual(scenario.mayApply);
    });
  }
});
```

`apps/web/test/assist/questions.test.ts`:
```ts
import type { MatchResult } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import { answerValue, nextQuestion } from '@/lib/assist/questions';

const mayApply = (rule_id: string, missing_facts: string[]): MatchResult =>
  ({ rule_id, rule_version: 1, outcome: 'may_apply', missing_facts }) as MatchResult;

describe('nextQuestion', () => {
  it('asks about the rebooking before the cause, and only about askable facts', () => {
    const results = [mayApply('a', ['event.delay_minutes']), mayApply('b', ['event.cause', 'passenger.accepted_alternative'])];
    expect(nextQuestion(results, [])?.fact).toBe('passenger.accepted_alternative');
    expect(nextQuestion(results, ['passenger.accepted_alternative'])?.fact).toBe('event.cause');
    expect(nextQuestion(results, ['passenger.accepted_alternative', 'event.cause'])).toBeNull();
  });

  it('asks nothing when nothing is uncertain', () => {
    expect(nextQuestion([{ rule_id: 'x', rule_version: 1, outcome: 'applies', missing_facts: [] } as MatchResult], [])).toBeNull();
  });
});

describe('answerValue', () => {
  it('turns yes/no answers into booleans', () => {
    expect(answerValue({ fact: 'passenger.accepted_alternative', value: 'false' })).toBe(false);
    expect(answerValue({ fact: 'event.cause', value: 'controllable' })).toBe('controllable');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/assist; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 3: Implement**

`apps/web/lib/assist/regions.ts`:
```ts
/** U.S. DOT rules cover flights to and from the U.S. and its territories. */
export const US_JURISDICTION = new Set(['US', 'PR', 'VI', 'GU', 'AS', 'MP']);

/** EU261's territorial scope: the 27 EU states plus Iceland, Norway, Liechtenstein, and Switzerland. */
export const EU261_SCOPE = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'NO', 'LI', 'CH',
]);

export const UK = new Set(['GB']);
```

`apps/web/lib/assist/carriers.ts`:
```ts
/** U.S. carriers, including regionals that operate for them. Extend by PR when a new code shows up in intake. */
export const US_CARRIERS = new Set([
  'AA', 'AS', 'B6', 'DL', 'F9', 'G4', 'HA', 'NK', 'SY', 'UA', 'WN', 'MX', 'XP',
  'QX', 'OO', 'YX', '9E', 'MQ', 'OH', 'YV', 'ZW', 'PT', 'G7', 'C5', 'AX', 'EM',
]);

/** Community carriers for EU261 that U.S. travelers fly most. Extend by PR. */
export const EU_CARRIERS = new Set([
  'A3', 'AF', 'AY', 'AZ', 'BT', 'DE', 'DY', 'D8', 'EI', 'EN', 'EW', 'FR', 'HV', 'IB', 'KL', 'LG', 'LH',
  'LO', 'LX', 'OK', 'OS', 'RO', 'SK', 'SN', 'TP', 'U2', 'UX', 'V7', 'VY', 'W6', 'X3', '4Y',
]);
```

`apps/web/lib/assist/situation.ts`:
```ts
import type { Primitive, Situation } from '@elsewhere/rules/core';
import { EU_CARRIERS, US_CARRIERS } from './carriers';
import { EU261_SCOPE, UK, US_JURISDICTION } from './regions';

export interface SituationInput {
  event: { type: 'cancellation' | 'delay' | 'schedule_change'; delayMinutes: number | null; detectedAt: string };
  segment: {
    carrierIata: string;
    originCountry: string | null;
    destinationCountry: string | null;
    distanceKm: number | null;
    scheduledOut: string | null;
    scheduledIn: string | null;
  };
  booking: { bookedVia: string | null; segmentCount: number };
  answers: Record<string, Primitive>;
}

const DAY = 24 * 60 * 60 * 1000;

/** A fact is set only when we know it, so matchRules reports "may apply, needs X" rather than a wrong answer. */
export function buildSituation(input: SituationInput): Situation {
  const s: Record<string, Primitive> = {
    'event.type': input.event.type,
    'flight.carrier_iata': input.segment.carrierIata,
    'flight.carrier_is_us': US_CARRIERS.has(input.segment.carrierIata),
    'flight.carrier_is_eu': EU_CARRIERS.has(input.segment.carrierIata),
    'trip.booked_via': input.booking.bookedVia ? 'ota' : 'direct',
  };
  if (input.event.delayMinutes !== null) s['event.delay_minutes'] = input.event.delayMinutes;
  if (input.segment.scheduledOut) {
    s['event.notice_days'] = Math.max(0, Math.floor((new Date(input.segment.scheduledOut).getTime() - new Date(input.event.detectedAt).getTime()) / DAY));
  }
  const { originCountry: origin, destinationCountry: destination } = input.segment;
  if (origin) {
    s['flight.departs_us'] = US_JURISDICTION.has(origin);
    s['flight.departs_eu'] = EU261_SCOPE.has(origin);
    s['flight.departs_uk'] = UK.has(origin);
  }
  if (destination) s['flight.arrives_eu'] = EU261_SCOPE.has(destination);
  if (origin && destination) {
    s['flight.touches_us'] = US_JURISDICTION.has(origin) || US_JURISDICTION.has(destination);
    s['flight.is_domestic_us'] = US_JURISDICTION.has(origin) && US_JURISDICTION.has(destination);
  }
  if (input.segment.distanceKm !== null) s['flight.distance_km'] = input.segment.distanceKm;
  if (input.segment.scheduledOut && input.segment.scheduledIn) {
    s['flight.scheduled_duration_minutes'] = Math.round((new Date(input.segment.scheduledIn).getTime() - new Date(input.segment.scheduledOut).getTime()) / 60000);
  }
  if (input.booking.segmentCount > 1) s['flight.single_ticket'] = true;
  for (const [fact, value] of Object.entries(input.answers)) s[fact] = value;
  return s as Situation;
}
```

`apps/web/lib/assist/questions.ts`:
```ts
import type { MatchResult, Primitive } from '@elsewhere/rules/core';

export interface PlannerQuestion {
  fact: string;
  prompt: string;
  options: { value: string; label: string }[];
}

export interface PlannerAnswer {
  fact: string;
  value: string;
}

const ASKABLE: Record<string, Omit<PlannerQuestion, 'fact'>> = {
  'passenger.accepted_alternative': {
    prompt: 'Did anyone accept the airline’s new flight or a travel credit?',
    options: [
      { value: 'false', label: 'No, not yet' },
      { value: 'true', label: 'Yes, we accepted it' },
    ],
  },
  'event.cause': {
    prompt: 'Did the airline say why? Pick the closest.',
    options: [
      { value: 'controllable', label: 'Crew, maintenance, or another airline problem' },
      { value: 'uncontrollable', label: 'Weather, air traffic control, or security' },
      { value: 'unknown', label: 'They didn’t say' },
    ],
  },
};

/** The planner gets one question at a time, in this order, and only for facts a traveler can answer. */
export const ASK_ORDER = ['passenger.accepted_alternative', 'event.cause'] as const;

export function nextQuestion(results: MatchResult[], alreadyAsked: string[]): PlannerQuestion | null {
  const missing = new Set(results.filter((r) => r.outcome === 'may_apply').flatMap((r) => r.missing_facts as string[]));
  const fact = ASK_ORDER.find((f) => missing.has(f) && !alreadyAsked.includes(f));
  return fact ? { fact, ...ASKABLE[fact] } : null;
}

export function answerValue(answer: PlannerAnswer): Primitive {
  if (answer.value === 'true') return true;
  if (answer.value === 'false') return false;
  return answer.value;
}
```

- [ ] **Step 4: Run the tests**

```bash
cd apps/web && npx vitest run test/assist; cd ../..
```
Expected: PASS. The Lisbon scenario's three `may_apply` rules confirm the three-valued matcher behaves as C2 expects:
- **The refund rule** is missing `passenger.accepted_alternative`, which is askable.
- **EU261 and the card benefit** are missing `event.delay_minutes`, because a cancellation has none. That fact isn't askable, so those rules stay out of the playbook.

The test sorts the IDs, so order does not matter.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -F - <<'EOF'
Turn flight events into rule facts and pick one question to ask

A cancellation or delay plus the segment's countries, carrier, distance,
and duration becomes the situation the rules match on, and unknowns stay
unknown. The old mock trip guides are now five fixture scenarios. When a
rule may apply because a traveler-answerable fact is missing, the
planner gets exactly one question, rebooking first.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 11: Cited playbooks — generation, the deterministic citation check, and the template fallback

**Files:**
- Create: `apps/web/lib/assist/playbook-schema.ts`, `apps/web/lib/assist/citation-check.ts`, `apps/web/lib/assist/template.ts`, `apps/web/lib/assist/playbook.ts`, `apps/web/test/assist/citation-check.test.ts`, `apps/web/test/assist/playbook.test.ts`

**Interfaces:**
- Consumes: `model('playbook')` and `NO_TRAINING` (Task 3), `mockModel` (Task 3's test helper), and the C1 fixture library.
- Produces:
  - **Schema:**
    - `PlaybookSchema`
    - `Playbook = { summary: string; owed: { text; rule_ids: string[] }[]; steps: { text; rule_ids: string[] }[]; messages: { to: 'airline' | 'hotel' | 'ota' | 'group'; channel: 'email' | 'chat' | 'phone' | 'in_person'; body; rule_ids: string[] }[]; caveats: string[] }`
  - **Citation check:**
    - `CitationIssue = { path: string; problem: 'missing_rule_id' | 'rule_not_allowed' | 'number_not_in_rule'; detail: string }`
    - `checkCitations(playbook, allowed: Rule[], extraNumbers?: string[]): CitationIssue[]`
  - **Fallback:** `templatePlaybook({ eventSummary, applying, reviewing }): Playbook`
  - **Generation:**
    - `PlaybookInput = { eventSummary: string; situation: Situation; applying: Rule[]; reviewing: Rule[]; extraNumbers: string[] }`
    - `PlaybookResult = { playbook: Playbook; model: string; citationCheckPassed: boolean; rulesCited: { rule_id: string; rule_version: number }[] }`
    - `generatePlaybook(input, opts?: { model?: LanguageModel }): Promise<PlaybookResult>`

The citation check matches every money amount and every duration in an `owed` item or a drafted message against numbers that appear in the cited rules' verified text: the title, summary, entitlement amounts, timing, steps, and exceptions. It also accepts the incident's own numbers, `extraNumbers`, such as the delay in hours. This is how "an amount or deadline that differs from the rule" gets caught. Flight numbers and dates are not amounts or durations, so they are never flagged.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/assist/citation-check.test.ts`:
```ts
import type { Rule, RulesLibrary } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { checkCitations } from '@/lib/assist/citation-check';
import type { Playbook } from '@/lib/assist/playbook-schema';

const rules = (fixture as unknown as RulesLibrary).rules as Rule[];
const eu = rules.find((r) => r.id === 'fixture-eu261-delay-compensation')!;
const refund = rules.find((r) => r.id === 'fixture-us-refund-cancelled-flight')!;

const base: Playbook = {
  summary: 'A3 349 landed 3 hours 20 minutes late.',
  owed: [{ text: 'Up to €250 in compensation, paid within 7 days of a valid claim.', rule_ids: [eu.id] }],
  steps: [{ text: 'Write to Aegean today.', rule_ids: [] }],
  messages: [{ to: 'airline', channel: 'email', body: 'Flight A3 349 on Nov 5 arrived 3 hours late. Please pay EU261 compensation of €250.', rule_ids: [eu.id] }],
  caveats: [],
};

describe('checkCitations', () => {
  it('passes amounts and durations that come from the cited rule or the incident', () => {
    expect(checkCitations(base, [eu], ['3'])).toEqual([]);
  });

  it('fails an owed item without a rule id', () => {
    const issues = checkCitations({ ...base, owed: [{ text: 'Compensation.', rule_ids: [] }] }, [eu], ['3']);
    expect(issues).toContainEqual(expect.objectContaining({ path: 'owed[0]', problem: 'missing_rule_id' }));
  });

  it('fails a citation to a rule outside the verified matched set', () => {
    const issues = checkCitations(base, [refund], ['3']);
    expect(issues.some((i) => i.problem === 'rule_not_allowed' && i.detail === eu.id)).toBe(true);
  });

  it('fails an amount that is not in the rule', () => {
    const issues = checkCitations({ ...base, owed: [{ text: 'You are owed €800.', rule_ids: [eu.id] }] }, [eu], ['3']);
    expect(issues).toContainEqual({ path: 'owed[0]', problem: 'number_not_in_rule', detail: '800' });
  });

  it('fails a deadline that is not in the rule', () => {
    const issues = checkCitations({ ...base, messages: [{ ...base.messages[0], body: 'Pay within 30 days.' }] }, [eu], ['3']);
    expect(issues).toContainEqual({ path: 'messages[0]', problem: 'number_not_in_rule', detail: '30' });
  });
});
```

`apps/web/test/assist/playbook.test.ts`:
```ts
import type { Rule, RulesLibrary } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { generatePlaybook } from '@/lib/assist/playbook';
import { mockModel } from '../helpers/mock-model';

const rules = (fixture as unknown as RulesLibrary).rules as Rule[];
const refund = rules.find((r) => r.id === 'fixture-us-refund-cancelled-flight')!;
const tarmac = rules.find((r) => r.id === 'fixture-tarmac-delay')!;

const input = {
  eventSummary: 'TP 204 from EWR on Nov 3 was cancelled.',
  situation: { 'event.type': 'cancellation' as const },
  applying: [refund],
  reviewing: [tarmac],
  extraNumbers: [],
};

const good = {
  summary: 'Your TP 204 flight was cancelled. You can take a cash refund instead of a voucher.',
  owed: [{ text: 'A refund to your original payment method, within 7 business days for card purchases.', rule_ids: [refund.id] }],
  steps: [{ text: 'Decline the voucher.', rule_ids: [refund.id] }],
  messages: [{ to: 'airline', channel: 'email', body: 'TP 204 on Nov 3 was cancelled. I decline the rebooking and request a refund to my original payment method.', rule_ids: [refund.id] }],
  caveats: ['“Stuck on the tarmac? There are time limits” is being re-checked, so we left it out.'],
};

describe('generatePlaybook', () => {
  it('returns a cited playbook that passes the check', async () => {
    const result = await generatePlaybook(input, { model: mockModel(good) });
    expect(result.citationCheckPassed).toBe(true);
    expect(result.model).not.toBe('template');
    expect(result.rulesCited).toEqual([{ rule_id: refund.id, rule_version: 1 }]);
  });

  it('retries once when the first draft invents an amount', async () => {
    const bad = { ...good, owed: [{ text: 'You are owed $500 cash.', rule_ids: [refund.id] }] };
    const model = mockModel(bad, good);
    const result = await generatePlaybook(input, { model });
    expect(result.playbook.owed[0].text).toContain('original payment method');
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(model.doGenerateCalls[1].providerOptions).toEqual({ gateway: { disallowPromptTraining: true } });
  });

  it('falls back to the template after two failed drafts', async () => {
    const bad = { ...good, owed: [{ text: 'You are owed $500 cash.', rule_ids: [refund.id] }] };
    const result = await generatePlaybook(input, { model: mockModel(bad, bad) });
    expect(result.model).toBe('template');
    expect(result.playbook.owed).toEqual([{ text: refund.summary, rule_ids: [refund.id] }]);
    expect(result.playbook.caveats[0]).toContain('being re-checked');
  });

  it('uses the template when no verified rule applies', async () => {
    const result = await generatePlaybook({ ...input, applying: [] }, { model: mockModel(good) });
    expect(result.model).toBe('template');
    expect(result.playbook.owed).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/assist/citation-check.test.ts test/assist/playbook.test.ts; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 3: Implement**

`apps/web/lib/assist/playbook-schema.ts`:
```ts
import { z } from 'zod';

const Cited = z.object({ text: z.string(), rule_ids: z.array(z.string()) });

export const PlaybookSchema = z.object({
  summary: z.string().describe('Two sentences at most: what happened and the headline of what you can do.'),
  owed: z.array(Cited).describe('What the travelers are owed. Every item cites the rule ids it comes from.'),
  steps: z.array(Cited).describe('What to do, in order.'),
  messages: z
    .array(
      z.object({
        to: z.enum(['airline', 'hotel', 'ota', 'group']),
        channel: z.enum(['email', 'chat', 'phone', 'in_person']),
        body: z.string(),
        rule_ids: z.array(z.string()),
      }),
    )
    .describe('Messages we drafted for the travelers to send themselves.'),
  caveats: z.array(z.string()),
});

export type Playbook = z.infer<typeof PlaybookSchema>;
```

`apps/web/lib/assist/citation-check.ts`:
```ts
import type { Rule } from '@elsewhere/rules/core';
import type { Playbook } from './playbook-schema';

export interface CitationIssue {
  path: string;
  problem: 'missing_rule_id' | 'rule_not_allowed' | 'number_not_in_rule';
  detail: string;
}

const MONEY = /[$€£]\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(?:USD|EUR|GBP|dollars?|euros?|pounds?)\b/gi;
const DURATION = /(\d+(?:\.\d+)?)\s*(?:business\s+)?(?:days?|hours?|hrs?|minutes?|mins?|weeks?|months?)\b/gi;

function normalize(n: string): string {
  return String(Number(n.replace(/,/g, '')));
}

/** Money amounts and durations only. Flight numbers, dates, and codes are never treated as claims. */
export function claimNumbers(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(MONEY)) found.push(normalize(match[1] ?? match[2]));
  for (const match of text.matchAll(DURATION)) found.push(normalize(match[1]));
  return found;
}

function ruleNumbers(rule: Rule): string[] {
  const text = [rule.title, rule.summary, rule.entitlement.timing ?? '', ...rule.how_to_claim.steps, ...rule.exceptions].join(' ');
  const fromText = [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => normalize(m[0]));
  const fromAmounts = Object.values(rule.entitlement.amount ?? {})
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .flatMap((v) => (typeof v === 'number' ? [String(v)] : typeof v === 'string' ? [...v.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => normalize(m[0])) : []));
  return [...fromText, ...fromAmounts];
}

export function checkCitations(playbook: Playbook, allowed: Rule[], extraNumbers: string[] = []): CitationIssue[] {
  const allowedById = new Map(allowed.map((rule) => [rule.id, rule]));
  const issues: CitationIssue[] = [];

  const check = (path: string, ruleIds: string[], text: string, claim: boolean) => {
    if (claim && ruleIds.length === 0) issues.push({ path, problem: 'missing_rule_id', detail: text.slice(0, 80) });
    for (const id of ruleIds) if (!allowedById.has(id)) issues.push({ path, problem: 'rule_not_allowed', detail: id });
    if (!claim) return;
    const permitted = new Set([...extraNumbers.map(normalize), ...ruleIds.flatMap((id) => (allowedById.has(id) ? ruleNumbers(allowedById.get(id)!) : []))]);
    for (const n of claimNumbers(text)) if (!permitted.has(n)) issues.push({ path, problem: 'number_not_in_rule', detail: n });
  };

  playbook.owed.forEach((item, i) => check(`owed[${i}]`, item.rule_ids, item.text, true));
  playbook.messages.forEach((message, i) => check(`messages[${i}]`, message.rule_ids, message.body, true));
  playbook.steps.forEach((step, i) => check(`steps[${i}]`, step.rule_ids, step.text, false));
  return issues;
}
```

`apps/web/lib/assist/template.ts`:
```ts
import type { Rule } from '@elsewhere/rules/core';
import type { Playbook } from './playbook-schema';

/** Built only from verified rule text, so it needs no citation check. */
export function templatePlaybook({ eventSummary, applying, reviewing }: { eventSummary: string; applying: Rule[]; reviewing: Rule[] }): Playbook {
  return {
    summary: eventSummary,
    owed: applying.map((rule) => ({ text: rule.summary, rule_ids: [rule.id] })),
    steps: applying.flatMap((rule) => rule.how_to_claim.steps.map((text) => ({ text, rule_ids: [rule.id] }))),
    messages: [],
    caveats: [
      ...reviewing.map((rule) => `“${rule.title}” may also apply, but it’s being re-checked, so we left it out for now.`),
      ...(applying.length === 0 ? ['None of the rules we track clearly applies to this yet.'] : []),
      'We drafted this from the rules linked below. Check the airline’s own notice too.',
    ],
  };
}
```

`apps/web/lib/assist/playbook.ts`:
```ts
import 'server-only';
import type { Rule, Situation } from '@elsewhere/rules/core';
import { generateText, Output, type LanguageModel } from 'ai';
import { model as defaultModel, NO_TRAINING } from '@/lib/ai/models';
import { checkCitations } from './citation-check';
import { PlaybookSchema, type Playbook } from './playbook-schema';
import { templatePlaybook } from './template';

export interface PlaybookInput {
  eventSummary: string;
  situation: Situation;
  applying: Rule[];
  reviewing: Rule[];
  extraNumbers: string[];
}

export interface PlaybookResult {
  playbook: Playbook;
  model: string;
  citationCheckPassed: boolean;
  rulesCited: { rule_id: string; rule_version: number }[];
}

const INSTRUCTIONS = `You draft a short, calm playbook for travelers whose flight was disrupted.
Use ONLY the rules provided. Every item in "owed" and every drafted message must list the ids of the rules it relies on.
Never state an amount, a deadline, or a duration that is not written in the cited rule, or in the incident facts given.
Write as "we drafted"; the travelers decide and send. Never say anything was filed, booked, or requested on their behalf.
Draft messages the travelers can paste: to the airline, the booking site, the hotel, or the group chat.
If a rule is listed as being re-checked, mention it only in caveats, as "being re-checked".`;

function rulesForPrompt(rules: Rule[]) {
  return rules.map((rule) => ({
    id: rule.id,
    title: rule.title,
    summary: rule.summary,
    entitlement: rule.entitlement,
    how_to_claim: rule.how_to_claim.steps,
    exceptions: rule.exceptions,
  }));
}

function cited(playbook: Playbook, rules: Rule[]) {
  const ids = new Set([...playbook.owed, ...playbook.steps, ...playbook.messages].flatMap((item) => item.rule_ids));
  return rules.filter((rule) => ids.has(rule.id)).map((rule) => ({ rule_id: rule.id, rule_version: rule.version }));
}

export async function generatePlaybook(input: PlaybookInput, opts: { model?: LanguageModel } = {}): Promise<PlaybookResult> {
  const fallback = (): PlaybookResult => ({
    playbook: templatePlaybook(input),
    model: 'template',
    citationCheckPassed: true,
    rulesCited: input.applying.map((rule) => ({ rule_id: rule.id, rule_version: rule.version })),
  });
  if (input.applying.length === 0) return fallback();

  const lm = opts.model ?? (await defaultModel('playbook'));
  const modelId = typeof lm === 'string' ? lm : lm.modelId;
  let feedback = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { output } = await generateText({
      model: lm,
      output: Output.object({ schema: PlaybookSchema, name: 'playbook' }),
      instructions: INSTRUCTIONS,
      prompt: JSON.stringify({
        what_happened: input.eventSummary,
        facts: input.situation,
        incident_numbers: input.extraNumbers,
        rules_that_apply: rulesForPrompt(input.applying),
        rules_being_rechecked: input.reviewing.map((rule) => rule.title),
        ...(feedback ? { fix_these_problems_from_your_last_draft: feedback } : {}),
      }),
      providerOptions: NO_TRAINING,
    });
    const issues = checkCitations(output, input.applying, input.extraNumbers);
    if (issues.length === 0) return { playbook: output, model: modelId, citationCheckPassed: true, rulesCited: cited(output, input.applying) };
    feedback = issues.map((issue) => `${issue.path}: ${issue.problem} (${issue.detail})`).join('\n');
  }
  return fallback();
}
```

- [ ] **Step 4: Run the tests**

```bash
cd apps/web && npx vitest run test/assist; cd ../..
```
Expected: PASS. In the "good" playbook, "7 business days" is allowed because `7` appears in the refund rule's `timing`.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -F - <<'EOF'
Draft cited playbooks behind a deterministic citation check

Claude Sonnet drafts what the travelers are owed, the steps, and the
messages they can send, from verified matched rules only. A
deterministic check fails any claim without a rule id, any citation
outside the matched set, and any amount or deadline not found in the
cited rule. One retry, then a template built from the rules' own text.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 12: The incident workflow, the incident page, and answering the planner's question

**Files:**
- Create: `apps/web/lib/assist/assess.ts`, `apps/web/lib/assist/incidents.ts`, `apps/web/workflows/incident.ts`, `apps/web/app/trips/[id]/incidents/[incidentId]/page.tsx`, `apps/web/app/trips/[id]/incidents/[incidentId]/actions.ts`, `apps/web/test/assist/assess.test.ts`, `apps/web/test/workflows/incident.integration.test.ts`
- Modify: `apps/web/lib/workflows/ports.ts`, `apps/web/lib/workflows/live-ports.ts`, `apps/web/lib/workflows/memory-ports.ts` (incident operations), `apps/web/workflows/segment-monitor.ts` and `apps/web/app/api/webhooks/aeroapi/[secret]/route.ts` (start the incident workflow)

**Interfaces:**
- Consumes:
  - Task 10: `buildSituation`, `nextQuestion`, `answerValue`
  - Task 11: `generatePlaybook`, `PlaybookSchema`
  - Task 2: `queueNotifications`, `incidentNotice`, `questionNotice`, `reviewHoldNotice`
  - Task 9: tokens and ports
  - `getLibrary()`, `matchRules`
- Produces:
  - **Assessment** (`lib/assist/assess.ts`, pure):
    - `AssessmentInput = { incident; segment; booking; asked: string[]; rules: Rule[] }`
    - `Assessment = { situation; applying: Rule[]; reviewing: Rule[]; question: PlannerQuestion | null; eventSummary; extraNumbers: string[] }`, which `generatePlaybook` accepts as its `PlaybookInput`
    - `assess(input): Assessment`
    - `summarizeEvent({ carrierIata, flightNumber, originIata, departureLocal, eventType, delayMinutes }): string`
    - `incidentNumbers(delayMinutes): string[]`
  - **Loading** (`lib/assist/incidents.ts`): `assessIncident(incidentId): Promise<Assessment & { tripId; tripName; affectedUserIds: string[]; passStatus: string }>`
  - **Incident operations** (`lib/assist/incidents.ts`):
    - `askPlanner(incidentId, question)`
    - `recordAnswer(incidentId, answer | null)`
    - `savePlaybook(incidentId): Promise<string>`
    - `needsReview(incidentId): Promise<boolean>`, true for comped, hand-run trips
    - `requestReview(incidentId)`
    - `notifyAffected(incidentId)`
  - **`WorkflowPorts` gains:**
    - `assessIncident(id): Promise<{ question: PlannerQuestion | null }>`
    - `askPlanner(id, q)`
    - `recordAnswer(id, a | null)`
    - `generatePlaybook(id): Promise<{ playbookId: string }>`
    - `needsReview(id): Promise<boolean>`
    - `requestReview(id)`
    - `notifyAffected(id)`
  - **Workflow:** `incidentWorkflow(incidentId)`
  - **Server actions:** `answerQuestion(tripId, incidentId, fact, value)`

- [ ] **Step 1: Write the failing tests**

`apps/web/test/assist/assess.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { incidentNumbers, summarizeEvent } from '@/lib/assist/assess';

describe('summarizeEvent', () => {
  it('says what happened in one line', () => {
    expect(summarizeEvent({ carrierIata: 'TP', flightNumber: '204', originIata: 'EWR', departureLocal: '2026-11-03T18:15', eventType: 'cancellation', delayMinutes: null })).toBe(
      'TP 204 from EWR on Nov 3 was cancelled.',
    );
    expect(summarizeEvent({ carrierIata: 'A3', flightNumber: '349', originIata: 'ATH', departureLocal: '2026-11-05T11:00', eventType: 'delay', delayMinutes: 200 })).toBe(
      'A3 349 from ATH on Nov 5 is running 3 h 20 min late.',
    );
  });
});

describe('incidentNumbers', () => {
  it('offers the delay in whole hours and minutes for the citation check', () => {
    expect(incidentNumbers(200)).toEqual(['200', '3']);
    expect(incidentNumbers(null)).toEqual([]);
  });
});
```

`apps/web/test/workflows/incident.integration.test.ts`:
```ts
import { getRun, resumeHook, start } from 'workflow/api';
import { waitForHook, waitForSleep } from '@workflow/vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { memoryState, resetMemoryPorts } from '@/lib/workflows/memory-ports';
import { incidentAnswerToken, incidentReleaseToken } from '@/lib/workflows/tokens';
import { incidentWorkflow } from '@/workflows/incident';

beforeEach(() => resetMemoryPorts());

describe('incidentWorkflow', () => {
  it('asks the planner, waits for the answer, drafts the playbook, and notifies', async () => {
    const state = memoryState();
    state.questions.set('inc-1', { fact: 'passenger.accepted_alternative', prompt: 'Did anyone accept?', options: [] });
    const run = await start(incidentWorkflow, ['inc-1']);
    await waitForHook(run, { token: incidentAnswerToken('inc-1') });
    await resumeHook(incidentAnswerToken('inc-1'), { fact: 'passenger.accepted_alternative', value: 'false' });
    expect(await run.returnValue).toEqual({ incidentId: 'inc-1', playbookId: 'pb-inc-1' });
    expect(state.answers.get('inc-1')).toEqual({ fact: 'passenger.accepted_alternative', value: 'false' });
    expect(state.notified).toEqual(['inc-1']);
  });

  it('drafts without an answer after six hours', async () => {
    const state = memoryState();
    state.questions.set('inc-2', { fact: 'event.cause', prompt: 'Why?', options: [] });
    const run = await start(incidentWorkflow, ['inc-2']);
    const sleepId = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });
    await run.returnValue;
    expect(state.answers.get('inc-2')).toBeNull();
    expect(state.notified).toEqual(['inc-2']);
  });

  it('holds a hand-run trip’s playbook for review until released', async () => {
    const state = memoryState();
    state.reviewed.add('inc-3');
    const run = await start(incidentWorkflow, ['inc-3']);
    await waitForHook(run, { token: incidentReleaseToken('inc-3') });
    expect(state.reviewRequested).toEqual(['inc-3']);
    expect(state.notified).toEqual([]);
    await resumeHook(incidentReleaseToken('inc-3'), { releasedBy: 'founder' });
    await run.returnValue;
    expect(state.notified).toEqual(['inc-3']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/assist/assess.test.ts && npm run test:integration; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 3: Implement assessment and incident operations**

`apps/web/lib/assist/assess.ts`:
```ts
import { matchRules, type Primitive, type Rule, type Situation } from '@elsewhere/rules/core';
import { nextQuestion, type PlannerQuestion } from './questions';
import { buildSituation } from './situation';

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function summarizeEvent(e: { carrierIata: string; flightNumber: string; originIata: string; departureLocal: string; eventType: string; delayMinutes: number | null }): string {
  const flight = `${e.carrierIata} ${e.flightNumber} from ${e.originIata} on ${day.format(new Date(`${e.departureLocal.slice(0, 10)}T00:00:00Z`))}`;
  if (e.eventType === 'cancellation') return `${flight} was cancelled.`;
  if (e.eventType === 'schedule_change') return `${flight} was diverted or changed.`;
  const minutes = e.delayMinutes ?? 0;
  return `${flight} is running ${Math.floor(minutes / 60)} h ${minutes % 60} min late.`;
}

export function incidentNumbers(delayMinutes: number | null): string[] {
  return delayMinutes === null ? [] : [String(delayMinutes), String(Math.floor(delayMinutes / 60))];
}

export interface AssessmentInput {
  incident: { id: string; event_type: 'cancellation' | 'delay' | 'schedule_change'; delay_minutes: number | null; detected_at: string; facts: Record<string, Primitive> };
  segment: { carrier_iata: string; flight_number: string; origin_iata: string; departure_local: string; origin_country: string | null; destination_country: string | null; distance_km: number | null; scheduled_out: string | null; scheduled_in: string | null };
  booking: { booked_via: string | null; segment_count: number };
  asked: string[];
  rules: Rule[];
}

export interface Assessment {
  situation: Situation;
  applying: Rule[];
  reviewing: Rule[];
  question: PlannerQuestion | null;
  eventSummary: string;
  extraNumbers: string[];
}

/** Pure: everything an incident needs, from loaded rows. */
export function assess(input: AssessmentInput): Assessment {
  const situation = buildSituation({
    event: { type: input.incident.event_type, delayMinutes: input.incident.delay_minutes, detectedAt: input.incident.detected_at },
    segment: {
      carrierIata: input.segment.carrier_iata,
      originCountry: input.segment.origin_country,
      destinationCountry: input.segment.destination_country,
      distanceKm: input.segment.distance_km,
      scheduledOut: input.segment.scheduled_out,
      scheduledIn: input.segment.scheduled_in,
    },
    booking: { bookedVia: input.booking.booked_via, segmentCount: input.booking.segment_count },
    answers: input.incident.facts,
  });
  const relevant = input.rules.filter((rule) => rule.domain === 'flights' || rule.domain === 'money');
  const verifiedResults = matchRules(relevant, situation, { statuses: ['verified'] });
  const reviewResults = matchRules(relevant, situation, { statuses: ['needs_review'] });
  const byId = new Map(relevant.map((rule) => [rule.id, rule]));
  return {
    situation,
    applying: verifiedResults.filter((r) => r.outcome === 'applies').map((r) => byId.get(r.rule_id)!),
    reviewing: reviewResults.map((r) => byId.get(r.rule_id)!),
    question: nextQuestion(verifiedResults, input.asked),
    eventSummary: summarizeEvent({
      carrierIata: input.segment.carrier_iata,
      flightNumber: input.segment.flight_number,
      originIata: input.segment.origin_iata,
      departureLocal: input.segment.departure_local,
      eventType: input.incident.event_type,
      delayMinutes: input.incident.delay_minutes,
    }),
    extraNumbers: incidentNumbers(input.incident.delay_minutes),
  };
}
```

Add a pure test for `assess` to `apps/web/test/assist/assess.test.ts`, using the C1 fixture library:
```ts
import type { Rule, RulesLibrary } from '@elsewhere/rules/core';
import fixture from '../fixtures/rules-library.json';
import { assess } from '@/lib/assist/assess';

describe('assess', () => {
  const rules = (fixture as unknown as RulesLibrary).rules as Rule[];
  const base = {
    incident: { id: 'inc', event_type: 'cancellation' as const, delay_minutes: null, detected_at: '2026-11-01T12:00:00Z', facts: {} },
    segment: { carrier_iata: 'TP', flight_number: '204', origin_iata: 'EWR', departure_local: '2026-11-03T18:15', origin_country: 'US', destination_country: 'PT', distance_km: 5450, scheduled_out: '2026-11-03T23:15:00Z', scheduled_in: '2026-11-04T06:35:00Z' },
    booking: { booked_via: null, segment_count: 1 },
    asked: [],
    rules,
  };

  it('asks about the rebooking first, then applies the refund rule once answered', () => {
    expect(assess(base).question?.fact).toBe('passenger.accepted_alternative');
    const answered = assess({ ...base, incident: { ...base.incident, facts: { 'passenger.accepted_alternative': false } }, asked: ['passenger.accepted_alternative'] });
    expect(answered.applying.map((r) => r.id)).toEqual(['fixture-us-refund-cancelled-flight']);
    expect(answered.question).toBeNull();
  });
});
```

`apps/web/lib/assist/incidents.ts`:
```ts
import 'server-only';
import type { Primitive } from '@elsewhere/rules/core';
import { appUrl } from '@/lib/env';
import { incidentNotice, questionNotice, reviewHoldNotice } from '@/lib/notify/templates';
import { queueNotifications } from '@/lib/notify/queue';
import { getLibrary } from '@/lib/rules/library';
import { createAdminClient } from '@/lib/supabase/admin';
import { assess, type Assessment } from './assess';
import { generatePlaybook } from './playbook';
import { answerValue, type PlannerAnswer, type PlannerQuestion } from './questions';

async function loadIncident(incidentId: string) {
  const admin = createAdminClient();
  const { data: incident } = await admin
    .from('incidents')
    .select('id, trip_id, segment_id, event_type, delay_minutes, detected_at, facts, affected_user_ids, trips!inner(name, pass_status)')
    .eq('id', incidentId)
    .single();
  if (!incident) throw new Error(`incident ${incidentId} not found`);
  const { data: segment } = await admin
    .from('booking_segments')
    .select('booking_id, carrier_iata, flight_number, origin_iata, departure_local, origin_country, destination_country, distance_km, scheduled_out, scheduled_in')
    .eq('id', incident.segment_id)
    .single();
  const { data: booking } = await admin.from('bookings').select('booked_via').eq('id', segment!.booking_id).single();
  const { count } = await admin.from('booking_segments').select('id', { count: 'exact', head: true }).eq('booking_id', segment!.booking_id);
  const { data: asked } = await admin.from('incident_events').select('detail').eq('incident_id', incidentId).eq('kind', 'question_asked');
  const trip = Array.isArray(incident.trips) ? incident.trips[0] : incident.trips;
  return { admin, incident, segment: segment!, booking: { booked_via: booking?.booked_via ?? null, segment_count: count ?? 1 }, asked: (asked ?? []).map((e) => (e.detail as { fact: string }).fact), trip };
}

export async function assessIncident(incidentId: string): Promise<Assessment & { tripId: string; tripName: string; affectedUserIds: string[]; passStatus: string }> {
  const loaded = await loadIncident(incidentId);
  const assessment = assess({
    incident: { ...loaded.incident, facts: (loaded.incident.facts ?? {}) as Record<string, Primitive> },
    segment: loaded.segment,
    booking: loaded.booking,
    asked: loaded.asked,
    rules: getLibrary().rules,
  });
  return { ...assessment, tripId: loaded.incident.trip_id, tripName: loaded.trip.name, affectedUserIds: loaded.incident.affected_user_ids, passStatus: loaded.trip.pass_status };
}

export async function askPlanner(incidentId: string, question: PlannerQuestion): Promise<void> {
  const admin = createAdminClient();
  const { data: incident } = await admin.from('incidents').select('trip_id, trips!inner(name)').eq('id', incidentId).single();
  const { data: planner } = await admin.from('trip_members').select('user_id').eq('trip_id', incident!.trip_id).eq('role', 'planner').single();
  await admin.from('incidents').update({ status: 'needs_answer', pending_question: question }).eq('id', incidentId);
  await admin.from('incident_events').insert({ incident_id: incidentId, kind: 'question_asked', detail: { fact: question.fact } });
  const trip = Array.isArray(incident!.trips) ? incident!.trips[0] : incident!.trips;
  await queueNotifications({
    userIds: planner ? [planner.user_id] : [],
    tripId: incident!.trip_id,
    template: 'incident_question',
    rendered: questionNotice({ tripName: trip.name, prompt: question.prompt, url: `${appUrl()}/trips/${incident!.trip_id}/incidents/${incidentId}` }),
    urgent: true,
    relatedEntityId: incidentId,
  });
}

export async function recordAnswer(incidentId: string, answer: PlannerAnswer | null): Promise<void> {
  const admin = createAdminClient();
  const { data: incident } = await admin.from('incidents').select('facts').eq('id', incidentId).single();
  const facts = { ...((incident?.facts ?? {}) as Record<string, Primitive>), ...(answer ? { [answer.fact]: answerValue(answer) } : {}) };
  await admin.from('incidents').update({ facts, status: 'open', pending_question: null }).eq('id', incidentId);
  await admin.from('incident_events').insert({ incident_id: incidentId, kind: 'answered', detail: answer ?? { timed_out: true } });
}

export async function savePlaybook(incidentId: string): Promise<string> {
  const assessment = await assessIncident(incidentId);
  const result = await generatePlaybook(assessment);
  const admin = createAdminClient();
  const { data: playbook, error } = await admin
    .from('playbooks')
    .insert({ incident_id: incidentId, content: result.playbook, rules_cited: result.rulesCited, model: result.model, citation_check_passed: result.citationCheckPassed })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  await admin.from('incidents').update({ status: 'playbook_ready' }).eq('id', incidentId);
  await admin.from('incident_events').insert({ incident_id: incidentId, kind: 'playbook_generated', detail: { playbook_id: playbook.id, model: result.model } });
  return playbook.id;
}

/** Comped trips are the founder's hand-run watching: their playbooks wait for review before the group sees them. */
export async function needsReview(incidentId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('incidents').select('trips!inner(pass_status)').eq('id', incidentId).single();
  const trip = Array.isArray(data?.trips) ? data?.trips[0] : data?.trips;
  return trip?.pass_status === 'comp';
}

export async function requestReview(incidentId: string): Promise<void> {
  const admin = createAdminClient();
  const emails = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0) return;
  const { data: admins } = await admin.from('profiles').select('id').in('email', emails);
  const { data: incident } = await admin.from('incidents').select('trips!inner(name)').eq('id', incidentId).single();
  const trip = Array.isArray(incident?.trips) ? incident?.trips[0] : incident?.trips;
  await queueNotifications({
    userIds: (admins ?? []).map((a) => a.id),
    tripId: null,
    template: 'review_hold',
    rendered: reviewHoldNotice({ tripName: trip?.name ?? 'A hand-run trip', url: `${appUrl()}/admin#${incidentId}` }),
    urgent: true,
    relatedEntityId: incidentId,
  });
}

export async function notifyAffected(incidentId: string): Promise<void> {
  const assessment = await assessIncident(incidentId);
  await queueNotifications({
    userIds: assessment.affectedUserIds,
    tripId: assessment.tripId,
    template: 'incident',
    rendered: incidentNotice({
      tripName: assessment.tripName,
      headline: assessment.eventSummary,
      url: `${appUrl()}/trips/${assessment.tripId}/incidents/${incidentId}`,
    }),
    urgent: true,
    relatedEntityId: incidentId,
  });
  await createAdminClient().from('incident_events').insert({ incident_id: incidentId, kind: 'notified', detail: { users: assessment.affectedUserIds.length } });
}
```

- [ ] **Step 4: Extend the ports and write the workflow**

In `apps/web/lib/workflows/ports.ts`:
1. Add `import type { PlannerAnswer, PlannerQuestion } from '@/lib/assist/questions';`. It is type-only, so no server code loads.
2. Add these methods to `WorkflowPorts`:
   ```ts
     assessIncident(incidentId: string): Promise<{ question: PlannerQuestion | null }>;
     askPlanner(incidentId: string, question: PlannerQuestion): Promise<void>;
     recordAnswer(incidentId: string, answer: PlannerAnswer | null): Promise<void>;
     generatePlaybook(incidentId: string): Promise<{ playbookId: string }>;
     needsReview(incidentId: string): Promise<boolean>;
     requestReview(incidentId: string): Promise<void>;
     notifyAffected(incidentId: string): Promise<void>;
   ```

In `apps/web/lib/workflows/live-ports.ts`:
1. Add `import { askPlanner, assessIncident, needsReview, notifyAffected, recordAnswer, requestReview, savePlaybook } from '@/lib/assist/incidents';`.
2. Add these entries to the returned object:
   ```ts
       async assessIncident(incidentId) {
         return { question: (await assessIncident(incidentId)).question };
       },
       askPlanner,
       recordAnswer,
       async generatePlaybook(incidentId) {
         return { playbookId: await savePlaybook(incidentId) };
       },
       needsReview,
       requestReview,
       notifyAffected,
   ```

In `apps/web/lib/workflows/memory-ports.ts`:
1. Add `import type { PlannerAnswer, PlannerQuestion } from '@/lib/assist/questions';`.
2. Extend `MemoryState` with:
   ```ts
     questions: Map<string, PlannerQuestion>;
     answers: Map<string, PlannerAnswer | null>;
     reviewed: Set<string>;
     reviewRequested: string[];
     notified: string[];
   ```
3. Initialise them in `memoryState()`: `questions: new Map(), answers: new Map(), reviewed: new Set(), reviewRequested: [], notified: []`.
4. Add these to `memoryPorts()`:
   ```ts
       async assessIncident(incidentId) {
         return { question: state.answers.has(incidentId) ? null : (state.questions.get(incidentId) ?? null) };
       },
       async askPlanner(incidentId) {
         state.calls.push(`ask:${incidentId}`);
       },
       async recordAnswer(incidentId, answer) {
         state.answers.set(incidentId, answer);
       },
       async generatePlaybook(incidentId) {
         return { playbookId: `pb-${incidentId}` };
       },
       async needsReview(incidentId) {
         return state.reviewed.has(incidentId);
       },
       async requestReview(incidentId) {
         state.reviewRequested.push(incidentId);
       },
       async notifyAffected(incidentId) {
         state.notified.push(incidentId);
       },
   ```

`apps/web/workflows/incident.ts`:
```ts
import { createHook, sleep } from 'workflow';
import type { PlannerAnswer, PlannerQuestion } from '@/lib/assist/questions';
import { workflowPorts } from '@/lib/workflows/ports';
import { incidentAnswerToken, incidentReleaseToken } from '@/lib/workflows/tokens';

export async function incidentWorkflow(incidentId: string) {
  'use workflow';
  const { question } = await assessStep(incidentId);
  if (question) {
    await askStep(incidentId, question);
    const hook = createHook<PlannerAnswer>({ token: incidentAnswerToken(incidentId) });
    const answer = await Promise.race([hook.then((a) => a), sleep('6h').then(() => null)]);
    hook.dispose();
    await answerStep(incidentId, answer);
  }

  const { playbookId } = await playbookStep(incidentId);

  if (await needsReviewStep(incidentId)) {
    await requestReviewStep(incidentId);
    const release = createHook<{ releasedBy: string }>({ token: incidentReleaseToken(incidentId) });
    await Promise.race([release.then(() => true), sleep('2h').then(() => false)]);
    release.dispose();
  }

  await notifyStep(incidentId);
  return { incidentId, playbookId };
}

async function assessStep(incidentId: string) {
  'use step';
  return (await workflowPorts()).assessIncident(incidentId);
}

async function askStep(incidentId: string, question: PlannerQuestion) {
  'use step';
  await (await workflowPorts()).askPlanner(incidentId, question);
}

async function answerStep(incidentId: string, answer: PlannerAnswer | null) {
  'use step';
  await (await workflowPorts()).recordAnswer(incidentId, answer);
}

async function playbookStep(incidentId: string) {
  'use step';
  return (await workflowPorts()).generatePlaybook(incidentId);
}

async function needsReviewStep(incidentId: string) {
  'use step';
  return (await workflowPorts()).needsReview(incidentId);
}

async function requestReviewStep(incidentId: string) {
  'use step';
  await (await workflowPorts()).requestReview(incidentId);
}

async function notifyStep(incidentId: string) {
  'use step';
  await (await workflowPorts()).notifyAffected(incidentId);
}
```

Start the incident workflow wherever an incident opens:
1. In `apps/web/workflows/segment-monitor.ts`:
   - Add `import { start } from 'workflow/api';` and `import { incidentWorkflow } from './incident';`.
   - Inside the loop, after `incidents.push(polled.incidentId)`, add `await start(incidentWorkflow, [polled.incidentId]);`. Calling `start()` inside a workflow spawns a child run through an internal step.
2. In `apps/web/app/api/webhooks/aeroapi/[secret]/route.ts`:
   - Add `import { start } from 'workflow/api';` and `import { incidentWorkflow } from '@/workflows/incident';`.
   - Before the final `return`, add `if (incidentId) await start(incidentWorkflow, [incidentId]);`.

The segment-monitor integration test from Task 9 now spawns a child incident run for `inc-1`. `memoryPorts().assessIncident('inc-1')` returns no question, so the child finishes on its own, asynchronously. In `apps/web/test/workflows/segment-monitor.integration.test.ts`:
1. Change the vitest import to `import { beforeEach, describe, expect, it, vi } from 'vitest';`.
2. After `const result = await run.returnValue;`, add:
   ```ts
   await vi.waitFor(() => expect(memoryState().notified).toContain('inc-1'), { timeout: 5000 });
   ```

- [ ] **Step 5: Write the incident page and the answer action**

`apps/web/app/trips/[id]/incidents/[incidentId]/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { resumeHook } from 'workflow/api';
import { requireUser } from '@/lib/auth/user';
import { createClient } from '@/lib/supabase/server';
import { incidentAnswerToken } from '@/lib/workflows/tokens';

export async function answerQuestion(tripId: string, incidentId: string, fact: string, value: string): Promise<void> {
  await requireUser(`/trips/${tripId}/incidents/${incidentId}`);
  const supabase = await createClient();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: tripId });
  if (isPlanner !== true) throw new Error('Only the planner can answer this.');
  const { data: incident } = await supabase.from('incidents').select('pending_question').eq('id', incidentId).single();
  const pending = incident?.pending_question as { fact: string; options: { value: string }[] } | null;
  if (!pending || pending.fact !== fact || !pending.options.some((o) => o.value === value)) throw new Error('That question is no longer open.');
  await resumeHook(incidentAnswerToken(incidentId), { fact, value });
  revalidatePath(`/trips/${tripId}/incidents/${incidentId}`);
}
```

`apps/web/app/trips/[id]/incidents/[incidentId]/page.tsx`:
```tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Character } from '@/components/character';
import { Button } from '@/components/ui/button';
import { PlaybookSchema } from '@/lib/assist/playbook-schema';
import { requireUser } from '@/lib/auth/user';
import { findRule } from '@/lib/rules/accessors';
import { getLibrary } from '@/lib/rules/library';
import { createClient } from '@/lib/supabase/server';
import { answerQuestion } from './actions';

type Params = Promise<{ id: string; incidentId: string }>;

export default function IncidentPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Suspense fallback={<p className="text-[#4b5745]">Loading…</p>}>
        <IncidentContent params={params} />
      </Suspense>
    </main>
  );
}

function Cites({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <span className="ml-1 text-sm">
      {ids.map((id) => (
        <Link key={id} href={`/rules/${id}`} className="text-[#b4532a] underline">
          [rule]
        </Link>
      ))}
    </span>
  );
}

async function IncidentContent({ params }: { params: Params }) {
  const { id, incidentId } = await params;
  await requireUser(`/trips/${id}/incidents/${incidentId}`);
  const supabase = await createClient();
  const { data: incident } = await supabase.from('incidents').select('id, status, pending_question, detected_at').eq('id', incidentId).eq('trip_id', id).maybeSingle();
  if (!incident) notFound();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: id });
  const { data: latest } = await supabase.from('playbooks').select('content, rules_cited').eq('incident_id', incidentId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const playbook = latest ? PlaybookSchema.parse(latest.content) : null;
  const firstRule = latest ? findRule(getLibrary(), (latest.rules_cited as { rule_id: string }[])[0]?.rule_id ?? '') : null;
  const question = incident.pending_question as { fact: string; prompt: string; options: { value: string; label: string }[] } | null;

  return (
    <>
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#b4532a]">What happened</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{playbook?.summary ?? 'We’re working out what applies.'}</h1>
        </div>
        {firstRule ? <Character character={firstRule.lead_character} variant="avatar" width={56} /> : null}
      </div>

      {question && isPlanner === true ? (
        <section className="mt-6 rounded-xl border border-[#e7c37a] bg-[#fdf3dc] p-5">
          <p className="font-medium">{question.prompt}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {question.options.map((option) => (
              <form key={option.value} action={answerQuestion.bind(null, id, incidentId, question.fact, option.value)}>
                <Button type="submit" variant="outline">
                  {option.label}
                </Button>
              </form>
            ))}
          </div>
        </section>
      ) : question ? (
        <p className="mt-6 text-[#4b5745]">We asked the planner one question. The full plan follows as soon as they answer.</p>
      ) : null}

      {playbook ? (
        <>
          {playbook.owed.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-xl font-semibold">What you’re owed</h2>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                {playbook.owed.map((item) => (
                  <li key={item.text}>
                    {item.text}
                    <Cites ids={item.rule_ids} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="mt-8">
            <h2 className="text-xl font-semibold">What to do</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-6">
              {playbook.steps.map((step) => (
                <li key={step.text}>
                  {step.text}
                  <Cites ids={step.rule_ids} />
                </li>
              ))}
            </ol>
          </section>
          {playbook.messages.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-xl font-semibold">Messages we drafted for you to send</h2>
              {playbook.messages.map((message) => (
                <div key={message.body} className="mt-3 rounded-xl border border-[#e4dfd0] bg-white p-4">
                  <p className="text-sm text-[#4b5745]">
                    To the {message.to} · {message.channel.replace('_', ' ')}
                    <Cites ids={message.rule_ids} />
                  </p>
                  <textarea readOnly defaultValue={message.body} className="mt-2 h-32 w-full rounded-md border border-[#d9d3c2] p-2 text-sm" />
                </div>
              ))}
            </section>
          ) : null}
          {playbook.caveats.length > 0 ? (
            <ul className="mt-8 space-y-1 text-sm text-[#4b5745]">
              {playbook.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <p className="mt-10 text-xs text-[#4b5745]">We drafted this from the linked rules. You decide and send. Not legal advice.</p>
    </>
  );
}
```

- [ ] **Step 6: Run the unit and integration tests, typecheck, and build**

```bash
cd apps/web && npx vitest run && npm run test:integration && npm run typecheck && npm run build; cd ../..
```
Expected: everything passes, and the build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -F - <<'EOF'
Run each disruption as a durable incident: ask, draft, notify

An incident is assessed against the rules. If a traveler-answerable
fact decides it, the planner gets one question and the workflow waits
for the answer, up to six hours. Then it drafts the cited playbook and
alerts only the people on that booking. Comped, hand-run trips hold the
playbook for the founder's review for up to two hours. The incident
page shows the claims with links to their rules and the messages ready
to paste.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 13: Votes — the group's decision, from one link

**Files:**
- Create: `apps/web/lib/votes/tally.ts`, `apps/web/lib/votes/alternatives.ts`, `apps/web/app/trips/[id]/votes/[voteId]/page.tsx`, `apps/web/app/trips/[id]/votes/actions.ts`, `apps/web/app/trips/[id]/incidents/[incidentId]/vote-form.tsx`, `apps/web/test/votes/tally.test.ts`, `apps/web/test/votes/alternatives.test.ts`
- Modify:
  - `apps/web/lib/flights/aeroapi.ts` and `apps/web/lib/flights/fixture-aeroapi.ts` (add `routeSchedules`)
  - `apps/web/test/flights/resolve.test.ts` (stub `routeSchedules`)
  - `apps/web/app/trips/[id]/incidents/[incidentId]/page.tsx` (add the vote form)

**Interfaces:**
- Consumes: `TripVote` and `TripVoteOption` (Task 1); `aeroApi` and `localDateTime` (Task 4); `queueNotifications` and `voteNotice` (Task 2).
- Produces:
  - **AeroAPI addition:** `AeroApi.routeSchedules(dateStart, dateEnd, origin, destination): Promise<AeroScheduled[]>`, which calls `/schedules/{start}/{end}?origin=&destination=`
  - **Tally:** `tally(vote, options, responses, requiredUserIds): TripVote & { leaderOptionId: string | null; respondedCount: number; complete: boolean }`
  - **Alternatives:** `suggestAlternatives(segment, api, now): Promise<{ label: string; note: string }[]>`
  - **Server actions:**
    - `createVote(tripId, incidentId | null, prev, form)`
    - `respondVote(tripId, voteId, optionId)`
    - `closeVote(tripId, voteId)`

- [ ] **Step 1: Write the failing tests**

`apps/web/test/votes/tally.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { tally } from '@/lib/votes/tally';

const vote = { id: 'v1', trip_id: 't1', title: 'Which flight?', detail: 'TP cancelled us', deadline: null, status: 'open' as const };
const options = [
  { id: 'o1', label: '7:05 tomorrow', position: 1 },
  { id: 'o2', label: 'Tonight via Denver', position: 2 },
];

describe('tally', () => {
  it('counts votes, picks a leader, and knows when everyone required has voted', () => {
    const result = tally(vote, options, [
      { user_id: 'u1', option_id: 'o1' },
      { user_id: 'u2', option_id: 'o1' },
      { user_id: 'u3', option_id: 'o2' },
    ], ['u1', 'u2', 'u3']);
    expect(result.options).toEqual([
      { id: 'o1', label: '7:05 tomorrow', votes: 2 },
      { id: 'o2', label: 'Tonight via Denver', votes: 1 },
    ]);
    expect(result.leaderOptionId).toBe('o1');
    expect(result.complete).toBe(true);
    expect(result.requiredParticipantIds).toEqual(['u1', 'u2', 'u3']);
  });

  it('has no leader on a tie', () => {
    const result = tally(vote, options, [{ user_id: 'u1', option_id: 'o1' }, { user_id: 'u2', option_id: 'o2' }], ['u1', 'u2', 'u3']);
    expect(result.leaderOptionId).toBeNull();
    expect(result.complete).toBe(false);
    expect(result.respondedCount).toBe(2);
  });
});
```

`apps/web/test/votes/alternatives.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { AeroApi } from '@/lib/flights/aeroapi';
import { suggestAlternatives } from '@/lib/votes/alternatives';

const api: AeroApi = {
  schedules: async () => [],
  routeSchedules: async () => [
    { ident_iata: 'TP202', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-04T23:15:00Z', scheduled_in: '2026-11-05T06:35:00Z' },
    { ident_iata: 'UA64', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-04T01:00:00Z', scheduled_in: '2026-11-04T12:30:00Z' },
  ],
  airport: async () => ({ code_iata: 'EWR', country_code: 'US', latitude: 0, longitude: 0, timezone: 'America/New_York' }),
  flights: async () => [],
  createAlert: async () => 'a',
  deleteAlert: async () => undefined,
};

describe('suggestAlternatives', () => {
  it('lists upcoming flights on the same route, earliest first, never promising seats', async () => {
    const options = await suggestAlternatives({ originIata: 'EWR', destinationIata: 'LIS', carrierIata: 'TP' }, api, new Date('2026-11-03T20:00:00Z'));
    expect(options).toEqual([
      // New York is on EST (UTC−5) after Nov 1, 2026.
      { label: 'UA 64 · leaves Nov 3, 20:00', note: 'availability not confirmed — ask the airline' },
      { label: 'TP 202 · leaves Nov 4, 18:15', note: 'availability not confirmed — ask the airline' },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/votes; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 3: Implement**

`apps/web/lib/votes/tally.ts`:
```ts
import type { TripVote } from '@/lib/types/trip-room';

export function tally(
  vote: { id: string; trip_id: string; title: string; detail: string; deadline: string | null; status: 'open' | 'closed' },
  options: { id: string; label: string; position: number }[],
  responses: { user_id: string; option_id: string }[],
  requiredUserIds: string[],
): TripVote & { leaderOptionId: string | null; respondedCount: number; complete: boolean } {
  const counted = [...options]
    .sort((a, b) => a.position - b.position)
    .map((option) => ({ id: option.id, label: option.label, votes: responses.filter((r) => r.option_id === option.id).length }));
  const top = Math.max(0, ...counted.map((o) => o.votes));
  const leaders = counted.filter((o) => o.votes === top && top > 0);
  const responded = new Set(responses.map((r) => r.user_id));
  return {
    id: vote.id,
    tripId: vote.trip_id,
    title: vote.title,
    detail: vote.detail,
    options: counted,
    requiredParticipantIds: requiredUserIds,
    deadline: vote.deadline,
    status: vote.status,
    leaderOptionId: leaders.length === 1 ? leaders[0].id : null,
    respondedCount: responded.size,
    complete: requiredUserIds.length > 0 && requiredUserIds.every((id) => responded.has(id)),
  };
}
```

`apps/web/lib/votes/alternatives.ts`:
```ts
import type { AeroApi } from '@/lib/flights/aeroapi';
import { localDateTime } from '@/lib/flights/geo';

const NOTE = 'availability not confirmed — ask the airline';
const label = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Schedule data only. It says what flies, never whether a seat is free. */
export async function suggestAlternatives(
  segment: { originIata: string; destinationIata: string; carrierIata: string },
  api: AeroApi,
  now: Date,
): Promise<{ label: string; note: string }[]> {
  const start = now.toISOString().slice(0, 10);
  const end = new Date(now.getTime() + 2 * 24 * 3600_000).toISOString().slice(0, 10);
  const [scheduled, origin] = await Promise.all([api.routeSchedules(start, end, segment.originIata, segment.destinationIata), api.airport(segment.originIata)]);
  const timeZone = origin?.timezone ?? 'UTC';
  return scheduled
    .filter((s) => s.origin_iata === segment.originIata && s.destination_iata === segment.destinationIata && new Date(s.scheduled_out) > now)
    .sort((a, b) => a.scheduled_out.localeCompare(b.scheduled_out))
    .slice(0, 4)
    .map((s) => {
      const local = localDateTime(s.scheduled_out, timeZone);
      const ident = (s.ident_iata ?? '').replace(/^([A-Z0-9]{2})(\d+)$/, '$1 $2');
      return { label: `${ident} · leaves ${label.format(new Date(`${local.slice(0, 10)}T00:00:00Z`))}, ${local.slice(11)}`, note: NOTE };
    });
}
```
Add `routeSchedules` to the flight client, so suggestions cover every airline on the route:
- **The `AeroApi` interface** in `apps/web/lib/flights/aeroapi.ts`:
  ```ts
    routeSchedules(dateStart: string, dateEnd: string, origin: string, destination: string): Promise<AeroScheduled[]>;
  ```
- **`httpAeroApi`:**
  ```ts
      async routeSchedules(dateStart, dateEnd, origin, destination) {
        const body = await get<{ scheduled: AeroScheduled[] }>(`/schedules/${dateStart}/${dateEnd}`, { origin, destination });
        return body?.scheduled ?? [];
      },
  ```
- **`fixtureAeroApi`** in `apps/web/lib/flights/fixture-aeroapi.ts`:
  ```ts
      async routeSchedules(_start, _end, origin, destination) {
        return read<AeroScheduled[]>(`routes/${origin}-${destination}.json`, []);
      },
  ```
- **The fake `api()`** in `apps/web/test/flights/resolve.test.ts`: add `routeSchedules: async () => [],`.

`apps/web/app/trips/[id]/votes/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/user';
import { appUrl } from '@/lib/env';
import { voteNotice } from '@/lib/notify/templates';
import { queueNotifications } from '@/lib/notify/queue';
import { createClient } from '@/lib/supabase/server';

export interface VoteFormState {
  error: string | null;
}

export async function createVote(tripId: string, incidentId: string | null, _prev: VoteFormState, form: FormData): Promise<VoteFormState> {
  const user = await requireUser(`/trips/${tripId}`);
  const title = String(form.get('title') ?? '').trim();
  const options = String(form.get('options') ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
  if (!title || options.length < 2) return { error: 'Give the vote a question and at least two options, one per line.' };

  const supabase = await createClient();
  let required: string[] = [];
  if (incidentId) {
    const { data: incident } = await supabase.from('incidents').select('affected_user_ids').eq('id', incidentId).single();
    required = incident?.affected_user_ids ?? [];
  } else {
    const { data: members } = await supabase.from('trip_members').select('user_id').eq('trip_id', tripId);
    required = (members ?? []).map((m) => m.user_id);
  }
  const { data: vote, error } = await supabase
    .from('votes')
    .insert({ trip_id: tripId, incident_id: incidentId, title, detail: String(form.get('detail') ?? ''), required_user_ids: required, created_by: user.id })
    .select('id')
    .single();
  if (error) return { error: 'We could not start the vote.' };
  await supabase.from('vote_options').insert(
    options.map((line, index) => {
      const [label, note] = line.split(' (availability not confirmed');
      return { vote_id: vote.id, label: label.trim(), note: note ? 'availability not confirmed — ask the airline' : null, position: index + 1 };
    }),
  );
  const { data: trip } = await supabase.from('trips').select('name').eq('id', tripId).single();
  await queueNotifications({
    userIds: required.filter((id) => id !== user.id),
    tripId,
    template: 'vote',
    rendered: voteNotice({ tripName: trip?.name ?? 'Your trip', title, url: `${appUrl()}/trips/${tripId}/votes/${vote.id}` }),
    urgent: incidentId !== null,
    relatedEntityId: vote.id,
  });
  redirect(`/trips/${tripId}/votes/${vote.id}`);
}

export async function respondVote(tripId: string, voteId: string, optionId: string): Promise<void> {
  const user = await requireUser(`/trips/${tripId}/votes/${voteId}`);
  const supabase = await createClient();
  const { error } = await supabase.from('vote_responses').upsert({ vote_id: voteId, user_id: user.id, option_id: optionId, responded_at: new Date().toISOString() }, { onConflict: 'vote_id,user_id' });
  if (error) throw new Error('That vote is closed.');
  revalidatePath(`/trips/${tripId}/votes/${voteId}`);
}

export async function closeVote(tripId: string, voteId: string): Promise<void> {
  await requireUser(`/trips/${tripId}/votes/${voteId}`);
  const supabase = await createClient();
  await supabase.from('votes').update({ status: 'closed' }).eq('id', voteId);
  revalidatePath(`/trips/${tripId}/votes/${voteId}`);
}
```

`apps/web/app/trips/[id]/votes/[voteId]/page.tsx`:
```tsx
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/user';
import { createClient } from '@/lib/supabase/server';
import { tally } from '@/lib/votes/tally';
import { closeVote, respondVote } from '../actions';

type Params = Promise<{ id: string; voteId: string }>;

export default function VotePage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <Suspense fallback={<p className="text-[#4b5745]">Loading the vote…</p>}>
        <VoteContent params={params} />
      </Suspense>
    </main>
  );
}

async function VoteContent({ params }: { params: Params }) {
  const { id, voteId } = await params;
  const user = await requireUser(`/trips/${id}/votes/${voteId}`);
  const supabase = await createClient();
  const { data: vote } = await supabase.from('votes').select('id, trip_id, title, detail, deadline, status, required_user_ids, created_by').eq('id', voteId).eq('trip_id', id).maybeSingle();
  if (!vote) notFound();
  const { data: options } = await supabase.from('vote_options').select('id, label, note, position').eq('vote_id', voteId);
  const { data: responses } = await supabase.from('vote_responses').select('user_id, option_id').eq('vote_id', voteId);
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: id });
  const result = tally(vote, options ?? [], responses ?? [], vote.required_user_ids);
  const mine = (responses ?? []).find((r) => r.user_id === user.id)?.option_id ?? null;
  const notes = new Map((options ?? []).map((o) => [o.id, o.note]));

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{vote.title}</h1>
      {vote.detail ? <p className="mt-2 text-[#4b5745]">{vote.detail}</p> : null}
      <ul className="mt-6 space-y-3">
        {result.options.map((option) => (
          <li key={option.id}>
            <form action={respondVote.bind(null, id, voteId, option.id)}>
              <Button type="submit" variant={mine === option.id ? 'default' : 'outline'} disabled={vote.status === 'closed'} className="h-auto w-full justify-between py-3">
                <span className="text-left">
                  {option.label}
                  {notes.get(option.id) ? <span className="block text-xs font-normal opacity-80">{notes.get(option.id)}</span> : null}
                </span>
                <span>{option.votes}</span>
              </Button>
            </form>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-[#4b5745]">
        {result.respondedCount} of {result.requiredParticipantIds.length} have voted{vote.status === 'closed' ? ' · closed' : ''}.
      </p>
      {vote.status === 'open' && (isPlanner === true || vote.created_by === user.id) ? (
        <form action={closeVote.bind(null, id, voteId)} className="mt-4">
          <Button type="submit" variant="outline" size="sm">
            Close the vote
          </Button>
        </form>
      ) : null}
    </>
  );
}
```

`apps/web/app/trips/[id]/incidents/[incidentId]/vote-form.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { createVote, type VoteFormState } from '../../votes/actions';

export function IncidentVoteForm({ tripId, incidentId, suggestions }: { tripId: string; incidentId: string; suggestions: string[] }) {
  const [state, action, pending] = useActionState<VoteFormState, FormData>(createVote.bind(null, tripId, incidentId), { error: null });
  return (
    <form action={action} className="mt-10 rounded-xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="font-semibold">Ask the group</h2>
      <input name="title" defaultValue="Which option should we take?" className="mt-3 w-full rounded-md border border-[#d9d3c2] px-3 py-2" />
      <textarea
        name="options"
        defaultValue={suggestions.join('\n')}
        placeholder={'One option per line, e.g.\nThe airline’s 7:05 tomorrow\nTonight via Denver'}
        className="mt-3 h-32 w-full rounded-md border border-[#d9d3c2] px-3 py-2 text-sm"
      />
      {state.error ? <p role="alert" className="mt-2 text-sm text-[#b42318]">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="mt-3">
        {pending ? 'Starting…' : 'Start the vote'}
      </Button>
    </form>
  );
}
```

In `apps/web/app/trips/[id]/incidents/[incidentId]/page.tsx`:
1. Add the imports:
   ```tsx
   import { aeroApi } from '@/lib/flights/aeroapi';
   import { suggestAlternatives } from '@/lib/votes/alternatives';
   import { IncidentVoteForm } from './vote-form';
   ```
2. In `IncidentContent`:
   - Also select `segment_id` and `affected_user_ids` from `incidents`.
   - Load the segment's `origin_iata`, `destination_iata`, and `carrier_iata`.
   - Compute `const suggestions = (await suggestAlternatives(segmentFields, await aeroApi(), new Date()).catch(() => [])).map((o) => `${o.label} (${o.note})`);`.
   - Render `<IncidentVoteForm tripId={id} incidentId={incidentId} suggestions={suggestions} />` after the playbook, for the planner or an affected member.

- [ ] **Step 4: Run the tests, typecheck, and build**

```bash
cd apps/web && npx vitest run && npm run typecheck && npm run build; cd ../..
```
Expected: all tests pass, typecheck is clean, and the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -F - <<'EOF'
Let the group decide by vote, from a link in the alert

The planner or anyone affected turns the airline's offers into a vote,
prefilled with scheduled flights on the same route that are labelled
"availability not confirmed — ask the airline". One tap votes; the
creator or planner closes it. Required voters are the affected members.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 14: Who owes what — expenses, minimal transfers, and pay links

No characters on this page. It is the money ledger.

**Files:**
- Create: `apps/web/lib/expenses/settle.ts`, `apps/web/lib/expenses/pay-links.ts`, `apps/web/app/trips/[id]/money/page.tsx`, `apps/web/app/trips/[id]/money/actions.ts`, `apps/web/app/trips/[id]/money/expense-form.tsx`, `apps/web/test/expenses/settle.test.ts`, `apps/web/test/expenses/pay-links.test.ts`

**Interfaces:**
- Produces:
  - **Settlement:**
    - `Split = { kind: 'equal'; user_ids: string[] } | { kind: 'shares'; shares: Record<string, number> }`
    - `shareOf(amountCents, split): Record<string, number>`
    - `balances(expenses, settlements): Record<string, number>`, positive for a creditor
    - `minimalTransfers(balances): { from: string; to: string; amountCents: number }[]`
  - **Pay links:**
    - `venmoLink(username, amountCents, note): string`
    - `cashAppLink(cashtag): string`
  - **Server actions:** `addExpense(tripId, prev, form)` and `markSettled(tripId, from, to, amountCents)`

- [ ] **Step 1: Write the failing tests**

`apps/web/test/expenses/settle.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { balances, minimalTransfers, shareOf } from '@/lib/expenses/settle';

describe('shareOf', () => {
  it('splits equally and hands leftover cents to the first people listed', () => {
    expect(shareOf(1000, { kind: 'equal', user_ids: ['a', 'b', 'c'] })).toEqual({ a: 334, b: 333, c: 333 });
  });

  it('uses explicit shares', () => {
    expect(shareOf(1000, { kind: 'shares', shares: { a: 700, b: 300 } })).toEqual({ a: 700, b: 300 });
  });
});

describe('balances and minimalTransfers', () => {
  it('nets expenses and settlements into the fewest transfers', () => {
    const net = balances(
      [
        { payer_user_id: 'pat', amount_cents: 30000, split: { kind: 'equal', user_ids: ['pat', 'sam', 'jo'] } },
        { payer_user_id: 'sam', amount_cents: 6000, split: { kind: 'equal', user_ids: ['pat', 'sam', 'jo'] } },
      ],
      [{ from_user_id: 'jo', to_user_id: 'pat', amount_cents: 2000 }],
    );
    expect(net).toEqual({ pat: 16000, sam: -6000, jo: -10000 });
    expect(minimalTransfers(net)).toEqual([
      { from: 'jo', to: 'pat', amountCents: 10000 },
      { from: 'sam', to: 'pat', amountCents: 6000 },
    ]);
  });
});
```

`apps/web/test/expenses/pay-links.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { cashAppLink, venmoLink } from '@/lib/expenses/pay-links';

describe('pay links', () => {
  it('prefills Venmo with the amount and note', () => {
    expect(venmoLink('pat-travels', 10000, 'Lisbon hotel')).toBe('https://venmo.com/pat-travels?txn=pay&amount=100.00&note=Lisbon%20hotel');
  });

  it('links a Cash App cashtag', () => {
    expect(cashAppLink('PatT')).toBe('https://cash.app/$PatT');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/expenses; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 3: Implement**

`apps/web/lib/expenses/settle.ts`:
```ts
export type Split = { kind: 'equal'; user_ids: string[] } | { kind: 'shares'; shares: Record<string, number> };

export function shareOf(amountCents: number, split: Split): Record<string, number> {
  if (split.kind === 'shares') return { ...split.shares };
  const n = split.user_ids.length;
  const base = Math.floor(amountCents / n);
  let remainder = amountCents - base * n;
  const shares: Record<string, number> = {};
  for (const id of split.user_ids) {
    shares[id] = base + (remainder > 0 ? 1 : 0);
    remainder -= 1;
  }
  return shares;
}

/** Positive = the group owes this person; negative = this person owes the group. */
export function balances(
  expenses: { payer_user_id: string; amount_cents: number; split: Split }[],
  settlements: { from_user_id: string; to_user_id: string; amount_cents: number }[],
): Record<string, number> {
  const net: Record<string, number> = {};
  const add = (id: string, cents: number) => (net[id] = (net[id] ?? 0) + cents);
  for (const expense of expenses) {
    add(expense.payer_user_id, expense.amount_cents);
    for (const [id, share] of Object.entries(shareOf(expense.amount_cents, expense.split))) add(id, -share);
  }
  for (const s of settlements) {
    add(s.from_user_id, s.amount_cents);
    add(s.to_user_id, -s.amount_cents);
  }
  return net;
}

/** Greedy largest-debtor to largest-creditor: at most n-1 transfers. */
export function minimalTransfers(net: Record<string, number>): { from: string; to: string; amountCents: number }[] {
  const debtors = Object.entries(net).filter(([, v]) => v < 0).map(([id, v]) => ({ id, amount: -v }));
  const creditors = Object.entries(net).filter(([, v]) => v > 0).map(([id, v]) => ({ id, amount: v }));
  const transfers: { from: string; to: string; amountCents: number }[] = [];
  debtors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  creditors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  while (debtors.length > 0 && creditors.length > 0) {
    const debtor = debtors[0];
    const creditor = creditors[0];
    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({ from: debtor.id, to: creditor.id, amountCents: amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtors.shift();
    if (creditor.amount === 0) creditors.shift();
  }
  return transfers;
}
```

`apps/web/lib/expenses/pay-links.ts`:
```ts
export function venmoLink(username: string, amountCents: number, note: string): string {
  return `https://venmo.com/${encodeURIComponent(username)}?txn=pay&amount=${(amountCents / 100).toFixed(2)}&note=${encodeURIComponent(note)}`;
}

/** Cash App links cannot carry an amount, so the page shows it beside the link. */
export function cashAppLink(cashtag: string): string {
  return `https://cash.app/$${encodeURIComponent(cashtag)}`;
}
```

`apps/web/app/trips/[id]/money/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/user';
import { createClient } from '@/lib/supabase/server';

export interface ExpenseState {
  error: string | null;
}

export async function addExpense(tripId: string, _prev: ExpenseState, form: FormData): Promise<ExpenseState> {
  const user = await requireUser(`/trips/${tripId}/money`);
  const description = String(form.get('description') ?? '').trim();
  const dollars = Number(String(form.get('amount') ?? '').replace(/[$,]/g, ''));
  const userIds = form.getAll('splitWith').map(String);
  if (!description || !Number.isFinite(dollars) || dollars <= 0 || userIds.length === 0) {
    return { error: 'Add what it was for, the amount, and who shares it.' };
  }
  const supabase = await createClient();
  const { error } = await supabase.from('expenses').insert({
    trip_id: tripId,
    payer_user_id: user.id,
    amount_cents: Math.round(dollars * 100),
    description,
    split: { kind: 'equal', user_ids: userIds },
    created_by: user.id,
  });
  if (error) return { error: 'We could not add that expense.' };
  revalidatePath(`/trips/${tripId}/money`);
  return { error: null };
}

export async function markSettled(tripId: string, fromUserId: string, toUserId: string, amountCents: number): Promise<void> {
  const user = await requireUser(`/trips/${tripId}/money`);
  const supabase = await createClient();
  const { error } = await supabase.from('settlements').insert({ trip_id: tripId, from_user_id: fromUserId, to_user_id: toUserId, amount_cents: amountCents, settled_by: user.id });
  if (error) throw new Error('Only the two people involved, or the planner, can mark this paid.');
  revalidatePath(`/trips/${tripId}/money`);
}
```

`apps/web/app/trips/[id]/money/expense-form.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { addExpense, type ExpenseState } from './actions';

export function ExpenseForm({ tripId, members }: { tripId: string; members: { user_id: string; display_name: string }[] }) {
  const [state, action, pending] = useActionState<ExpenseState, FormData>(addExpense.bind(null, tripId), { error: null });
  return (
    <form action={action} className="mt-8 space-y-3 rounded-xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="font-semibold">Add something you paid for</h2>
      <input name="description" placeholder="Airport hotel after the cancellation" className="w-full rounded-md border border-[#d9d3c2] px-3 py-2" />
      <input name="amount" inputMode="decimal" placeholder="$186.40" className="w-full rounded-md border border-[#d9d3c2] px-3 py-2" />
      <fieldset className="text-sm">
        <legend className="font-medium">Split equally with</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {members.map((m) => (
            <label key={m.user_id} className="flex items-center gap-2">
              <input type="checkbox" name="splitWith" value={m.user_id} defaultChecked /> {m.display_name}
            </label>
          ))}
        </div>
      </fieldset>
      {state.error ? <p role="alert" className="text-sm text-[#b42318]">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add expense'}
      </Button>
    </form>
  );
}
```

`apps/web/app/trips/[id]/money/page.tsx`:
```tsx
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/user';
import { cashAppLink, venmoLink } from '@/lib/expenses/pay-links';
import { balances, minimalTransfers, type Split } from '@/lib/expenses/settle';
import { createClient } from '@/lib/supabase/server';
import { markSettled } from './actions';
import { ExpenseForm } from './expense-form';

type Params = Promise<{ id: string }>;
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function MoneyPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Who owes what</h1>
      <Suspense fallback={<p className="mt-6 text-[#4b5745]">Loading…</p>}>
        <MoneyContent params={params} />
      </Suspense>
    </main>
  );
}

async function MoneyContent({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser(`/trips/${id}/money`);
  const supabase = await createClient();
  const { data: trip } = await supabase.from('trips').select('name').eq('id', id).maybeSingle();
  if (!trip) notFound();
  const { data: directory } = await supabase.rpc('trip_directory', { p_trip_id: id });
  const members = (directory ?? []) as { user_id: string; display_name: string; venmo_username: string | null; cashtag: string | null }[];
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const { data: expenses } = await supabase.from('expenses').select('id, payer_user_id, amount_cents, description, split, created_at').eq('trip_id', id).order('created_at');
  const { data: settlements } = await supabase.from('settlements').select('from_user_id, to_user_id, amount_cents').eq('trip_id', id);
  const transfers = minimalTransfers(balances((expenses ?? []).map((e) => ({ ...e, split: e.split as Split })), settlements ?? []));

  return (
    <>
      <p className="mt-2 text-[#4b5745]">Nothing moves through Elsewhere. Pay each other however you like, then mark it paid.</p>
      <section className="mt-6">
        <h2 className="text-xl font-semibold">To settle up</h2>
        {transfers.length === 0 ? (
          <p className="mt-2 text-[#4b5745]">Everyone is square.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#e4dfd0] rounded-xl border border-[#e4dfd0] bg-white">
            {transfers.map((t) => {
              const to = members.find((m) => m.user_id === t.to);
              return (
                <li key={`${t.from}-${t.to}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span>
                    {names.get(t.from) ?? 'Someone'} → {names.get(t.to) ?? 'someone'}: <strong>{usd.format(t.amountCents / 100)}</strong>
                  </span>
                  <span className="flex items-center gap-3 text-sm">
                    {t.from === user.id && to?.venmo_username ? (
                      <a href={venmoLink(to.venmo_username, t.amountCents, `${trip.name}`)} className="underline" rel="noopener">
                        Venmo
                      </a>
                    ) : null}
                    {t.from === user.id && to?.cashtag ? (
                      <a href={cashAppLink(to.cashtag)} className="underline" rel="noopener">
                        Cash App ({usd.format(t.amountCents / 100)})
                      </a>
                    ) : null}
                    {t.from === user.id || t.to === user.id ? (
                      <form action={markSettled.bind(null, id, t.from, t.to, t.amountCents)}>
                        <Button type="submit" size="sm" variant="outline">
                          Mark paid
                        </Button>
                      </form>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Expenses</h2>
        <ul className="mt-3 divide-y divide-[#e4dfd0] rounded-xl border border-[#e4dfd0] bg-white text-sm">
          {(expenses ?? []).map((e) => (
            <li key={e.id} className="flex justify-between px-4 py-3">
              <span>
                {e.description} · paid by {names.get(e.payer_user_id) ?? 'someone'}
              </span>
              <span>{usd.format(e.amount_cents / 100)}</span>
            </li>
          ))}
        </ul>
      </section>
      <ExpenseForm tripId={id} members={members} />
    </>
  );
}
```

- [ ] **Step 4: Run the tests, typecheck, and build**

```bash
cd apps/web && npx vitest run && npm run typecheck && npm run build; cd ../..
```
Expected: all tests pass, typecheck is clean, and the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -F - <<'EOF'
Turn the trip's extra costs into who-owes-what

Members log what they paid, split equally down to the cent. The page
nets everything into the fewest transfers, with prefilled Venmo links
and Cash App links. Either side, or the planner, marks a transfer paid.
No money moves through Elsewhere.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 15: The trip's smart feed and the members page

The feed replaces C1's minimal `/trips/[id]` page. It keeps the forwarding address, the invite section (Task 1), and the pass section (C1 Task 9). On top of those it adds what needs doing now. When nothing does, it shows the capybara's "all clear" card. The members page is a plain list, with no characters.

**Files:**
- Create: `apps/web/lib/trips/feed.ts`, `apps/web/app/trips/[id]/feed-actions.ts`, `apps/web/app/trips/[id]/members/page.tsx`, `apps/web/test/trips/feed.test.ts`
- Modify: `apps/web/app/trips/[id]/page.tsx` (rewrite the content as the feed)

**Interfaces:**
- Consumes:
  - Tasks 13–14: `tally` and `balances`
  - Task 1: `TripActionItem`, `createJoinLink`, `currentJoinLink`
  - Task 5: `intakeWorkflow`
  - C1: `inboundAddress`, `startPassCheckout`, `Character`
- Produces:
  - `FeedCard`
  - `buildFeed(input: FeedInput): FeedCard[]`
  - `isAllClear(cards): boolean`
  - `approveQuarantined(tripId, messageId)`, a server action

- [ ] **Step 1: Write the failing test**

`apps/web/test/trips/feed.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildFeed, isAllClear } from '@/lib/trips/feed';

const base = {
  tripId: 't1',
  meId: 'pat',
  isPlanner: true,
  actionItems: [],
  incidents: [],
  votes: [],
  myVoteIds: [],
  nextSegment: null,
  myNetCents: 0,
};

describe('buildFeed', () => {
  it('puts the planner’s pending question first, then my action items, then open votes', () => {
    const cards = buildFeed({
      ...base,
      incidents: [
        { id: 'i1', status: 'needs_answer', summary: 'TP 204 was cancelled.' },
        { id: 'i2', status: 'playbook_ready', summary: 'UA 64 is 3 h late.' },
      ],
      actionItems: [{ id: 'a1', title: 'Check your travel documents', detail: 'Portugal: …', source_kind: 'document_check', related_entity_id: 'm1', assigned_user_ids: ['pat'] }],
      votes: [{ id: 'v1', title: 'Which flight?', status: 'open', required_user_ids: ['pat', 'sam'] }],
    });
    expect(cards.map((c) => `${c.kind}:${c.id}`)).toEqual(['incident:i1', 'incident:i2', 'action:a1', 'vote:v1']);
    expect(cards[0]).toMatchObject({ title: 'Answer one question: TP 204 was cancelled.', href: '/trips/t1/incidents/i1' });
  });

  it('shows quarantined mail to the planner only, as an approval card', () => {
    const item = { id: 'a2', title: 'Approve a forwarded email', detail: 'x@y forwarded …', source_kind: 'inbound_quarantine', related_entity_id: 'msg-9', assigned_user_ids: ['pat'] };
    expect(buildFeed({ ...base, actionItems: [item] })[0]).toMatchObject({ kind: 'quarantine', messageId: 'msg-9' });
    expect(buildFeed({ ...base, isPlanner: false, meId: 'sam', actionItems: [item] })).toEqual([]);
  });

  it('adds money and next-up cards, and calls a feed with only those all clear', () => {
    const cards = buildFeed({
      ...base,
      myNetCents: -6000,
      nextSegment: { carrier_iata: 'TP', flight_number: '204', origin_iata: 'EWR', destination_iata: 'LIS', departure_local: '2026-11-03T18:15' },
      votes: [{ id: 'v2', title: 'Done vote', status: 'open', required_user_ids: ['pat'] }],
      myVoteIds: ['v2'],
    });
    expect(cards.map((c) => c.kind)).toEqual(['money', 'next']);
    expect(cards[0]).toMatchObject({ title: 'You owe $60.00' });
    expect(isAllClear(cards)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web && npx vitest run test/trips/feed.test.ts; cd ../..
```
Expected: FAIL, with module not found.

- [ ] **Step 3: Implement the feed**

`apps/web/lib/trips/feed.ts`:
```ts
export type FeedCard =
  | { kind: 'incident'; id: string; title: string; href: string; urgent: boolean }
  | { kind: 'action'; id: string; title: string; detail: string; href: string | null }
  | { kind: 'quarantine'; id: string; title: string; detail: string; messageId: string }
  | { kind: 'vote'; id: string; title: string; href: string }
  | { kind: 'money'; id: string; title: string; href: string }
  | { kind: 'next'; id: string; title: string; detail: string };

export interface FeedInput {
  tripId: string;
  meId: string;
  isPlanner: boolean;
  actionItems: { id: string; title: string; detail: string; source_kind: string; related_entity_id: string | null; assigned_user_ids: string[] }[];
  incidents: { id: string; status: string; summary: string }[];
  votes: { id: string; title: string; status: string; required_user_ids: string[] }[];
  myVoteIds: string[];
  nextSegment: { carrier_iata: string; flight_number: string; origin_iata: string; destination_iata: string; departure_local: string } | null;
  myNetCents: number;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const ACTION_LINKS: Record<string, (tripId: string) => string> = {
  document_check: (t) => `/trips/${t}/documents`,
  booking_confirmation: (t) => `/trips/${t}/bookings`,
  passenger_match: (t) => `/trips/${t}/bookings`,
  flight_not_found: (t) => `/trips/${t}/bookings`,
};

/** What needs doing now, most urgent first. Incidents and action items arrive pre-filtered by RLS. */
export function buildFeed(input: FeedInput): FeedCard[] {
  const t = input.tripId;
  const incidents: FeedCard[] = [...input.incidents]
    .filter((i) => i.status !== 'resolved')
    .sort((a, b) => Number(b.status === 'needs_answer') - Number(a.status === 'needs_answer'))
    .map((i) => ({
      kind: 'incident',
      id: i.id,
      title: i.status === 'needs_answer' && input.isPlanner ? `Answer one question: ${i.summary}` : i.summary,
      href: `/trips/${t}/incidents/${i.id}`,
      urgent: i.status === 'needs_answer',
    }));

  const actions: FeedCard[] = input.actionItems.flatMap((item): FeedCard[] => {
    if (item.source_kind === 'inbound_quarantine') {
      return input.isPlanner && item.related_entity_id
        ? [{ kind: 'quarantine', id: item.id, title: item.title, detail: item.detail, messageId: item.related_entity_id }]
        : [];
    }
    if (!input.isPlanner && !item.assigned_user_ids.includes(input.meId)) return [];
    if (item.source_kind === 'incident') return [];
    return [{ kind: 'action', id: item.id, title: item.title, detail: item.detail, href: ACTION_LINKS[item.source_kind]?.(t) ?? null }];
  });

  const votes: FeedCard[] = input.votes
    .filter((v) => v.status === 'open' && v.required_user_ids.includes(input.meId) && !input.myVoteIds.includes(v.id))
    .map((v) => ({ kind: 'vote', id: v.id, title: `Vote: ${v.title}`, href: `/trips/${t}/votes/${v.id}` }));

  const money: FeedCard[] =
    input.myNetCents === 0
      ? []
      : [{ kind: 'money', id: 'money', title: input.myNetCents < 0 ? `You owe ${usd.format(-input.myNetCents / 100)}` : `You’re owed ${usd.format(input.myNetCents / 100)}`, href: `/trips/${t}/money` }];

  const next: FeedCard[] = input.nextSegment
    ? [
        {
          kind: 'next',
          id: 'next',
          title: `Next up: ${input.nextSegment.carrier_iata} ${input.nextSegment.flight_number}`,
          detail: `${input.nextSegment.origin_iata} → ${input.nextSegment.destination_iata} · ${input.nextSegment.departure_local.replace('T', ' ')}`,
        },
      ]
    : [];

  return [...incidents, ...actions, ...votes, ...money, ...next];
}

/** Nothing anyone has to act on: the capybara gets the card. */
export function isAllClear(cards: FeedCard[]): boolean {
  return cards.every((card) => card.kind === 'money' || card.kind === 'next');
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/web && npx vitest run test/trips/feed.test.ts; cd ../..
```
Expected: PASS.

- [ ] **Step 5: Write the quarantine approval action**

`apps/web/app/trips/[id]/feed-actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { start } from 'workflow/api';
import { requireUser } from '@/lib/auth/user';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { intakeWorkflow } from '@/workflows/intake';

export async function approveQuarantined(tripId: string, messageId: string): Promise<void> {
  await requireUser(`/trips/${tripId}`);
  const supabase = await createClient();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: tripId });
  if (isPlanner !== true) throw new Error('Only the planner can approve forwarded mail.');
  const admin = createAdminClient();
  const { data: message } = await admin.from('inbound_messages').update({ status: 'received' }).eq('id', messageId).eq('trip_id', tripId).eq('status', 'quarantined').select('id').maybeSingle();
  if (!message) return;
  await admin.from('action_items').update({ status: 'done' }).eq('trip_id', tripId).eq('source_kind', 'inbound_quarantine').eq('related_entity_id', messageId);
  await start(intakeWorkflow, [messageId]);
  revalidatePath(`/trips/${tripId}`);
}
```

- [ ] **Step 6: Rewrite the trip page as the feed**

`apps/web/app/trips/[id]/page.tsx`. Replace the whole file. The forwarding, invite, and pass sections carry over from C1 and Task 1 unchanged.
```tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Character } from '@/components/character';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/user';
import { requireEnv } from '@/lib/env';
import { balances, type Split } from '@/lib/expenses/settle';
import { ANONYMOUS_ID_COOKIE, isAnonymousId } from '@/lib/funnel/anonymous-id';
import { assignVariant, variantPriceLabel } from '@/lib/funnel/variant';
import { createClient } from '@/lib/supabase/server';
import { buildFeed, isAllClear, type FeedCard } from '@/lib/trips/feed';
import { inboundAddress } from '@/lib/trips/inbound-code';
import { createJoinLink, currentJoinLink, startPassCheckout } from './actions';
import { approveQuarantined } from './feed-actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ pass?: string }>;

const summaryFor = (row: { event_type: string; delay_minutes: number | null }) =>
  row.event_type === 'cancellation' ? 'A flight was cancelled.' : row.event_type === 'delay' ? `A flight is running ${Math.floor((row.delay_minutes ?? 0) / 60)} h late.` : 'A flight changed.';

export default function TripPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Suspense fallback={<p className="text-[#4b5745]">Loading the trip…</p>}>
        <TripContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function TripContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params;
  const { pass } = await searchParams;
  const user = await requireUser(`/trips/${id}`);
  const supabase = await createClient();
  const { data: trip } = await supabase.from('trips').select('id, name, destination_country, start_date, end_date, inbound_code, pass_status').eq('id', id).maybeSingle();
  if (!trip) notFound();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: id });

  const [{ data: actionItems }, { data: incidents }, { data: votes }, { data: myResponses }, { data: segments }, { data: expenses }, { data: settlements }] = await Promise.all([
    supabase.from('action_items').select('id, title, detail, source_kind, related_entity_id, assigned_user_ids').eq('trip_id', id).eq('status', 'open'),
    supabase.from('incidents').select('id, status, event_type, delay_minutes').eq('trip_id', id).neq('status', 'resolved').order('detected_at', { ascending: false }),
    supabase.from('votes').select('id, title, status, required_user_ids').eq('trip_id', id).eq('status', 'open'),
    supabase.from('vote_responses').select('vote_id').eq('user_id', user.id),
    supabase.from('booking_segments').select('carrier_iata, flight_number, origin_iata, destination_iata, departure_local, scheduled_out').eq('trip_id', id).gt('scheduled_out', new Date().toISOString()).order('scheduled_out').limit(1),
    supabase.from('expenses').select('payer_user_id, amount_cents, split').eq('trip_id', id),
    supabase.from('settlements').select('from_user_id, to_user_id, amount_cents').eq('trip_id', id),
  ]);

  const cards = buildFeed({
    tripId: id,
    meId: user.id,
    isPlanner: isPlanner === true,
    actionItems: actionItems ?? [],
    incidents: (incidents ?? []).map((i) => ({ id: i.id, status: i.status, summary: summaryFor(i) })),
    votes: votes ?? [],
    myVoteIds: (myResponses ?? []).map((r) => r.vote_id),
    nextSegment: segments?.[0] ?? null,
    myNetCents: balances((expenses ?? []).map((e) => ({ ...e, split: e.split as Split })), settlements ?? [])[user.id] ?? 0,
  });

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">{trip.name}</h1>
      <p className="mt-1 text-[#4b5745]">
        {trip.start_date} → {trip.end_date} · {trip.destination_country}
      </p>
      <nav className="mt-4 flex flex-wrap gap-4 text-sm">
        <Link href={`/trips/${id}/bookings`} className="underline">Bookings</Link>
        <Link href={`/trips/${id}/documents`} className="underline">Documents</Link>
        <Link href={`/trips/${id}/money`} className="underline">Who owes what</Link>
        <Link href={`/trips/${id}/members`} className="underline">Members</Link>
      </nav>

      {isAllClear(cards) ? (
        <section className="mt-8 flex items-center gap-4 rounded-xl border border-[#cfe3c8] bg-[#f1f8ee] p-5">
          <Character character="capybara" variant="avatar" width={56} />
          <p>All clear. Nothing needs you right now — we’ll tell you if that changes.</p>
        </section>
      ) : null}
      <ul className="mt-6 space-y-3">
        {cards.map((card) => (
          <FeedItem key={`${card.kind}:${card.id}`} card={card} tripId={id} />
        ))}
      </ul>

      <section className="mt-8 rounded-xl border border-[#e4dfd0] bg-white p-6">
        <h2 className="font-semibold">Forward the bookings here</h2>
        <p className="mt-2 break-all font-mono text-lg">{inboundAddress(trip.inbound_code, requireEnv('INBOUND_DOMAIN'))}</p>
        <p className="mt-2 text-sm text-[#4b5745]">Forward flight, hotel, and rental confirmations from the email address you signed in with.</p>
      </section>
      {isPlanner === true ? <InviteSection tripId={id} /> : null}
      <PassSection tripId={id} passStatus={trip.pass_status} justPaid={pass === 'success'} isPlanner={isPlanner === true} />
    </>
  );
}

function FeedItem({ card, tripId }: { card: FeedCard; tripId: string }) {
  const tone = card.kind === 'incident' && card.urgent ? 'border-[#e7c37a] bg-[#fdf3dc]' : 'border-[#e4dfd0] bg-white';
  if (card.kind === 'quarantine') {
    return (
      <li className="rounded-xl border border-[#e4dfd0] bg-white p-4">
        <p className="font-medium">{card.title}</p>
        <p className="mt-1 text-sm text-[#4b5745]">{card.detail}</p>
        <form action={approveQuarantined.bind(null, tripId, card.messageId)} className="mt-3">
          <Button type="submit" size="sm" variant="outline">Approve and read it</Button>
        </form>
      </li>
    );
  }
  const body = (
    <>
      <p className="font-medium">{card.title}</p>
      {'detail' in card && card.detail ? <p className="mt-1 text-sm text-[#4b5745]">{card.detail}</p> : null}
    </>
  );
  const href = 'href' in card ? card.href : null;
  return (
    <li className={`rounded-xl border p-4 ${tone}`}>
      {href ? <Link href={href} className="block">{body}</Link> : body}
    </li>
  );
}

async function InviteSection({ tripId }: { tripId: string }) {
  const link = await currentJoinLink(tripId);
  return (
    <section className="mt-6 rounded-xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="font-semibold">Invite the group</h2>
      {link ? (
        <p className="mt-2 break-all font-mono text-sm">{link}</p>
      ) : (
        <p className="mt-2 text-sm text-[#4b5745]">Create a link and drop it in the group chat. Anyone with it can join until a week after the trip.</p>
      )}
      <form
        action={async () => {
          'use server';
          await createJoinLink(tripId);
        }}
        className="mt-3"
      >
        <Button type="submit" variant="outline">{link ? 'Reset the link' : 'Create invite link'}</Button>
      </form>
    </section>
  );
}

async function PassSection({ tripId, passStatus, justPaid, isPlanner }: { tripId: string; passStatus: 'none' | 'active' | 'comp'; justPaid: boolean; isPlanner: boolean }) {
  if (passStatus !== 'none') {
    return (
      <section className="mt-6 rounded-xl border border-[#cfe3c8] bg-[#f1f8ee] p-6">
        <h2 className="font-semibold">Trip pass active</h2>
        <p className="mt-1 text-sm text-[#4b5745]">We’re watching every confirmed flight for the group.</p>
      </section>
    );
  }
  if (justPaid) {
    return <section role="status" className="mt-6 rounded-xl border border-[#e4dfd0] bg-white p-6">Payment received. Turning on the trip pass — refresh in a moment.</section>;
  }
  if (!isPlanner) return null;
  const anonymousId = (await cookies()).get(ANONYMOUS_ID_COOKIE)?.value;
  const price = variantPriceLabel(isAnonymousId(anonymousId) ? assignVariant(anonymousId) : 'p19');
  return (
    <section className="mt-6 rounded-xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="font-semibold">Watch this trip</h2>
      <p className="mt-1 text-sm text-[#4b5745]">One {price} pass covers the whole group: flight watching, cited playbooks, and group alerts. We draft the messages; you send them.</p>
      <form action={startPassCheckout.bind(null, tripId)} className="mt-4">
        <Button type="submit">Get the trip pass — {price}</Button>
      </form>
    </section>
  );
}
```

- [ ] **Step 7: Write the members page**

`apps/web/app/trips/[id]/members/page.tsx`:
```tsx
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/user';
import { createClient } from '@/lib/supabase/server';

type Params = Promise<{ id: string }>;

export default function MembersPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Who’s going</h1>
      <Suspense fallback={<p className="mt-6 text-[#4b5745]">Loading…</p>}>
        <MembersContent params={params} />
      </Suspense>
    </main>
  );
}

async function MembersContent({ params }: { params: Params }) {
  const { id } = await params;
  await requireUser(`/trips/${id}/members`);
  const supabase = await createClient();
  const { data: directory } = await supabase.rpc('trip_directory', { p_trip_id: id });
  if (!directory || directory.length === 0) notFound();
  const { data: assignments } = await supabase.from('booking_members').select('member_id, bookings!inner(provider)').eq('trip_id', id);
  const bookingsBy = new Map<string, string[]>();
  for (const row of assignments ?? []) {
    const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
    bookingsBy.set(row.member_id, [...(bookingsBy.get(row.member_id) ?? []), booking.provider]);
  }
  return (
    <ul className="mt-6 divide-y divide-[#e4dfd0] rounded-xl border border-[#e4dfd0] bg-white">
      {(directory as { member_id: string; display_name: string; role: string }[]).map((member) => (
        <li key={member.member_id} className="px-4 py-3">
          <p className="font-medium">
            {member.display_name}
            {member.role === 'planner' ? <span className="ml-2 text-sm text-[#4b5745]">planner</span> : null}
          </p>
          <p className="text-sm text-[#4b5745]">{(bookingsBy.get(member.member_id) ?? []).join(', ') || 'Not on a booking yet'}</p>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 8: Run the tests, typecheck, and build**

```bash
cd apps/web && npx vitest run && npm run typecheck && npm run build; cd ../..
```
Expected: all tests pass, typecheck is clean, and the build succeeds.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -F - <<'EOF'
Turn the trip page into a feed of what needs doing now

The planner's open question comes first, then each person's own action
items, votes still waiting on them, and money. Quarantined mail gets
an approve button. When nothing needs anyone, the capybara says so.
The forwarding address, invite link, and trip pass stay on the page,
and a plain members page shows who is on which booking.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 16: `/admin` for hand-run trips, and the retention job

`/admin` is where the founder runs the 10–20 follower trips by hand:
- see every trip
- comp a pass, which also starts monitoring
- rerun document checks
- approve quarantined mail
- edit a held playbook (validated and logged), then release it
- see flights on fallback watching: no AeroAPI alert, or polling kept failing (Task 9)

The daily retention cron enforces the spec's data limits:
- documents: 30 days after the member's last trip ends, unless they chose to keep them
- raw inbound files: 30 days
- bookings: one year after the trip

A second daily cron runs the spec's T-30 document check. It re-checks every member of each trip that starts in 30 days, which leaves time to renew a passport. Task 9 covers T-72h for trips with a pass. `runDocumentChecks` notifies only members with a newly flagged problem, so the daily run never repeats an alert.

**Files:**
- Create: `apps/web/lib/admin/emails.ts`, `apps/web/lib/admin/guard.ts`, `apps/web/lib/retention.ts`, `apps/web/app/admin/page.tsx`, `apps/web/app/admin/playbook-editor.tsx`, `apps/web/app/admin/actions.ts`, `apps/web/app/api/cron/retention/route.ts`, `apps/web/app/api/cron/document-checks/route.ts`, `apps/web/test/admin/guard.test.ts`, `apps/web/test/retention.test.ts`, `apps/web/test/cron/document-checks-route.test.ts`
- Modify: `apps/web/lib/assist/incidents.ts` (`requestReview` uses `adminEmails`), `apps/web/vercel.json` (add the retention and document-check crons), `.env.example`

**Interfaces:**
- Consumes:
  - Task 9: `tripMonitorWorkflow`
  - Task 12: `incidentReleaseToken`, `resumeHook`, `assessIncident`
  - Task 11: `checkCitations` and `PlaybookSchema`
  - Task 7: `runDocumentChecks`
  - Task 9: `booking_segments.monitor_state = 'polling_only'`, set when alert registration fails or polling keeps failing
  - Task 6/15: `approveQuarantined` (the same logic, here with admin rights)
  - Task 5: `removeInbound`
- Produces:
  - **Admin allow list** (`lib/admin/emails.ts`, pure, so workflow steps can import it):
    - `adminEmails(env?): string[]`
    - `isAdminEmail(email, env?): boolean`
  - **Admin guard:** `requireAdmin(): Promise<CurrentUser>`
  - **Retention:**
    - `retentionPlan(input): RetentionPlan`
    - `inboundObjects(admin, storagePath): Promise<string[]>`
    - `runRetention(now?): Promise<RetentionPlan>`
  - **Crons:** `GET /api/cron/retention` and `GET /api/cron/document-checks`, both daily with Bearer `CRON_SECRET`
  - **Server actions:**
    - `compPass(tripId)`
    - `rerunChecks(tripId)`
    - `adminApproveQuarantined(messageId)`
    - `editPlaybook(incidentId, prev, form)`
    - `releasePlaybook(incidentId)`

- [ ] **Step 1: Write the failing tests**

`apps/web/test/admin/guard.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { adminEmails, isAdminEmail } from '@/lib/admin/emails';

describe('admin guard', () => {
  it('reads a comma-separated allow list, case-insensitively', () => {
    const env = { ADMIN_EMAILS: ' Founder@Example.test , ops@example.test ' };
    expect(adminEmails(env)).toEqual(['founder@example.test', 'ops@example.test']);
    expect(isAdminEmail('FOUNDER@example.test', env)).toBe(true);
    expect(isAdminEmail('someone@example.test', env)).toBe(false);
    expect(isAdminEmail(null, env)).toBe(false);
    expect(isAdminEmail('founder@example.test', {})).toBe(false);
  });
});
```

`apps/web/test/retention.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { inboundObjects, retentionPlan } from '@/lib/retention';

const now = new Date('2027-01-31T00:00:00Z');

describe('retentionPlan', () => {
  it('deletes documents 30 days after the member’s last trip, unless kept', () => {
    const plan = retentionPlan({
      now,
      trips: [
        { id: 'old', end_date: '2026-12-01' },
        { id: 'future', end_date: '2027-03-01' },
      ],
      members: [
        { trip_id: 'old', user_id: 'gone' },
        { trip_id: 'old', user_id: 'keeper' },
        { trip_id: 'old', user_id: 'traveling-again' },
        { trip_id: 'future', user_id: 'traveling-again' },
      ],
      documents: [
        { user_id: 'gone', keep_on_profile: false },
        { user_id: 'keeper', keep_on_profile: true },
        { user_id: 'traveling-again', keep_on_profile: false },
      ],
      inbound: [],
    });
    expect(plan.deleteDocumentsFor).toEqual(['gone']);
  });

  it('purges raw inbound after 30 days and bookings a year after the trip', () => {
    const plan = retentionPlan({
      now,
      trips: [
        { id: 'ancient', end_date: '2025-12-31' },
        { id: 'recent', end_date: '2026-12-31' },
      ],
      members: [],
      documents: [],
      inbound: [
        { id: 'm1', storage_path: 't/m1/email.json', received_at: '2026-12-15T00:00:00Z' },
        { id: 'm2', storage_path: 't/m2/email.json', received_at: '2027-01-20T00:00:00Z' },
        { id: 'm3', storage_path: null, received_at: '2026-11-01T00:00:00Z' },
      ],
    });
    expect(plan.purgeInbound).toEqual([{ id: 'm1', storage_path: 't/m1/email.json' }]);
    expect(plan.deleteBookingsForTrips).toEqual(['ancient']);
  });

  it('removes an email folder whole, but a screenshot alone', async () => {
    const listed: string[] = [];
    const admin = {
      storage: {
        from: () => ({
          list: async (prefix: string) => {
            listed.push(prefix);
            return { data: [{ name: 'email.json' }, { name: '0-ticket.pdf' }] };
          },
        }),
      },
    };
    expect(await inboundObjects(admin, 't/m1/email.json')).toEqual(['t/m1/email.json', 't/m1/0-ticket.pdf']);
    expect(await inboundObjects(admin, 't/screenshots/abc.png')).toEqual(['t/screenshots/abc.png']);
    expect(listed).toEqual(['t/m1']);
  });
});
```

`apps/web/test/cron/document-checks-route.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checked: string[] = [];
const queried: string[] = [];

vi.mock('@/lib/documents/service', () => ({
  runDocumentChecks: async (tripId: string) => {
    checked.push(tripId);
  },
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: async (_column: string, day: string) => {
          queried.push(day);
          return { data: [{ id: 'trip-1' }, { id: 'trip-2' }], error: null };
        },
      }),
    }),
  }),
}));

beforeEach(() => {
  checked.length = 0;
  queried.length = 0;
  process.env.CRON_SECRET = 'cron-test';
});

afterEach(() => vi.useRealTimers());

describe('GET /api/cron/document-checks', () => {
  it('refuses calls without the cron secret', async () => {
    const { GET } = await import('@/app/api/cron/document-checks/route');
    expect((await GET(new Request('https://x.test/api/cron/document-checks'))).status).toBe(401);
    expect(checked).toEqual([]);
  });

  it('re-checks every trip that starts 30 days from today', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T13:00:00Z'));
    const { GET } = await import('@/app/api/cron/document-checks/route');
    const res = await GET(new Request('https://x.test/api/cron/document-checks', { headers: { authorization: 'Bearer cron-test' } }));
    expect(await res.json()).toEqual({ day: '2026-11-03', checked: 2 });
    expect(queried).toEqual(['2026-11-03']);
    expect(checked).toEqual(['trip-1', 'trip-2']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/admin test/retention.test.ts test/cron; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 3: Implement the guard and the retention plan**

`apps/web/lib/admin/emails.ts`:
```ts
export function adminEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null, env: Record<string, string | undefined> = process.env): boolean {
  return email !== null && adminEmails(env).includes(email.toLowerCase());
}
```

`apps/web/lib/admin/guard.ts`:
```ts
import { notFound } from 'next/navigation';
import { requireUser, type CurrentUser } from '@/lib/auth/user';
import { isAdminEmail } from './emails';

/** Non-admins get a 404, so /admin doesn't advertise itself. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser('/admin');
  if (!isAdminEmail(user.email)) notFound();
  return user;
}
```

`apps/web/lib/retention.ts`:
```ts
const DAY = 24 * 60 * 60 * 1000;

export interface RetentionInput {
  now: Date;
  trips: { id: string; end_date: string | null }[];
  members: { trip_id: string; user_id: string }[];
  documents: { user_id: string; keep_on_profile: boolean }[];
  inbound: { id: string; storage_path: string | null; received_at: string }[];
}

export interface RetentionPlan {
  deleteDocumentsFor: string[];
  purgeInbound: { id: string; storage_path: string }[];
  deleteBookingsForTrips: string[];
}

export function retentionPlan(input: RetentionInput): RetentionPlan {
  const ends = new Map(input.trips.map((trip) => [trip.id, trip.end_date ? new Date(`${trip.end_date}T23:59:59Z`).getTime() : Number.POSITIVE_INFINITY]));
  const lastTripEnd = new Map<string, number>();
  for (const member of input.members) {
    lastTripEnd.set(member.user_id, Math.max(lastTripEnd.get(member.user_id) ?? 0, ends.get(member.trip_id) ?? Number.POSITIVE_INFINITY));
  }
  const documentCutoff = input.now.getTime() - 30 * DAY;
  const deleteDocumentsFor = [
    ...new Set(
      input.documents
        .filter((doc) => !doc.keep_on_profile && (lastTripEnd.get(doc.user_id) ?? Number.POSITIVE_INFINITY) < documentCutoff)
        .map((doc) => doc.user_id),
    ),
  ].sort();
  const purgeInbound = input.inbound
    .filter((m): m is { id: string; storage_path: string; received_at: string } => m.storage_path !== null && new Date(m.received_at).getTime() < documentCutoff)
    .map(({ id, storage_path }) => ({ id, storage_path }));
  const bookingCutoff = input.now.getTime() - 365 * DAY;
  const deleteBookingsForTrips = input.trips.filter((trip) => (ends.get(trip.id) ?? Number.POSITIVE_INFINITY) < bookingCutoff).map((trip) => trip.id);
  return { deleteDocumentsFor, purgeInbound, deleteBookingsForTrips };
}

/**
 * A forwarded email lives in `<trip>/<message>/` as email.json plus its attachments, so the whole folder goes.
 * A screenshot is a single file in `<trip>/screenshots/`, a folder it shares with the trip's other screenshots.
 */
export async function inboundObjects(
  admin: { storage: { from(bucket: string): { list(prefix: string): Promise<{ data: { name: string }[] | null }> } } },
  storagePath: string,
): Promise<string[]> {
  if (!storagePath.endsWith('/email.json')) return [storagePath];
  const prefix = storagePath.slice(0, -'/email.json'.length);
  const { data: objects } = await admin.storage.from('inbound').list(prefix);
  return [...new Set([storagePath, ...(objects ?? []).map((object) => `${prefix}/${object.name}`)])];
}

export async function runRetention(now: Date = new Date()): Promise<RetentionPlan> {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { removeInbound } = await import('@/lib/intake/storage');
  const admin = createAdminClient();
  const [{ data: trips }, { data: members }, { data: documents }, { data: inbound }] = await Promise.all([
    admin.from('trips').select('id, end_date'),
    admin.from('trip_members').select('trip_id, user_id'),
    admin.from('member_documents').select('user_id, keep_on_profile'),
    admin.from('inbound_messages').select('id, storage_path, received_at').not('storage_path', 'is', null),
  ]);
  const plan = retentionPlan({ now, trips: trips ?? [], members: members ?? [], documents: documents ?? [], inbound: inbound ?? [] });

  if (plan.deleteDocumentsFor.length > 0) {
    await admin.from('member_documents').delete().in('user_id', plan.deleteDocumentsFor).eq('keep_on_profile', false);
  }
  for (const message of plan.purgeInbound) {
    await removeInbound(await inboundObjects(admin, message.storage_path));
    await admin.from('inbound_messages').update({ storage_path: null }).eq('id', message.id);
  }
  if (plan.deleteBookingsForTrips.length > 0) {
    await admin.from('bookings').delete().in('trip_id', plan.deleteBookingsForTrips);
  }
  return plan;
}
```

`apps/web/app/api/cron/retention/route.ts`:
```ts
import { runRetention } from '@/lib/retention';

export async function GET(request: Request): Promise<Response> {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }
  const plan = await runRetention();
  return Response.json({
    documentsDeletedFor: plan.deleteDocumentsFor.length,
    inboundPurged: plan.purgeInbound.length,
    tripsWithBookingsDeleted: plan.deleteBookingsForTrips.length,
  });
}
```

`apps/web/app/api/cron/document-checks/route.ts`:
```ts
import { runDocumentChecks } from '@/lib/documents/service';
import { createAdminClient } from '@/lib/supabase/admin';

/** The spec's T-30 check: daily, re-check every member of each trip that starts 30 days from today (UTC). */
export async function GET(request: Request): Promise<Response> {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }
  const day = new Date(Date.now() + 30 * 24 * 3600_000).toISOString().slice(0, 10);
  const { data: trips, error } = await createAdminClient().from('trips').select('id').eq('start_date', day);
  if (error) throw new Error(error.message);
  for (const trip of trips ?? []) await runDocumentChecks(trip.id);
  return Response.json({ day, checked: (trips ?? []).length });
}
```

`apps/web/vercel.json`. Replace the whole file:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/notifications", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/retention", "schedule": "0 7 * * *" },
    { "path": "/api/cron/document-checks", "schedule": "0 13 * * *" }
  ]
}
```
The document check runs at 13:00 UTC, morning in the US. Its notices are not urgent, so quiet hours still apply.

Append to `.env.example`:
```bash
# /admin allow list (comma-separated emails)
ADMIN_EMAILS=
```

In `apps/web/lib/assist/incidents.ts`, add `import { adminEmails } from '@/lib/admin/emails';` to the imports and replace the inline parse in `requestReview`:
```ts
  const emails = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
```
with:
```ts
  const emails = adminEmails();
```

- [ ] **Step 4: Run the tests**

```bash
cd apps/web && npx vitest run test/admin test/retention.test.ts test/cron test/assist; cd ../..
```
Expected: PASS.

- [ ] **Step 5: Write the admin actions**

`apps/web/app/admin/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { resumeHook, start } from 'workflow/api';
import { requireAdmin } from '@/lib/admin/guard';
import { assessIncident } from '@/lib/assist/incidents';
import { checkCitations } from '@/lib/assist/citation-check';
import { PlaybookSchema } from '@/lib/assist/playbook-schema';
import { runDocumentChecks } from '@/lib/documents/service';
import { createAdminClient } from '@/lib/supabase/admin';
import { incidentReleaseToken } from '@/lib/workflows/tokens';
import { intakeWorkflow } from '@/workflows/intake';
import { tripMonitorWorkflow } from '@/workflows/trip-monitor';

/** A comped trip is hand-run: its playbooks wait for review before anyone is notified. */
export async function compPass(tripId: string): Promise<void> {
  const founder = await requireAdmin();
  const admin = createAdminClient();
  await admin.from('passes').insert({ trip_id: tripId, price_variant: 'comp', amount_cents: 0, status: 'comp', created_by: founder.id, paid_at: new Date().toISOString() });
  await admin.from('trips').update({ pass_status: 'comp' }).eq('id', tripId);
  await start(tripMonitorWorkflow, [tripId]);
  revalidatePath('/admin');
}

export async function rerunChecks(tripId: string): Promise<void> {
  await requireAdmin();
  await runDocumentChecks(tripId);
  revalidatePath('/admin');
}

export async function adminApproveQuarantined(messageId: string): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: message } = await admin.from('inbound_messages').update({ status: 'received' }).eq('id', messageId).eq('status', 'quarantined').select('id, trip_id').maybeSingle();
  if (!message) return;
  await admin.from('action_items').update({ status: 'done' }).eq('trip_id', message.trip_id).eq('source_kind', 'inbound_quarantine').eq('related_entity_id', messageId);
  await start(intakeWorkflow, [messageId]);
  revalidatePath('/admin');
}

export interface EditState {
  error: string | null;
  saved: boolean;
}

/** Saves an edited playbook as a new version, only if it still passes the citation check. */
export async function editPlaybook(incidentId: string, _prev: EditState, form: FormData): Promise<EditState> {
  const founder = await requireAdmin();
  let parsed;
  try {
    parsed = PlaybookSchema.safeParse(JSON.parse(String(form.get('playbook') ?? '')));
  } catch {
    return { error: 'That is not valid JSON.', saved: false };
  }
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), saved: false };
  const assessment = await assessIncident(incidentId);
  const issues = checkCitations(parsed.data, assessment.applying, assessment.extraNumbers);
  if (issues.length > 0) return { error: `Citation check failed: ${issues.map((i) => `${i.path} ${i.problem} ${i.detail}`).join('; ')}`, saved: false };

  const cited = new Set([...parsed.data.owed, ...parsed.data.steps, ...parsed.data.messages].flatMap((item) => item.rule_ids));
  const admin = createAdminClient();
  const { data: playbook } = await admin
    .from('playbooks')
    .insert({
      incident_id: incidentId,
      content: parsed.data,
      rules_cited: assessment.applying.filter((r) => cited.has(r.id)).map((r) => ({ rule_id: r.id, rule_version: r.version })),
      model: 'founder-edit',
      citation_check_passed: true,
    })
    .select('id')
    .single();
  await admin.from('incident_events').insert({ incident_id: incidentId, kind: 'playbook_edited', actor_user_id: founder.id, detail: { playbook_id: playbook?.id } });
  revalidatePath('/admin');
  return { error: null, saved: true };
}

export async function releasePlaybook(incidentId: string): Promise<void> {
  const founder = await requireAdmin();
  await resumeHook(incidentReleaseToken(incidentId), { releasedBy: founder.id });
  revalidatePath('/admin');
}
```

- [ ] **Step 6: Write the admin page**

`apps/web/app/admin/playbook-editor.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { editPlaybook, type EditState } from './actions';

export function PlaybookEditor({ incidentId, json }: { incidentId: string; json: string }) {
  const [state, action, pending] = useActionState<EditState, FormData>(editPlaybook.bind(null, incidentId), { error: null, saved: false });
  return (
    <form action={action} className="mt-2">
      <textarea name="playbook" defaultValue={json} className="h-64 w-full rounded-md border border-[#d9d3c2] p-2 font-mono text-xs" />
      {state.error ? <p role="alert" className="text-sm text-[#b42318]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm text-[#2f6b2a]">Saved as a new version.</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="mt-2">
        {pending ? 'Checking…' : 'Save edit'}
      </Button>
    </form>
  );
}
```

`apps/web/app/admin/page.tsx`:
```tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { adminApproveQuarantined, compPass, releasePlaybook, rerunChecks } from './actions';
import { PlaybookEditor } from './playbook-editor';

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Hand-run trips</h1>
      <Suspense fallback={<p className="mt-6 text-[#4b5745]">Loading…</p>}>
        <AdminContent />
      </Suspense>
    </main>
  );
}

async function AdminContent() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: trips }, { data: incidents }, { data: quarantined }, { data: fallback }] = await Promise.all([
    admin.from('trips').select('id, name, pass_status, start_date, end_date').order('start_date', { ascending: true }).limit(200),
    admin.from('incidents').select('id, trip_id, event_type, status, detected_at').neq('status', 'resolved').order('detected_at', { ascending: false }).limit(50),
    admin.from('inbound_messages').select('id, trip_id, sender, subject').eq('status', 'quarantined').limit(50),
    admin.from('booking_segments').select('id, trip_id, carrier_iata, flight_number, departure_local').eq('monitor_state', 'polling_only').order('scheduled_out').limit(50),
  ]);
  const playbooks = new Map<string, unknown>();
  for (const incident of incidents ?? []) {
    const { data } = await admin.from('playbooks').select('content').eq('incident_id', incident.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (data) playbooks.set(incident.id, data.content);
  }

  return (
    <>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Trips</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="text-[#4b5745]">
              <th className="py-2">Trip</th>
              <th>Dates</th>
              <th>Pass</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(trips ?? []).map((trip) => (
              <tr key={trip.id} className="border-t border-[#e4dfd0]">
                <td className="py-2">
                  <Link href={`/trips/${trip.id}`} className="underline">{trip.name}</Link>
                </td>
                <td>{trip.start_date} → {trip.end_date}</td>
                <td>{trip.pass_status}</td>
                <td className="flex gap-2 py-2">
                  {trip.pass_status === 'none' ? (
                    <form action={compPass.bind(null, trip.id)}>
                      <Button size="sm" variant="outline" type="submit">Comp and hand-run</Button>
                    </form>
                  ) : null}
                  <form action={rerunChecks.bind(null, trip.id)}>
                    <Button size="sm" variant="outline" type="submit">Re-run document checks</Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Open incidents</h2>
        {(incidents ?? []).map((incident) => (
          <article key={incident.id} id={incident.id} className="mt-4 rounded-xl border border-[#e4dfd0] bg-white p-4">
            <p className="font-medium">
              {incident.event_type} · {incident.status} ·{' '}
              <Link href={`/trips/${incident.trip_id}/incidents/${incident.id}`} className="underline">open</Link>
            </p>
            {playbooks.has(incident.id) ? (
              <>
                <PlaybookEditor incidentId={incident.id} json={JSON.stringify(playbooks.get(incident.id), null, 2)} />
                <form action={releasePlaybook.bind(null, incident.id)} className="mt-2">
                  <Button size="sm" type="submit">Release to the group</Button>
                </form>
              </>
            ) : null}
          </article>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Flights on fallback watching</h2>
        <p className="mt-1 text-sm text-[#4b5745]">AeroAPI alerts could not be registered, or polling kept failing. Check these flights by hand until they end.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {(fallback ?? []).map((segment) => (
            <li key={segment.id} className="rounded-lg border border-[#e4dfd0] bg-white p-3">
              <Link href={`/trips/${segment.trip_id}`} className="underline">
                {segment.carrier_iata} {segment.flight_number}
              </Link>{' '}
              · {segment.departure_local.replace('T', ' ')}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Quarantined mail</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(quarantined ?? []).map((message) => (
            <li key={message.id} className="flex items-center justify-between rounded-lg border border-[#e4dfd0] bg-white p-3">
              <span>{message.sender ?? 'unknown'} · {message.subject}</span>
              <form action={adminApproveQuarantined.bind(null, message.id)}>
                <Button size="sm" variant="outline" type="submit">Approve</Button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
```

"Release to the group" resumes the incident's release hook. It has no effect once the two-hour hold has already released on its own, because the hook is gone by then.

- [ ] **Step 7: Run the tests, typecheck, and build**

```bash
cd apps/web && npx vitest run && npm run typecheck && npm run build; cd ../..
```
Expected: all tests pass, typecheck is clean, and the build succeeds.

- [ ] **Step 8: Commit**

```bash
git add apps/web .env.example
git commit -F - <<'EOF'
Add /admin for hand-run trips, and the daily retention job

The founder comps a pass, which starts monitoring and holds every
playbook for review. They can rerun document checks, approve
quarantined mail, and edit a held playbook. An edit is saved as a new
version only if it still passes the citation check, and every edit is
logged. Flights on fallback watching are listed for a manual check.
Retention deletes documents 30 days after a member's last trip unless
they kept them, raw inbound files after 30 days, and bookings a year
after the trip. A second daily cron runs the T-30 document check.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 17: The end-to-end group trip, and the launch evals

One Playwright run proves the whole loop against a real database:
- rule page, offer, and a new trip
- a forwarded booking that becomes the itinerary
- a member who joins by link and claims their seat
- a paid pass that starts monitoring
- a cancellation
- the planner's one question, then a cited playbook emailed to both travelers
- the group vote

The run uses an `e2e` Supabase branch. The run never contacts external services: each one is replaced by a guarded test seam:
- AI: canned model output
- inbound email: fixture
- AeroAPI: fixtures
- outgoing mail: a local outbox
- Stripe and Resend webhooks: signed locally

Two eval scripts run the real models on real, consented confirmations kept outside the repo. Launch needs:
- **Extraction:** at least 95% field accuracy.
- **Playbooks:** 100% pass the citation check without falling back to the template, and every replayed case matches its hand-checked expected rules.

**Files:**
- Create:
  - `apps/web/playwright.config.ts`, `apps/web/.env.e2e.example`
  - `apps/web/e2e/env.ts`, `apps/web/e2e/prepare.sh`, `apps/web/e2e/helpers.ts`, `apps/web/e2e/group-trip.spec.ts`
  - `apps/web/scripts/setup-storage.mts`, `apps/web/scripts/eval-extraction.mts`, `apps/web/scripts/eval-replay.mts`
- Modify: `apps/web/package.json` (dev dependency `@playwright/test`, scripts), `.gitignore`

**Interfaces:**
- Consumes:
  - **Seams:** Task 3 `model()` (`ELSEWHERE_AI_FAKE_DIR`), Task 5 `fetchInboundEmail` (`ELSEWHERE_INBOUND_FIXTURE_DIR`), Task 4 `fixtureAeroApi` (`ELSEWHERE_AEROAPI_FIXTURE_DIR`, including Task 13's `routes/`), Task 2 `deliver` (`ELSEWHERE_OUTBOX_DIR`)
  - **Helpers:** Task 6 `signStandardWebhook` and `TEST_WEBHOOK_SECRET`; Task 4 `localDateTime`
  - **Evals:** Task 3 `extractBookings`; Task 12 `assess`; Task 11 `generatePlaybook`; Task 10 `ASK_ORDER`
  - **Fixture library:** C1's `test/fixtures/rules-library.json`, baked into the e2e build in place of the real library
- Produces:
  - `npm run e2e`
  - `npm run eval:extraction -- <dir>` and `npm run eval:replay -- <dir>`, which exit non-zero below target
  - `scripts/setup-storage.mts`, which creates the private `inbound` bucket and is reused for production in Task 18

**How the e2e server runs:**
- **Build:** Playwright's `webServer` runs `e2e/prepare.sh`, then `next start` on port 3200, with every seam variable set.
- **Fixture library:** `prepare.sh` copies the fixture library over `packages/rules/dist/rules.json` and runs `next build` directly, so `prebuild` cannot overwrite it. A shell trap rebuilds the real library afterwards.
- **Workflows:** run on the local World, which `next start` uses by default.
  - `PORT` tells it where to send queue requests.
  - `WORKFLOW_LOCAL_DATA_DIR` keeps run data in `e2e/.run`.
  - `WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS=false` stops last run's sleeping monitors from waking.
- **Dated fixtures:** anything holding a date is written by the spec at run time, 30 days ahead. The run never goes stale.

- [ ] **Step 1: [Founder confirms] Create the `e2e` database branch and its env file**

This creates a billable Supabase branch on project `xiinobmygdfwkpjtqauo`. Ask first.
1. **Create the branch.** Supabase MCP `create_branch`, name `e2e`, accepting the cost it quotes. A new branch applies the project's migration history, including `00012`.
2. **Check the migrations.** `list_migrations` on the branch's project ref must list `00012_group_trip_assist`. If it doesn't, run `apply_migration` with the contents of `supabase/migrations/00012_group_trip_assist.sql`.
3. **Get the URL and keys.**
   - `get_project_url` and `get_publishable_keys` on the branch give the URL and the anon key.
   - The founder copies the branch's service-role key from Dashboard → Settings → API Keys.
4. **Write the env file.** Put all three in `apps/web/.env.e2e.local`. It is gitignored by `.env.*.local`.

`apps/web/.env.e2e.example`:
```bash
# Copy to .env.e2e.local. Values come from the `e2e` Supabase branch, never production.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`apps/web/scripts/setup-storage.mts`:
```ts
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
```

Run it against the branch:
```bash
cd apps/web && node --env-file=.env.e2e.local --import tsx scripts/setup-storage.mts; cd ../..
```
Expected: `created the private inbound bucket`.

- [ ] **Step 2: Install Playwright, and add the scripts and ignores**

```bash
npm install -D @playwright/test@1.63.0 -w @elsewhere/web
cd apps/web && npx playwright install chromium; cd ../..
```

In `apps/web/package.json` `scripts`, add:
```json
"e2e": "playwright test",
"eval:extraction": "node --conditions=react-server --import tsx scripts/eval-extraction.mts",
"eval:replay": "node --conditions=react-server --import tsx scripts/eval-replay.mts"
```
The evals import modules marked `server-only`. The `react-server` condition resolves that package to its empty module, as Next does on the server. Without the flag, `server-only` throws on import. This was verified with `tsx` 4.23 on Node 24.

Append to `.gitignore`:
```
# Workflow local World data, and e2e run output
apps/web/.workflow-data/
apps/web/e2e/.run/
apps/web/test-results/
apps/web/playwright-report/
```

- [ ] **Step 3: Write the e2e environment, the Playwright config, and the build script**

`apps/web/e2e/env.ts`:
```ts
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
```

`apps/web/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, PORT, serverEnv } from './e2e/env';

export default defineConfig({
  testDir: './e2e',
  timeout: 360_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Builds with the fixture rules library, then serves the production build.
    command: `bash e2e/prepare.sh && npx next start --port ${PORT}`,
    url: `${BASE_URL}/`,
    reuseExistingServer: false,
    timeout: 600_000,
    env: serverEnv(),
  },
});
```

`apps/web/e2e/prepare.sh`:
```bash
#!/usr/bin/env bash
# Builds the e2e server: a clean run directory and the fixture rules library baked in.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf e2e/.run
mkdir -p e2e/.run/ai e2e/.run/inbound e2e/.run/outbox e2e/.run/workflow \
  e2e/.run/aeroapi/schedules e2e/.run/aeroapi/airports e2e/.run/aeroapi/routes e2e/.run/aeroapi/flights

npm run rules:build -w @elsewhere/rules
# Whatever happens, leave the real library in dist/ for the next dev or build.
trap 'npm run rules:build -w @elsewhere/rules >/dev/null' EXIT
cp test/fixtures/rules-library.json ../../packages/rules/dist/rules.json

# `next build`, not `npm run build`: prebuild would rebuild the real library over the fixture.
npx next build
```

- [ ] **Step 4: Write the e2e helpers**

`apps/web/e2e/helpers.ts`:
```ts
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

export async function pollRow<T>(read: () => PromiseLike<{ data: T | null }>, accept: (row: T) => boolean, timeout = 90_000): Promise<T> {
  let found: T | null = null;
  await expect
    .poll(
      async () => {
        const { data } = await read();
        found = data !== null && accept(data) ? data : null;
        return found !== null;
      },
      { timeout, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
  return found as T;
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

const REFUND_RULE = 'fixture-us-refund-cancelled-flight';

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
        passenger_names: ['PLANNER/PAT MR', 'MEMBER/MO MS'],
        segments: [
          { carrier_iata: 'TP', flight_number: '204', origin_iata: 'EWR', destination_iata: 'LIS', departure_local: plan.departureLocal, arrival_local: plan.arrivalLocal },
        ],
        confidence: { confirmation_code: 0.99, passengers: 0.98, segments: 0.97 },
      },
    ],
  });
  // Passes the citation check: "7" appears in the refund rule's timing.
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
  write(path.join(aero, 'airports'), 'EWR.json', { code_iata: 'EWR', country_code: 'US', latitude: 40.6925, longitude: -74.1687, timezone: 'America/New_York' });
  write(path.join(aero, 'airports'), 'LIS.json', { code_iata: 'LIS', country_code: 'PT', latitude: 38.7813, longitude: -9.1359, timezone: 'Europe/Lisbon' });
  const nextDay = new Date(new Date(plan.scheduledOut).getTime() + DAY);
  write(path.join(aero, 'routes'), 'EWR-LIS.json', [
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
```

- [ ] **Step 5: Write the end-to-end spec**

`apps/web/e2e/group-trip.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { signStandardWebhook, TEST_WEBHOOK_SECRET } from '../test/helpers/webhooks';
import { E2E } from './env';
import {
  cancelledAlert,
  cleanup,
  createTestUser,
  db,
  flightPlan,
  pollRow,
  readOutbox,
  signIn,
  stripeSignature,
  writeInboundEmail,
  writeRunFixtures,
  type TestUser,
} from './helpers';

const run = Date.now().toString(36);
const plan = flightPlan();
const tripName = `E2E Lisbon ${run}`;
const users: TestUser[] = [];
let tripId: string | null = null;

test.afterAll(async () => {
  await cleanup(tripId, users);
});

test('a group trip, from rule page to cited playbook and vote', async ({ browser, page, request }) => {
  writeRunFixtures(plan);
  const planner = await createTestUser(`e2e-planner-${run}@example.com`);
  const member = await createTestUser(`e2e-member-${run}@example.com`);
  users.push(planner, member);

  await test.step('rule page → offer → new trip, attributed to the visitor', async () => {
    await page.goto('/rules/fixture-us-refund-cancelled-flight');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Cancelled flight\?/);
    await page.getByRole('region', { name: /Forward your group’s bookings/ }).getByRole('link', { name: 'Start a trip' }).click();
    await page.waitForURL((url) => url.pathname === '/start' && url.searchParams.get('rule') === 'fixture-us-refund-cancelled-flight');
    await page.getByRole('link', { name: 'Start a trip' }).click();
    await page.waitForURL((url) => url.pathname === '/login' && url.searchParams.get('next') === '/trips/new');
    await signIn(page, planner.email, '/trips/new');

    await page.getByLabel('Trip name').fill(tripName);
    await page.getByLabel('Destination country (two-letter code)').fill('PT');
    await page.getByLabel('Leaving', { exact: true }).fill(plan.tripStart);
    await page.getByLabel('Back', { exact: true }).fill(plan.tripEnd);
    await page.getByLabel('Your name, as the group knows you').fill('Pat Planner');
    await page.getByRole('button', { name: 'Create the trip' }).click();
    await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
    tripId = new URL(page.url()).pathname.split('/').pop()!;
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tripName);

    const anonymousId = (await page.context().cookies()).find((c) => c.name === 'elsewhere_aid')?.value;
    expect(anonymousId).toBeTruthy();
    const trip = await pollRow(() => db().from('trips').select('created_anonymous_id').eq('id', tripId!).maybeSingle(), () => true);
    expect(trip.created_anonymous_id).toBe(anonymousId);
    const events = await pollRow(
      () => db().from('funnel_telemetry_events').select('event_name').eq('anonymous_id', anonymousId!),
      (rows) => ['rule_page_view', 'offer_click'].every((name) => rows.some((r) => r.event_name === name)),
    );
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  await test.step('a forwarded confirmation becomes a booking the planner confirms', async () => {
    const { data: trip } = await db().from('trips').select('inbound_code').eq('id', tripId!).single();
    const address = `${trip!.inbound_code}@${E2E.inboundDomain}`;
    const emailId = `e2e-${run}`;
    writeInboundEmail(emailId, `Pat Planner <${planner.email}>`, plan);
    const payload = JSON.stringify({
      type: 'email.received',
      created_at: new Date().toISOString(),
      data: {
        email_id: emailId,
        created_at: new Date().toISOString(),
        from: `Pat Planner <${planner.email}>`,
        to: [address],
        bcc: [],
        cc: [],
        received_for: [address],
        message_id: `<${emailId}@example.com>`,
        subject: 'Fwd: Your TAP Air Portugal booking E2ETAP',
        attachments: [],
      },
    });
    const response = await request.post('/api/webhooks/inbound-email', { data: payload, headers: { 'content-type': 'application/json', ...signStandardWebhook(payload, TEST_WEBHOOK_SECRET) } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toHaveProperty('accepted');

    // The planner matched "PLANNER/PAT MR"; "MEMBER/MO MS" has not joined yet, so the booking waits for the planner.
    await pollRow(() => db().from('bookings').select('id, confirmed_at').eq('trip_id', tripId!), (rows) => rows.length === 1);
    await page.goto(`/trips/${tripId}/bookings`);
    await expect(page.getByText('TAP Air Portugal')).toBeVisible();
    await expect(page.getByText(/TP 204 · EWR → LIS/)).toBeVisible();
    await page.getByRole('button', { name: /Confirm/ }).click();
    await pollRow(
      () => db().from('booking_segments').select('scheduled_out, origin_country, destination_country').eq('trip_id', tripId!).single(),
      (s) => s.scheduled_out !== null,
    ).then((segment) => {
      expect(new Date(segment.scheduled_out as string).toISOString()).toBe(new Date(plan.scheduledOut).toISOString());
      expect([segment.origin_country, segment.destination_country]).toEqual(['US', 'PT']);
    });
  });

  let joinUrl = '';
  await test.step('the planner shares a join link with a preview image', async () => {
    await page.goto(`/trips/${tripId}`);
    await page.getByRole('button', { name: 'Create invite link' }).click();
    const link = page.getByText(/\/join\/[A-Za-z0-9_-]{22}$/);
    await expect(link).toBeVisible();
    joinUrl = (await link.textContent())!.trim();

    const preview = await browser.newPage();
    await preview.goto(joinUrl);
    await expect(preview.getByRole('heading', { level: 1 })).toHaveText(tripName);
    const ogImage = await preview.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage).toContain('/opengraph-image');
    const image = await request.get(ogImage!);
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toBe('image/png');
    await preview.close();
  });

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await test.step('a member joins from the link and claims their seat', async () => {
    const joinPath = new URL(joinUrl).pathname;
    await signIn(memberPage, member.email, joinPath);
    await memberPage.getByLabel('Your name, as the group knows you').fill('Mo Member');
    await memberPage.getByRole('button', { name: 'Join the trip' }).click();
    await memberPage.waitForURL(`**/trips/${tripId}`);

    await memberPage.goto(`/trips/${tripId}/bookings`);
    await memberPage.getByRole('button', { name: 'Mo Member', exact: true }).click();
    await pollRow(() => db().from('booking_members').select('member_id').eq('trip_id', tripId!), (rows) => rows.length === 2);
  });

  await test.step('a paid pass starts watching the flight', async () => {
    const event = {
      id: `evt_e2e_${run}`,
      object: 'event',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: `cs_e2e_${run}`, object: 'checkout.session', client_reference_id: tripId, payment_status: 'paid', amount_total: 900 } },
    };
    const payload = JSON.stringify(event);
    const response = await request.post('/api/webhooks/stripe', { data: payload, headers: { 'content-type': 'application/json', 'stripe-signature': stripeSignature(payload) } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ kind: 'activated', tripId, status: 'paid' });

    // The fixture AeroAPI names its alert after the flight.
    await pollRow(
      () => db().from('booking_segments').select('aeroapi_alert_id, monitor_state').eq('trip_id', tripId!).single(),
      (s) => s.aeroapi_alert_id === 'fixture-TP204' && s.monitor_state === 'monitoring',
    );
  });

  let incidentId = '';
  await test.step('a cancellation asks the planner one question', async () => {
    const response = await request.post(`/api/webhooks/aeroapi/${E2E.aeroapiWebhookSecret}`, { data: cancelledAlert('fixture-TP204', plan) });
    expect(response.status()).toBe(200);
    incidentId = ((await response.json()) as { incidentId: string }).incidentId;
    expect(incidentId).toMatch(/^[0-9a-f-]{36}$/);

    const incident = await pollRow(
      () => db().from('incidents').select('status, pending_question, affected_user_ids').eq('id', incidentId).single(),
      (row) => row.status === 'needs_answer',
    );
    expect((incident.pending_question as { fact: string }).fact).toBe('passenger.accepted_alternative');
    expect([...(incident.affected_user_ids as string[])].sort()).toEqual([planner.id, member.id].sort());

    // The member sees that a question is out, but cannot answer it.
    await memberPage.goto(`/trips/${tripId}/incidents/${incidentId}`);
    await expect(memberPage.getByText('We asked the planner one question.')).toBeVisible();
    await expect(memberPage.getByRole('button', { name: 'No, not yet' })).toHaveCount(0);
  });

  await test.step('the answer produces a cited playbook, emailed to both travelers', async () => {
    await page.goto(`/trips/${tripId}/incidents/${incidentId}`);
    await page.getByRole('button', { name: 'No, not yet' }).click();
    await pollRow(() => db().from('incident_events').select('kind').eq('incident_id', incidentId), (rows) => rows.some((r) => r.kind === 'notified'));

    const { data: playbook } = await db().from('playbooks').select('model, citation_check_passed, rules_cited').eq('incident_id', incidentId).single();
    expect(playbook!.citation_check_passed).toBe(true);
    expect(playbook!.model).not.toBe('template');
    expect(playbook!.rules_cited).toEqual([{ rule_id: 'fixture-us-refund-cancelled-flight', rule_version: 1 }]);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'What you’re owed' })).toBeVisible();
    await expect(page.getByText('within 7 business days for card purchases')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Messages we drafted for you to send' })).toBeVisible();
    const citation = page.getByRole('link', { name: '[rule]' }).first();
    await expect(citation).toHaveAttribute('href', '/rules/fixture-us-refund-cancelled-flight');

    const incidentPath = `/trips/${tripId}/incidents/${incidentId}`;
    const mail = readOutbox();
    expect(mail.every((m) => m.channel === 'email')).toBe(true);
    const about = (to: string) => mail.filter((m) => m.to === to && m.body.includes(incidentPath));
    expect(about(planner.email).map((m) => m.subject)).toContain(`${tripName}: one quick question`);
    expect(about(planner.email).length).toBeGreaterThanOrEqual(2);
    expect(about(member.email)).toHaveLength(1);
    expect(about(member.email)[0].subject).toMatch(new RegExp(`^${tripName}: `));

    await citation.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Cancelled flight\?/);
  });

  await test.step('the group votes on schedule-only alternatives', async () => {
    await page.goto(`/trips/${tripId}/incidents/${incidentId}`);
    await expect(page.locator('textarea[name="options"]')).toHaveValue(/UA 64 · leaves .*availability not confirmed/);
    await page.getByRole('button', { name: 'Start the vote' }).click();
    await page.waitForURL(/\/votes\/[0-9a-f-]{36}$/);
    const votePath = new URL(page.url()).pathname;
    await expect(page.getByText('availability not confirmed — ask the airline').first()).toBeVisible();

    await memberPage.goto(votePath);
    await memberPage.getByRole('button', { name: /UA 64/ }).click();
    await expect(memberPage.getByText('1 of 2 have voted')).toBeVisible();
  });

  await memberContext.close();
});
```

- [ ] **Step 6: Run the e2e suite**

```bash
cd apps/web && npm run e2e; cd ../..
```
Expected:
- The server builds (2–4 minutes), then `1 passed`.
- `git status` shows no change to `packages/rules/dist/rules.json`. It is gitignored, and the trap rebuilt it.

Every feature this spec drives already has unit tests, so a failure here is an integration bug. Find it with superpowers:systematic-debugging, starting from the trace in `test-results/`. Fix the product code, not the spec. The spec may change only where it disagrees with this plan's own copy or contracts.

- [ ] **Step 7: Write the launch evals**

The eval data is real confirmations and real past disruptions, shared with consent and redacted. It never enters the repo. It lives in `~/elsewhere-evals/`:
- **`extraction/<case>/`:** one folder per confirmation. Collect at least 30 across airlines, booking sites, PDFs, and screenshots.
  - `input.json`: `{ "text": string | null, "html": string | null, "files": ["ticket.pdf"] }`
  - the files it names
  - `expected.json`: the bookings, hand-checked
- **`incidents/<case>.json`:** at least 50 past cancellations and delays, the spec's replay set. Each case:
  - holds `{ incident, segment, booking }` in the `AssessmentInput` shape
  - puts the planner's answers in `incident.facts`
  - lists `expected_rule_ids`: the verified rules that should apply, hand-checked

`apps/web/scripts/eval-extraction.mts`:
```ts
// Extraction accuracy on real, consented, redacted confirmations kept OUTSIDE the repo.
//   AI_GATEWAY_API_KEY=... npm run eval:extraction -- ~/elsewhere-evals/extraction
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { extractBookings, type ExtractionInput } from '@/lib/intake/extract';
import { CONFIDENCE_THRESHOLD, type NormalizedBooking } from '@/lib/intake/normalize';

const TARGET = 0.95;
const SEGMENT_FIELDS = ['carrierIata', 'flightNumber', 'originIata', 'destinationIata', 'departureLocal'] as const;

interface ExpectedBooking {
  kind: NormalizedBooking['kind'];
  confirmationCode: string | null;
  passengerNames: string[];
  segments: Pick<NormalizedBooking['segments'][number], (typeof SEGMENT_FIELDS)[number]>[];
}

const MEDIA: Record<string, string> = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

function loadInput(dir: string): ExtractionInput {
  const raw = JSON.parse(readFileSync(path.join(dir, 'input.json'), 'utf8')) as { text: string | null; html: string | null; files?: string[] };
  const input: ExtractionInput = { text: raw.text, html: raw.html, images: [], pdfs: [] };
  for (const file of raw.files ?? []) {
    const mediaType = MEDIA[path.extname(file).toLowerCase()];
    if (!mediaType) throw new Error(`${dir}: unsupported file ${file}`);
    const data = new Uint8Array(readFileSync(path.join(dir, file)));
    (mediaType === 'application/pdf' ? input.pdfs : input.images).push({ data, mediaType });
  }
  return input;
}

const names = (list: string[]) => list.map((n) => n.toUpperCase().replace(/\s+/g, ' ').trim()).sort().join(' | ');

/** Field by field; every miss is [field, expected, actual]. */
function compare(expected: ExpectedBooking, actual: NormalizedBooking | undefined): { total: number; misses: [string, string, string][] } {
  const misses: [string, string, string][] = [];
  const check = (field: string, want: string | null, got: string | null | undefined) => {
    if ((want ?? '') !== (got ?? '')) misses.push([field, want ?? '∅', got ?? '∅']);
  };
  check('kind', expected.kind, actual?.kind);
  check('confirmationCode', expected.confirmationCode, actual?.confirmationCode);
  check('passengerNames', names(expected.passengerNames), actual ? names(actual.passengerNames) : null);
  expected.segments.forEach((segment, i) => {
    for (const key of SEGMENT_FIELDS) check(`segments[${i}].${key}`, segment[key], actual?.segments[i]?.[key]);
  });
  return { total: 3 + expected.segments.length * SEGMENT_FIELDS.length, misses };
}

const root = path.resolve((process.argv[2] ?? '~/elsewhere-evals/extraction').replace(/^~/, homedir()));
const cases = readdirSync(root).filter((name) => statSync(path.join(root, name)).isDirectory()).sort();
if (cases.length === 0) throw new Error(`No cases in ${root}`);

let total = 0;
let correct = 0;
let silent = 0;
for (const name of cases) {
  const dir = path.join(root, name);
  const expected = JSON.parse(readFileSync(path.join(dir, 'expected.json'), 'utf8')) as ExpectedBooking[];
  const actual = await extractBookings(loadInput(dir));
  for (const [index, want] of expected.entries()) {
    const got = actual.find((b) => want.confirmationCode !== null && b.confirmationCode === want.confirmationCode) ?? actual[index];
    const { total: fields, misses } = compare(want, got);
    total += fields;
    correct += fields - misses.length;
    for (const [field, w, g] of misses) {
      // A miss the planner is asked to confirm is caught; a confident miss is silent.
      const caught = !got || got.confidence < CONFIDENCE_THRESHOLD || got.problems.length > 0;
      if (!caught) silent += 1;
      console.log(`${caught ? 'caught' : 'SILENT'}  ${name} #${index} ${field}: expected ${w}, got ${g}`);
    }
  }
  if (actual.length > expected.length) console.log(`extra   ${name}: ${actual.length - expected.length} booking(s) not in expected.json`);
}

const accuracy = correct / total;
console.log(`\n${cases.length} cases · ${correct}/${total} fields · accuracy ${(accuracy * 100).toFixed(1)}% (target ${TARGET * 100}%)`);
console.log(`${silent} silent miss(es): wrong yet confident, so they skip planner confirmation`);
process.exitCode = accuracy >= TARGET ? 0 : 1;
```

`apps/web/scripts/eval-replay.mts`:
```ts
// Replays real past disruptions through the live playbook model. Data stays OUTSIDE the repo.
//   npm run rules:build -w @elsewhere/rules
//   AI_GATEWAY_API_KEY=... npm run eval:replay -- ~/elsewhere-evals/incidents
// Every playbook is written to <dir>/out/ for the founder to read before launch.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { assess, type AssessmentInput } from '@/lib/assist/assess';
import { checkCitations } from '@/lib/assist/citation-check';
import { generatePlaybook } from '@/lib/assist/playbook';
import { ASK_ORDER } from '@/lib/assist/questions';
import { getLibrary } from '@/lib/rules/library';

type ReplayCase = Omit<AssessmentInput, 'asked' | 'rules'> & { expected_rule_ids: string[] };

const root = path.resolve((process.argv[2] ?? '~/elsewhere-evals/incidents').replace(/^~/, homedir()));
const files = readdirSync(root).filter((file) => file.endsWith('.json')).sort();
if (files.length === 0) throw new Error(`No cases in ${root}`);
const outDir = path.join(root, 'out');
mkdirSync(outDir, { recursive: true });

const rules = getLibrary().rules;
let drafted = 0;
let fellBack = 0;
let noRule = 0;
let wrongRules = 0;
for (const file of files) {
  const { expected_rule_ids: expectedRuleIds, ...replay } = JSON.parse(readFileSync(path.join(root, file), 'utf8')) as ReplayCase;
  // Every question counts as asked: the case already carries the planner's answers.
  const assessment = assess({ ...replay, asked: [...ASK_ORDER], rules });
  const matched = assessment.applying.map((r) => r.id).sort();
  const expected = [...expectedRuleIds].sort();
  if (matched.join(',') !== expected.join(',')) {
    wrongRules += 1;
    console.log(`RULES    ${file}: expected ${expected.join(', ') || 'none'}, matched ${matched.join(', ') || 'none'}`);
  }
  if (assessment.applying.length === 0) {
    noRule += 1;
    console.log(`no rule  ${file}: no verified rule applies, so it gets the template`);
    continue;
  }
  const result = await generatePlaybook(assessment);
  const recheck = result.model === 'template' ? [] : checkCitations(result.playbook, assessment.applying, assessment.extraNumbers);
  writeFileSync(path.join(outDir, file), JSON.stringify({ eventSummary: assessment.eventSummary, applying: assessment.applying.map((r) => r.id), ...result }, null, 2));
  if (result.model === 'template' || recheck.length > 0) {
    fellBack += 1;
    console.log(`FALLBACK ${file}: ${recheck.map((i) => `${i.path} ${i.problem}`).join('; ') || 'failed the citation check twice'}`);
  } else {
    drafted += 1;
    console.log(`passed   ${file}: cites ${result.rulesCited.map((r) => r.rule_id).join(', ')}`);
  }
}

console.log(`\n${files.length} cases · ${drafted} drafted and cited · ${fellBack} fell back to the template · ${noRule} with no verified rule · ${wrongRules} rule mismatches`);
console.log(`Read every playbook in ${outDir} before launch.`);
process.exitCode = fellBack === 0 && wrongRules === 0 && drafted > 0 ? 0 : 1;
```

- [ ] **Step 8: [Founder confirms] Run the evals**

These calls spend AI Gateway credit and read the private eval set. Ask first.
```bash
npm run rules:build -w @elsewhere/rules
cd apps/web
AI_GATEWAY_API_KEY=<key> npm run eval:extraction -- ~/elsewhere-evals/extraction
AI_GATEWAY_API_KEY=<key> npm run eval:replay -- ~/elsewhere-evals/incidents
cd ../..
```
Expected:
- **Extraction:** `accuracy` at or above 95.0%, and the command exits 0.
- **Replay:** `0 fell back to the template` and `0 rule mismatches`, and the command exits 0.
- The founder has read every playbook in `~/elsewhere-evals/incidents/out/`.

Below target, the fix is the prompt or the rule text, never the threshold. Change the instructions in `extract.ts` or `playbook.ts`, or report a rule-text gap to Track A. Then re-run.

- [ ] **Step 9: Run the unit tests and typecheck, then commit**

```bash
cd apps/web && npx vitest run && npm run typecheck; cd ../..
git status --short apps/web .gitignore
```
Expected:
- All tests pass and typecheck is clean.
- `git status` lists no `.env.e2e.local`, nothing under `e2e/.run/`, and no `test-results/`.

```bash
git add apps/web .gitignore
git commit -F - <<'EOF'
Prove the group-trip loop end to end, and add launch evals

One Playwright run drives the whole product against an e2e database
branch:
- a rule page to a new trip, attributed to the visitor
- a forwarded booking the planner confirms
- a member who joins by link
- a paid pass that starts monitoring
- a cancellation, the planner's one question, and a cited playbook
  emailed to both travelers
- a group vote on schedule-only alternatives

Every outside service is a guarded seam, and the dated fixtures are
written at run time so the suite never goes stale.

The extraction and playbook evals run the live models on consented
data kept outside the repo. Launch needs 95% field accuracy, no
playbook that falls back to the template, and every replay matching
its expected rules.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 18: Provider setup and launch

This task provisions every outside service C2 needs, puts C2 in production, and proves it works there. Each outward-facing step is marked **[Founder confirms]**: account creation, paid plans, DNS, production environment variables, deploys, and registrations. For those steps, present what will happen, then wait for an explicit yes. Unmarked steps are local: code, tests, or read-only checks.

Two orderings matter:
- **AeroAPI** rejects `POST /alerts` with a 400 until the account-wide alert endpoint is set. Step 8 sets it before any trip can be monitored.
- **Supabase's built-in mailer** delivers only to the project team's own addresses, at 2 messages an hour. Invited members get no sign-in code until Step 7 routes Auth email through Resend.

Secrets never go in the repo, the launch log, or the chat. The founder reads each one into their own shell with `read -rs NAME && export NAME`, or pastes it straight into a dashboard. Values that are not secret are recorded in the launch log at the end of this task: `APP_DOMAIN` from C1 Task 12, `TEAM_SLUG`, and `SUPPORT_EMAIL`.

**Files:**
- Create: `apps/web/scripts/resend-setup.mts`, `apps/web/scripts/smoke-production.mts`, `apps/web/lib/notify/sms-consent.ts`, `apps/web/app/privacy/page.tsx`, `apps/web/app/sms-terms/page.tsx`, `apps/web/test/notify/sms-consent.test.ts`
- Modify: `apps/web/app/join/[token]/join-form.tsx` (consent wording and links), `apps/web/app/join/[token]/actions.ts` (shared policy version), `apps/web/e2e/env.ts` (`SUPPORT_EMAIL`), `.env.example`, and this plan's launch log (Step 20)

**Interfaces:**
- Consumes:
  - **From C1 Task 12:** `APP_DOMAIN`, the Vercel project `elsewhere-web`, Supabase project `xiinobmygdfwkpjtqauo` with `00012` applied, and C1's production variables, including `INBOUND_DOMAIN=in.<APP_DOMAIN>` and `TRIPS_OPEN=false`
  - **From this plan:** Task 17's `scripts/setup-storage.mts`, and every route Tasks 1–16 add
- Produces:
  - **Resend:** sending domain `<APP_DOMAIN>`, receiving domain `in.<APP_DOMAIN>`, and an `email.received` webhook to `/api/webhooks/inbound-email`
  - **Supabase Auth:** email through Resend SMTP. Phone sign-in through Twilio comes in Step 19.
  - **AeroAPI:** a key on a tier that includes alerts, with the account alert endpoint set to `/api/webhooks/aeroapi/<AEROAPI_WEBHOOK_SECRET>`
  - **AI Gateway:** billing and a budget for `elsewhere-web`, reached by OIDC on Vercel
  - **Twilio:** a Messaging Service with an A2P 10DLC brand and campaign. SMS stays off until the campaign clears.
  - **Scripts:**
    - `resend-setup.mts [--verify]`
    - `smoke-production.mts [--email <to>] [--sms <E.164>]`
  - **Pages:** `/privacy` and `/sms-terms`, which the A2P campaign links to
  - **Consent constants** (`lib/notify/sms-consent.ts`): `SMS_CONSENT_TEXT` and `SMS_POLICY_VERSION`, shared by the join form, the join action, and `/sms-terms`
  - **Launch log:** the table at the end of this task, filled in as each step completes

- [ ] **Step 1: Check the starting point**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
git status --short && git log --oneline -1
cd apps/web && npx vitest run && npm run test:integration && npm run typecheck && npm run build; cd ../..
vercel whoami && vercel project ls | grep elsewhere-web
```
Then export the production domain recorded in C1 Task 12. `mcp__claude_ai_Vercel__list_project_domains` on `elsewhere-web` lists it.
```bash
export APP_DOMAIN=<the production domain from C1 Task 12>
curl -s -o /dev/null -w "%{http_code}\n" "https://$APP_DOMAIN/"
```
Expected:
- The working tree is clean.
- Unit and integration tests pass, typecheck is clean, and the build succeeds.
- `elsewhere-web` is listed, and the domain returns `200`, so C1 is live.
- Task 17 Step 8's evals have passed, and the founder has read the replayed playbooks.

- [ ] **Step 2: [Founder confirms] Put the Vercel team on Pro, and record the team slug**

The notifications cron runs every 15 minutes (Task 2). On Hobby, a deploy with any cron that runs more than once a day fails with "Hobby accounts are limited to daily cron jobs."
1. **Check the plan.** Use `mcp__claude_ai_Vercel__list_teams`, then `mcp__claude_ai_Vercel__get_team` for the team that owns `elsewhere-web`. The response shows the plan and the slug.
2. **Upgrade if needed.** If the team is on Hobby, upgrade it under Settings → Billing, after an explicit yes. Pro is a paid plan.
3. **Record the slug.** Write it in the launch log as `TEAM_SLUG`, and `export TEAM_SLUG=<slug>`. The Workflow CLI needs it in Steps 15 and 18.

- [ ] **Step 3: Generate the app's own secrets**

The founder runs this in their own terminal, not through the agent. The output must not enter the chat.
```bash
for name in JOIN_LINK_SECRET CRON_SECRET AEROAPI_WEBHOOK_SECRET; do
  printf '%s=%s\n' "$name" "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
done
```
Store all three in the password manager. In the launch log, record only that they exist.

- [ ] **Step 4: [Founder confirms] Check the production database, create the inbound bucket, and set the passport affiliate route**

**The read-only checks run first.** Use the Supabase MCP tools on project `xiinobmygdfwkpjtqauo`.

1. **Migrations.** Run `mcp__claude_ai_Supabase__list_migrations`. The last entry must be `00012_group_trip_assist`. If it is missing, stop: C1 Task 12 Step 3 has not run.
2. **Schema.** Run `mcp__claude_ai_Supabase__execute_sql` with this query, which lists every column C2 relies on that is missing:
```sql
with needed(table_name, column_name) as (values
  ('trips', 'join_token_hash'), ('trips', 'join_token_expires_at'), ('trips', 'inbound_code'), ('trips', 'pass_status'),
  ('trips', 'start_date'), ('trips', 'destination_country'),
  ('profiles', 'phone'), ('profiles', 'sms_opt_in'), ('profiles', 'venmo_username'), ('profiles', 'cashtag'), ('profiles', 'timezone'),
  ('member_documents', 'keep_on_profile'), ('travel_admin_partner_routes', 'affiliate_disclosure'),
  ('inbound_messages', 'provider_message_id'), ('inbound_messages', 'storage_path'),
  ('booking_segments', 'aeroapi_alert_id'), ('booking_segments', 'monitor_state'), ('booking_segments', 'last_status'),
  ('incidents', 'pending_question'), ('incidents', 'dedupe_key'), ('incident_events', 'kind'),
  ('playbooks', 'citation_check_passed'), ('action_items', 'source_kind'),
  ('vote_responses', 'vote_id'), ('settlements', 'amount_cents'),
  ('notifications', 'send_after'), ('notifications', 'related_entity_id'), ('consents', 'revoked_at'),
  ('webhook_events', 'event_id'))
select n.table_name, n.column_name
from needed n
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = n.table_name and c.column_name = n.column_name
where c.column_name is null;
```
   Expected: zero rows.
3. **Travel-admin routes.**
```sql
select kind, official_url, affiliate_url is not null as has_affiliate from public.travel_admin_partner_routes order by kind;
```
   Expected: four rows (`global_entry`, `passport`, `real_id`, `tsa_precheck`), each with an official URL.
4. **Security advisors.** Run `mcp__claude_ai_Supabase__get_advisors` with type `security`. Expect only the exceptions C1 Task 12 lists as intended.

**Then the writes.** These touch production, so get the yes first.

5. **Create the inbound bucket.** The founder runs this in their own terminal, taking the URL from `mcp__claude_ai_Supabase__get_project_url` and the service-role key from Dashboard → Settings → API Keys:
```bash
cd apps/web
read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL=<project url> node --import tsx scripts/setup-storage.mts
cd ../..
```
   Expected: `created the private inbound bucket`, or `inbound bucket already exists and is private`. Confirm it:
```sql
select id, public from storage.buckets where id = 'inbound';
```
   Expected: one row, with `public` false.
6. **Set the expedited-passport affiliate, if one has approved.** Task 7 always shows the free State Department route. It offers the affiliate only when there is no longer time for routine renewal, and only if this row has one. The GovSwift partnership is deferred, so there is no partner API or status callback.
   - **If an expedited-passport affiliate program has approved Elsewhere,** set its link with `execute_sql`, using the program's own tracking URL and name:
```sql
update public.travel_admin_partner_routes
set affiliate_label = 'Get it expedited with ' || '<program name>',
    affiliate_url = '<program tracking URL>',
    affiliate_disclosure = 'Elsewhere earns a commission if you use this service. The State Department route above is free.',
    updated_at = now()
where kind = 'passport';
```
   - **If none has approved,** leave the row as it is. Record "none yet" in the launch log.

- [ ] **Step 5: Write the Resend setup script**

`apps/web/scripts/resend-setup.mts`:
```ts
// Sets up Resend for Elsewhere: the sending domain, the receiving domain, and the inbound webhook. Idempotent.
// The founder runs it in their own terminal, with RESEND_API_KEY exported (never typed inline). From apps/web:
//   APP_DOMAIN=<domain> node --import tsx scripts/resend-setup.mts            # create what is missing, print the DNS records
//   APP_DOMAIN=<domain> node --import tsx scripts/resend-setup.mts --verify   # ask Resend to re-check DNS, print the status
import { Resend } from 'resend';

const key = process.env.RESEND_API_KEY;
const appDomain = process.env.APP_DOMAIN?.trim().toLowerCase();
if (!key || !appDomain) throw new Error('Set RESEND_API_KEY and APP_DOMAIN.');
const resend = new Resend(key);
const verify = process.argv.includes('--verify');

function ok<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error || result.data === null) throw new Error(`${what}: ${result.error?.message ?? 'empty response'}`);
  return result.data;
}

// Mail goes out from <APP_DOMAIN>. Forwarded bookings arrive at <code>@in.<APP_DOMAIN>, which is INBOUND_DOMAIN.
const wanted = [
  { name: appDomain, capabilities: { sending: 'enabled', receiving: 'disabled' } },
  { name: `in.${appDomain}`, capabilities: { sending: 'disabled', receiving: 'enabled' } },
] as const;

const existing = ok(await resend.domains.list(), 'list domains').data;
for (const want of wanted) {
  const id =
    existing.find((d) => d.name === want.name)?.id ??
    ok(await resend.domains.create({ name: want.name, capabilities: want.capabilities }), `create ${want.name}`).id;
  if (verify) ok(await resend.domains.verify(id), `verify ${want.name}`);
  const domain = ok(await resend.domains.get(id), `get ${want.name}`);
  console.log(`\n${domain.name}: ${domain.status} (sending ${domain.capabilities.sending}, receiving ${domain.capabilities.receiving})`);
  for (const r of domain.records) {
    const priority = 'priority' in r && r.priority !== undefined ? ` priority=${r.priority}` : '';
    console.log(`  ${r.record}: ${r.type} ${r.name}${priority} -> ${r.value} [${r.status}]`);
  }
}

const endpoint = `https://${appDomain}/api/webhooks/inbound-email`;
const hooks = ok(await resend.webhooks.list(), 'list webhooks').data;
const hook = hooks.find((h) => h.endpoint === endpoint);
if (hook) {
  console.log(`\nThe webhook for ${endpoint} exists (${hook.status}). Its signing secret is on the Resend dashboard, under Webhooks.`);
} else {
  const created = ok(await resend.webhooks.create({ endpoint, events: ['email.received'] }), 'create webhook');
  // Shown once. It is RESEND_WEBHOOK_SECRET: straight into the password manager.
  console.log(`\nRESEND_WEBHOOK_SECRET=${created.signing_secret}`);
}
```

Check that it compiles:
```bash
cd apps/web && npx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck scripts/resend-setup.mts; cd ../..
```
Expected: no output.

- [ ] **Step 6: [Founder confirms] Resend: the account, the keys, the domains, DNS, and the webhook**

1. **Create the account.** The founder creates the Resend account and picks a plan that includes receiving. If its monthly sending allowance is below expected volume, choose a paid plan. Expected volume is about 15 emails per trip member per trip.
2. **Create two API keys** under API Keys, and store both in the password manager:
   - `elsewhere-web`, with **Full access**. The app reads received mail and attachments with it, and the setup script uses it. It becomes `RESEND_API_KEY`.
   - `supabase-smtp`, with **Sending access** restricted to `<APP_DOMAIN>`. Supabase uses it in Step 7.
3. **Run the script** in the founder's terminal:
```bash
cd apps/web
read -rs RESEND_API_KEY && export RESEND_API_KEY
node --import tsx scripts/resend-setup.mts
cd ../..
```
   Expected:
   - Two domains, with the capabilities shown in the script.
   - The DNS records for each domain. The receiving domain's record list includes an MX record.
   - `RESEND_WEBHOOK_SECRET=…`, printed once.
4. **Add the DNS records to Vercel DNS.** C1 bought the domain on Vercel, so the zone is `<APP_DOMAIN>`.
   - Find each record's full hostname under Domains → (domain) → DNS Records in the Resend dashboard.
   - The host to give Vercel is that full hostname minus `.<APP_DOMAIN>`.
   - Add each record:
```bash
vercel dns add "$APP_DOMAIN" <host> <TYPE> "<value>"            # TXT and CNAME
vercel dns add "$APP_DOMAIN" <host> MX "<value>" <priority>     # MX
vercel dns ls "$APP_DOMAIN"
```
5. **Wait for DNS.** Check that the records resolve:
```bash
dig +short MX "in.$APP_DOMAIN"
dig +short TXT "resend._domainkey.$APP_DOMAIN"
```
   Expected:
   - The first command shows the receiving host Resend listed.
   - The second shows the DKIM key. If Resend named the DKIM record differently, query that name instead.
6. **Verify the domains.** Run the script with `--verify` until both domains report `verified`:
```bash
cd apps/web && node --import tsx scripts/resend-setup.mts --verify; cd ../..
```
   Then record in the launch log: both domains verified, and the webhook's id from the Resend dashboard.

`EMAIL_FROM` is `Elsewhere <trips@<APP_DOMAIN>>`.

- [ ] **Step 7: [Founder confirms] Supabase Auth: send codes through Resend**

These settings are in the Supabase dashboard for project `xiinobmygdfwkpjtqauo`. They are founder actions.
1. **SMTP settings.** Under Authentication → Emails → SMTP Settings, enable custom SMTP:
   - Host `smtp.resend.com`, port `465`
   - Username `resend`, and as the password, the `supabase-smtp` key from Step 6
   - Sender email `trips@<APP_DOMAIN>`, and sender name `Elsewhere`
2. **Rate limits.** Under Authentication → Rate Limits, raise "Rate limit for sending emails" to 100 per hour. A six-person group joining in one evening must not hit it.
3. **Keep C1's code template.** C1 Task 12 replaced the Magic Link email template with a code template. Leave that template as it is.
4. **Check delivery.** Sign in at `https://<APP_DOMAIN>/login` with an address that is **not** on the Supabase team. A volunteer's address works, or a fresh alias.
   - **Expected:** the code arrives within a minute, from `trips@<APP_DOMAIN>`.
   - **In Resend:** Emails shows it as delivered.

- [ ] **Step 8: [Founder confirms] FlightAware AeroAPI: the tier, the key, the quota, and the alert endpoint**

1. **Create the account.** The founder creates the AeroAPI account on a tier that allows commercial use and includes flight alerts, and enters billing. It is a paid service. Confirm both requirements on FlightAware's AeroAPI pricing page.
2. **Estimate the monthly volume** against the tier's price and limits, and record it in the launch log. Use these figures for an 8-hour flight:
   - **A segment with an alert:** about 17 `GET /flights/{ident}` polls. Polling runs every 6 hours from T-24h, hourly from T-6h, and stops on arrival.
   - **A polling-only segment:** about 38 polls (every 2 hours, then every 30 minutes).
   - **Alert callbacks:** AeroAPI bills each one as a query, and a departure or arrival can bundle several.
   - **Other lookups:** a few per segment when it is confirmed (Task 4), and a schedule search per vote (Task 13).
   - **Monthly total:** calls per segment × segments per trip × trips per month. For example, 20 hand-run trips with 3 segments each, at about 25 calls per segment, is about 1,500 calls.
3. **Create the API key.** It is `AEROAPI_KEY`; put it in the password manager.
4. **Set the account-wide alert endpoint.** AeroAPI refuses to create alerts until it is set. In the founder's terminal:
```bash
read -rs AEROAPI_KEY && export AEROAPI_KEY
read -rs AEROAPI_WEBHOOK_SECRET && export AEROAPI_WEBHOOK_SECRET
AERO=https://aeroapi.flightaware.com/aeroapi
curl -s -o /dev/null -w "%{http_code}\n" -X PUT "$AERO/alerts/endpoint" \
  -H "x-apikey: $AEROAPI_KEY" -H 'content-type: application/json; charset=UTF-8' \
  -d "{\"url\":\"https://$APP_DOMAIN/api/webhooks/aeroapi/$AEROAPI_WEBHOOK_SECRET\"}"
curl -s "$AERO/alerts/endpoint" -H "x-apikey: $AEROAPI_KEY" | jq -r '.url' | sed "s/$AEROAPI_WEBHOOK_SECRET/<secret>/"
curl -s "$AERO/alerts" -H "x-apikey: $AEROAPI_KEY" | jq '.alerts | length'
```
   Expected:
   - The `PUT` returns `204`.
   - The endpoint prints as `https://<APP_DOMAIN>/api/webhooks/aeroapi/<secret>`.
   - The alert count is `0`.

**If the path secret ever leaks,** rotate it:
1. Generate a new secret, as in Step 3.
2. Replace `AEROAPI_WEBHOOK_SECRET` in Vercel, as in Step 14, and redeploy.
3. Point the account endpoint at the new path with the `PUT` above.
4. Move every existing alert to the new URL:
```bash
NEW_URL="https://$APP_DOMAIN/api/webhooks/aeroapi/$AEROAPI_WEBHOOK_SECRET"
curl -s "$AERO/alerts" -H "x-apikey: $AEROAPI_KEY" | jq -c '.alerts[]' | while read -r alert; do
  id=$(jq -r '.id' <<<"$alert")
  body=$(jq -c --arg url "$NEW_URL" '{ident, origin, destination, start, end, events, target_url: $url}' <<<"$alert")
  curl -s -o /dev/null -w "$id %{http_code}\n" -X PUT "$AERO/alerts/$id" -H "x-apikey: $AEROAPI_KEY" -H 'content-type: application/json; charset=UTF-8' -d "$body"
done
```
   Each line should end in `204`. The webhook answers 404 on the old path from the moment the new secret deploys.

- [ ] **Step 9: [Founder confirms] AI Gateway: billing, a budget, and the models**

1. **Billing.** AI Gateway bills the Vercel team. Add credits or enable paid usage under AI Gateway in the dashboard.
2. **Budget.** Set a monthly budget for the project. Check the flags first, then set the limit the founder picks; 50 is enough for launch volume.
```bash
vercel ai-gateway budgets set --help
vercel ai-gateway budgets set project elsewhere-web --limit 50 --refresh-period monthly
vercel ai-gateway budgets inspect project elsewhere-web
```
   Record the limit in the launch log.
3. **Model IDs.** Both IDs must still exist:
```bash
curl -fsSL https://ai-gateway.vercel.sh/v1/models | jq -r '.data[].id' | grep -x -e 'anthropic/claude-haiku-4.5' -e 'anthropic/claude-sonnet-5.5'
```
   Expected: both IDs print. If one is gone, update `MODEL_IDS` in `lib/ai/models.ts` to the live successor, rerun the Task 17 evals, and record the change.
4. **No training.** Every call sends `providerOptions.gateway.disallowPromptTraining: true` (Task 3's `NO_TRAINING`), so AI Gateway routes only to providers that do not train on prompts. Team-wide Zero Data Retention under AI Gateway → Settings is stricter and costs extra; it is the founder's choice. Record that choice in the launch log.
5. **OIDC authentication.** Production authenticates by OIDC. Never add `AI_GATEWAY_API_KEY` to any Vercel environment. For local eval runs (Task 17 Step 8), create a key with its own budget and an expiry, and keep it in the password manager:
```bash
vercel ai-gateway api-keys create --help
vercel ai-gateway api-keys create --budget 20 --expiration 90d
```

- [ ] **Step 10: [Founder confirms] Twilio: the account, the number, the Messaging Service, and the A2P brand**

Do this as early as possible. Brand and campaign vetting is the slowest part of launch. Nothing else waits on it, because notifications run email-only until it clears. `SMS_ENABLED` stays `false` until Step 19.
1. **Account.** The founder creates a Twilio account and upgrades it from trial. This is a paid account.
2. **Number.** Buy one US local (10DLC) number with SMS.
3. **Messaging Service.** Create a service named "Elsewhere trip alerts", then configure it:
   - **Sender Pool:** add the number.
   - **Integration:** choose "Send a webhook" for incoming messages, with Request URL `https://<APP_DOMAIN>/api/webhooks/twilio` and method `POST`. The route checks Twilio's signature against exactly this URL, built from `NEXT_PUBLIC_APP_URL`. Use the same scheme and host, with no `www` and no trailing slash.
   - **Opt-Out Management (Advanced Opt-Out):** turn it on. Keep Twilio's default STOP and START replies. Set the HELP reply to `Elsewhere trip alerts: flight updates for your group trips. Help: <SUPPORT_EMAIL>. Msg frequency varies. Msg&data rates may apply. Reply STOP to opt out.`
   - Record the service's SID (`MG…`). It is `TWILIO_MESSAGING_SERVICE_SID`. The Account SID and Auth Token from the console are `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
4. **Brand registration.** Under Messaging → Regulatory Compliance, register the A2P 10DLC brand. The founder supplies the legal business name, EIN, address, and contact, with website `https://<APP_DOMAIN>`.
   - **With an EIN,** register a Standard brand.
   - **Without one,** register a Sole Proprietor brand. It allows one number and lower throughput, which is enough for hand-run trips.
   - Record the submission date in the launch log.
   - The campaign is submitted in Step 17, once `/privacy` and `/sms-terms` are live.

If the brand is rejected, or the founder prefers it, toll-free verification is the spec's alternative. Buy a toll-free number, put it in the Sender Pool instead, and submit toll-free verification with the same descriptions and URLs as Step 17.

- [ ] **Step 11: Write the consent wording and the privacy and SMS terms pages**

Carriers review the opt-in wording, the privacy policy, and the SMS terms before they approve the campaign. The wording lives in one module, so the join form and `/sms-terms` can never drift apart.

Write the failing test first. `apps/web/test/notify/sms-consent.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SMS_CONSENT_TEXT, SMS_POLICY_VERSION } from '@/lib/notify/sms-consent';

describe('SMS consent wording', () => {
  it('carries everything carriers check for in an opt-in', () => {
    for (const phrase of ['Elsewhere', 'message frequency varies', 'Message and data rates may apply', 'HELP', 'STOP']) {
      expect(SMS_CONSENT_TEXT).toContain(phrase);
    }
    expect(SMS_POLICY_VERSION).toBe('sms-2026-10');
  });
});
```
```bash
cd apps/web && npx vitest run test/notify/sms-consent.test.ts; cd ../..
```
Expected: FAIL, with the module not found.

`apps/web/lib/notify/sms-consent.ts`:
```ts
/** The SMS opt-in. The join form shows it, /sms-terms reproduces it, and A2P campaign review checks both. */
export const SMS_CONSENT_TEXT =
  'Text me if something affects my flights. Elsewhere sends trip alerts, group votes, and sign-in codes; message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out.';

/** Recorded in `consents.policy_version` when a member opts in. Change it whenever the wording or /sms-terms changes. */
export const SMS_POLICY_VERSION = 'sms-2026-10';
```

In `apps/web/app/join/[token]/actions.ts`:
1. Delete the line `const SMS_POLICY_VERSION = 'sms-2026-10';`.
2. Add `import { SMS_POLICY_VERSION } from '@/lib/notify/sms-consent';`.

In `apps/web/app/join/[token]/join-form.tsx`:
1. Add `import { SMS_CONSENT_TEXT } from '@/lib/notify/sms-consent';`.
2. Replace
```tsx
          <span>Text me if something affects my flights. Message and data rates may apply. Reply STOP to opt out.</span>
```
   with
```tsx
          <span>
            {SMS_CONSENT_TEXT}{' '}
            <a href="/sms-terms" className="underline">SMS terms</a> · <a href="/privacy" className="underline">Privacy</a>
          </span>
```

`apps/web/app/privacy/page.tsx`:
```tsx
import type { Metadata } from 'next';
import { requireEnv } from '@/lib/env';

export const metadata: Metadata = { title: 'Privacy · Elsewhere' };

const h2 = 'mt-8 text-xl font-semibold';
const list = 'mt-2 list-disc space-y-1 pl-6';

export default function PrivacyPage() {
  const support = requireEnv('SUPPORT_EMAIL');
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 leading-relaxed">
      <h1 className="text-3xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-[#4b5745]">Last updated October 2026.</p>

      <h2 className={h2}>What we keep</h2>
      <ul className={list}>
        <li>Your name as your group knows you, your email address or mobile number, your time zone, and any Venmo or Cash App handle you add.</li>
        <li>The bookings your group forwards or uploads, and what we read from them: flights, hotels, confirmation codes, and traveler names.</li>
        <li>For document checks: your passport’s issuing country and expiry date, and whether your ID is REAL ID-compliant. Never a passport number, a date of birth, or a loyalty-program login.</li>
        <li>What your group adds: expenses, settlements, and votes.</li>
      </ul>

      <h2 className={h2}>How long we keep it</h2>
      <ul className={list}>
        <li>Forwarded emails and screenshots: deleted 30 days after they arrive.</li>
        <li>Passport and ID details: deleted 30 days after your last trip ends, unless you choose to keep them on your profile.</li>
        <li>Bookings: kept until a year after the trip, so you can still claim what you’re owed.</li>
      </ul>

      <h2 className={h2}>Who sees what</h2>
      <ul className={list}>
        <li>A confirmation code is visible only to the travelers on that booking and to the trip’s planner.</li>
        <li>The planner sees whether your documents check out, never your passport’s dates.</li>
        <li>When a flight is disrupted, the alert goes only to the travelers on it. The planner may also get one question about it.</li>
      </ul>

      <h2 className={h2}>AI</h2>
      <p className="mt-2">
        An AI model reads forwarded bookings and drafts the playbook when a flight is disrupted. Those requests go through Vercel AI Gateway, which routes them only to providers that do not train on them. Your passport and ID details are never sent to a model: document checks are plain rules.
      </p>

      <h2 className={h2}>Who processes data for us</h2>
      <p className="mt-2">
        Supabase (database and sign-in), Vercel (hosting, and AI Gateway, which passes AI requests to a provider of Anthropic’s Claude models), Resend (email), Twilio (text messages), FlightAware (flight status, from flight numbers and dates only), and Stripe (trip pass payments). We don’t sell personal information.
      </p>

      <h2 className={h2}>Text messages</h2>
      <p className="mt-2">
        We text you only if you opt in, and you can reply STOP at any time. We never share your mobile number or your opt-in with third parties or affiliates for marketing. See the{' '}
        <a href="/sms-terms" className="underline">SMS terms</a>.
      </p>

      <h2 className={h2}>Cookies</h2>
      <p className="mt-2">A first-party cookie with a random visitor ID, so we can count which pages lead to trips, and a sign-in cookie once you sign in.</p>

      <h2 className={h2}>Your choices</h2>
      <p className="mt-2">
        Email <a href={`mailto:${support}`} className="underline">{support}</a> to see, correct, or delete your data, or to close your account.
      </p>
    </main>
  );
}
```

`apps/web/app/sms-terms/page.tsx`:
```tsx
import type { Metadata } from 'next';
import { requireEnv } from '@/lib/env';
import { SMS_CONSENT_TEXT, SMS_POLICY_VERSION } from '@/lib/notify/sms-consent';

export const metadata: Metadata = { title: 'SMS terms · Elsewhere' };

const h2 = 'mt-8 text-xl font-semibold';

export default function SmsTermsPage() {
  const support = requireEnv('SUPPORT_EMAIL');
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 leading-relaxed">
      <h1 className="text-3xl font-bold tracking-tight">Elsewhere trip alerts: SMS terms</h1>
      <p className="mt-2 text-sm text-[#4b5745]">Version {SMS_POLICY_VERSION}.</p>

      <h2 className={h2}>What you get</h2>
      <p className="mt-2">
        Texts about the trips you join on Elsewhere: cancellations, delays, and schedule changes on your flights, with what you may be owed; group votes; travel-document reminders; a briefing three days before you leave; and sign-in codes. Message frequency varies with your trips. Message and data rates may apply.
      </p>

      <h2 className={h2}>How you opt in</h2>
      <p className="mt-2">When you join a trip, you can tick this box. It starts unticked, and you can join without it:</p>
      <label className="mt-3 flex items-start gap-3 rounded-lg border border-[#e4dfd0] bg-white p-4 text-sm">
        <input type="checkbox" disabled className="mt-1" />
        <span>{SMS_CONSENT_TEXT}</span>
      </label>
      <p className="mt-2">If you choose to sign in with a text-message code, we send that code by SMS, once per sign-in.</p>

      <h2 className={h2}>How to stop or get help</h2>
      <p className="mt-2">
        Reply STOP to any message to stop all texts. Reply HELP for help, or email <a href={`mailto:${support}`} className="underline">{support}</a>. Carriers are not liable for delayed or undelivered messages.
      </p>

      <h2 className={h2}>Privacy</h2>
      <p className="mt-2">
        We never share your mobile number or your opt-in with third parties or affiliates for marketing. See the{' '}
        <a href="/privacy" className="underline">privacy policy</a>.
      </p>
    </main>
  );
}
```
Neither page shows the cast: they are text the founder is accountable for.

`SUPPORT_EMAIL` is read when the pages are prerendered, so every build needs it.
- **`.env.example`:** append
```bash
# Support contact on /privacy and /sms-terms, and in Twilio's HELP reply. Read at build time.
SUPPORT_EMAIL=
```
- **`apps/web/e2e/env.ts`:** in `serverEnv()`, add `SUPPORT_EMAIL: 'help@example.com',` after `ADMIN_EMAILS: '',`.
- **`apps/web/.env.local`:** add `SUPPORT_EMAIL=` with the support address the founder chose. The file is gitignored. Record the address in the launch log.

**[Founder confirms] the wording.** These pages are public statements the founder is accountable for. The founder reads both pages before they deploy, and every edit they ask for goes in now. If the wording of the opt-in changes, bump `SMS_POLICY_VERSION`.

- [ ] **Step 12: Write the production smoke script**

`apps/web/scripts/smoke-production.mts`:
```ts
// Smoke-tests the C2 surface of a production deployment. From apps/web, with the secrets exported from the founder's shell:
//   read -rs CRON_SECRET && export CRON_SECRET
//   read -rs AEROAPI_WEBHOOK_SECRET && export AEROAPI_WEBHOOK_SECRET
//   BASE_URL=https://<APP_DOMAIN> node --import tsx scripts/smoke-production.mts
// Options:
//   --email <address>  also send one email through Resend (needs RESEND_API_KEY and EMAIL_FROM)
//   --sms <E.164>      also send one SMS through the Messaging Service (needs the three TWILIO_ values; only after A2P clears)
// The only write is one aeroapi row in webhook_events, keyed "0:smoke:…", which nothing else reads.
import { Resend } from 'resend';
import twilio from 'twilio';

const base = process.env.BASE_URL?.replace(/\/+$/, '');
const cronSecret = process.env.CRON_SECRET;
const aeroSecret = process.env.AEROAPI_WEBHOOK_SECRET;
if (!base || !cronSecret || !aeroSecret) throw new Error('Set BASE_URL, CRON_SECRET, and AEROAPI_WEBHOOK_SECRET.');

function option(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

let failures = 0;
async function check(name: string, run: () => Promise<string | null>): Promise<void> {
  let problem: string | null;
  try {
    problem = await run();
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
  if (problem) failures += 1;
  console.log(`${problem ? 'FAIL' : 'ok  '}  ${name}${problem ? `: ${problem}` : ''}`);
}

const call = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { redirect: 'manual', ...init });
const post = (path: string, body: string, contentType: string) => call(path, { method: 'POST', headers: { 'content-type': contentType }, body });
const status = (res: Response, ...wanted: number[]) => (wanted.includes(res.status) ? null : `status ${res.status}, expected ${wanted.join(' or ')}`);

// Well formed (22 base64url characters) but matching no trip.
const NO_TRIP = 'smokeSmokeSmokeSmoke00';

await check('landing page', async () => status(await call('/'), 200));
await check('sign-in page', async () => status(await call('/login'), 200));
await check('SMS terms carry HELP and STOP', async () => {
  const res = await call('/sms-terms');
  const html = await res.text();
  return status(res, 200) ?? (html.includes('HELP') && html.includes('STOP') ? null : 'HELP or STOP missing');
});
await check('privacy page names a contact', async () => {
  const res = await call('/privacy');
  const html = await res.text();
  return status(res, 200) ?? (html.includes('mailto:') ? null : 'no support address');
});
await check('an unknown invite reads as expired', async () => {
  const res = await call(`/join/${NO_TRIP}`);
  const html = await res.text();
  return status(res, 200) ?? (html.includes('This invite link has expired') ? null : 'expired-invite copy missing');
});
await check('the invite link preview image renders', async () => {
  const html = await (await call(`/join/${NO_TRIP}`)).text();
  const src = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  if (!src) return 'no og:image tag';
  const res = await fetch(new URL(src.replaceAll('&amp;', '&'), base));
  const type = res.headers.get('content-type') ?? '';
  return status(res, 200) ?? (type.startsWith('image/png') ? null : `content-type ${type}`);
});
await check('inbound email webhook rejects unsigned posts', async () => status(await post('/api/webhooks/inbound-email', '{}', 'application/json'), 401));
await check('Twilio webhook rejects unsigned posts', async () =>
  status(await post('/api/webhooks/twilio', 'MessageSid=SMsmoke&MessageStatus=delivered', 'application/x-www-form-urlencoded'), 403),
);
await check('Stripe webhook rejects unsigned posts', async () => status(await post('/api/webhooks/stripe', '{}', 'application/json'), 400));
await check('AeroAPI webhook is hidden without its path secret', async () => status(await post('/api/webhooks/aeroapi/not-the-secret', '{}', 'application/json'), 404));
await check('AeroAPI webhook answers on its path secret', async () => {
  const body = { alert_id: 0, event_code: 'smoke', flight: { fa_flight_id: `smoke-${Date.now()}`, cancelled: false, scheduled_in: null, estimated_in: null } };
  const res = await post(`/api/webhooks/aeroapi/${aeroSecret}`, JSON.stringify(body), 'application/json');
  if (res.status !== 200) return `status ${res.status}`;
  const json = (await res.json()) as { ignored?: string };
  return json.ignored === 'unknown alert' ? null : `unexpected ${JSON.stringify(json)}`;
});
for (const path of ['/api/cron/notifications', '/api/cron/retention', '/api/cron/document-checks']) {
  await check(`${path} refuses calls without the cron secret`, async () => status(await call(path), 401));
}
await check('the notifications cron runs with the cron secret', async () => {
  const res = await call('/api/cron/notifications', { headers: { authorization: `Bearer ${cronSecret}` } });
  if (res.status !== 200) return `status ${res.status}`;
  const json = (await res.json()) as { sent?: unknown };
  return typeof json.sent === 'number' ? null : `unexpected ${JSON.stringify(json)}`;
});
await check('/admin shows nothing to a signed-out visitor', async () => {
  const res = await call('/admin');
  const html = res.status === 200 ? await res.text() : '';
  return html.includes('Quarantined mail') ? 'admin data rendered without sign-in' : null;
});

const emailTo = option('--email');
if (emailTo) {
  await check(`one email to ${emailTo} through Resend`, async () => {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) return 'set RESEND_API_KEY and EMAIL_FROM';
    const { data, error } = await new Resend(key).emails.send({ from, to: emailTo, subject: 'Elsewhere production check', text: 'This is the launch smoke test. Nothing to do.' });
    return error ? error.message : data ? null : 'no message id';
  });
}

const smsTo = option('--sms');
if (smsTo) {
  await check(`one SMS to ${smsTo} through the Messaging Service`, async () => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
    if (!sid || !token || !service) return 'set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID';
    const message = await twilio(sid, token).messages.create({
      messagingServiceSid: service,
      to: smsTo,
      body: 'Elsewhere: launch check. Reply STOP to opt out.',
      statusCallback: `${base}/api/webhooks/twilio`,
    });
    console.log(`      sent ${message.sid}; Twilio's log should show it delivered, and its status callback answered 200`);
    return null;
  });
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
```

- [ ] **Step 13: Run everything, then commit**

```bash
cd apps/web && npx vitest run && npm run test:integration && npm run typecheck && npm run build && npm run e2e; cd ../..
cd apps/web && npx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck scripts/smoke-production.mts; cd ../..
git status --short
```
Expected:
- Everything passes, including the e2e suite, which now builds with `SUPPORT_EMAIL`.
- The smoke script compiles.
- `git status` shows no `.env.local` and no `e2e/.run/`.

```bash
git add apps/web .env.example
git commit -F - <<'EOF'
Add launch scripts, the SMS terms, and the privacy page

The Resend script creates the sending and receiving domains and the
inbound webhook, and prints the DNS records to add. The smoke script
checks every C2 route a production deploy exposes, without real
traffic. /privacy and /sms-terms state what carriers check before they
approve an A2P campaign, and the join form now uses the same opt-in
wording, from one module.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

- [ ] **Step 14: [Founder confirms] Set the production environment variables**

These go to **Production**. Previews share the production database (C1 Task 12), so they get no provider keys: a preview renders pages but cannot send mail or texts, register flight alerts, or receive webhooks. `SUPPORT_EMAIL` is the one exception, because every build reads it.

The founder runs this in their own terminal. Each value is read without echo and piped to the CLI, so it never reaches shell history:
```bash
add_env() {  # usage: add_env NAME environment
  printf '%s (%s): ' "$1" "$2"; read -rs value; echo
  printf '%s' "$value" | vercel env add "$1" "$2" --cwd apps/web
}
for name in RESEND_API_KEY RESEND_WEBHOOK_SECRET EMAIL_FROM \
            TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_MESSAGING_SERVICE_SID SMS_ENABLED \
            AEROAPI_KEY AEROAPI_WEBHOOK_SECRET JOIN_LINK_SECRET CRON_SECRET ADMIN_EMAILS SUPPORT_EMAIL; do
  add_env "$name" production
done
add_env SUPPORT_EMAIL preview
```

| Name | Value |
|---|---|
| `RESEND_API_KEY` | The `elsewhere-web` full-access key (Step 6) |
| `RESEND_WEBHOOK_SECRET` | Printed by `resend-setup.mts` (Step 6) |
| `EMAIL_FROM` | `Elsewhere <trips@<APP_DOMAIN>>` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` | From the Twilio console (Step 10) |
| `SMS_ENABLED` | `false`. Step 19 turns it on. |
| `AEROAPI_KEY` | From Step 8 |
| `AEROAPI_WEBHOOK_SECRET`, `JOIN_LINK_SECRET`, `CRON_SECRET` | From Step 3. Vercel Cron sends `CRON_SECRET` as the Bearer token. |
| `ADMIN_EMAILS` | The founder's sign-in email. Add more, separated by commas. |
| `SUPPORT_EMAIL` | The support address recorded in Step 11 |

Then check the list. This prints names only, never values:
```bash
vercel env ls production --cwd apps/web
vercel env ls --cwd apps/web | grep -E 'ELSEWHERE_(AI_FAKE_DIR|INBOUND_FIXTURE_DIR|AEROAPI_FIXTURE_DIR|OUTBOX_DIR|PORTS)|WORKFLOW_LOCAL|AI_GATEWAY_API_KEY' || echo 'no test seams or gateway keys'
```
Expected:
- Production lists the 13 names above, plus C1's names, including `INBOUND_DOMAIN`.
- The second command prints `no test seams or gateway keys`. Every seam throws in production, but none may even be set there.

- [ ] **Step 15: [Founder confirms] Merge to `main` and deploy to production, then check the crons and Workflow**

Production builds from `main` (C1 Task 14).
```bash
git push -u origin HEAD
gh pr create --base main --title "Group-trip Assist: join, intake, document checks, monitoring, playbooks, votes, and money" --body-file - <<'EOF'
Adds group-trip Assist on top of the C1 foundation:
- group join by link
- intake of forwarded bookings and screenshots
- document checks against verified rules
- flight monitoring on Vercel Workflow
- cited playbooks, with one question to the planner when a fact is missing
- votes, and who owes what
- /admin for hand-run trips
- the retention and T-30 document-check crons

SMS stays off (SMS_ENABLED=false) until Twilio's A2P 10DLC campaign clears; every alert goes by email until then.

Spec: docs/superpowers/specs/2026-10-01-group-trip-web-app-design.md.
Plan: docs/superpowers/plans/2026-10-01-track-c2-group-trip-assist.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```
After the founder approves the pull request:
```bash
gh pr merge --merge --delete-branch=false
```
Vercel builds `main` for production. Wait until the deployment is `READY` (`mcp__claude_ai_Vercel__list_deployments` for `elsewhere-web`), then check it:
1. **Crons.** Under Project → Settings → Cron Jobs, the three crons are listed: `/api/cron/notifications` every 15 minutes, `/api/cron/retention` at 07:00, and `/api/cron/document-checks` at 13:00.
2. **Workflow.** The CLI must reach the project's Vercel World without error. An empty list is fine at this point.
```bash
cd apps/web && npx workflow inspect runs --backend vercel --project elsewhere-web --team "$TEAM_SLUG"; cd ../..
```
   Runs also appear in the dashboard, under the project's Observability → Workflows.
3. **Build log.** The deployment's build log shows no warnings about `server-only` modules in a workflow bundle.

- [ ] **Step 16: Run the production smoke**

In the founder's terminal:
```bash
cd apps/web
read -rs CRON_SECRET && export CRON_SECRET
read -rs AEROAPI_WEBHOOK_SECRET && export AEROAPI_WEBHOOK_SECRET
read -rs RESEND_API_KEY && export RESEND_API_KEY
export EMAIL_FROM="Elsewhere <trips@$APP_DOMAIN>"
BASE_URL="https://$APP_DOMAIN" node --import tsx scripts/smoke-production.mts --email <founder's email>
cd ../..
```
Expected:
- Every line is `ok`, ending in `All checks passed.`, and the email arrives in the inbox, not spam.
- On a failure, find the cause in the deployment's runtime logs (`mcp__claude_ai_Vercel__get_runtime_logs`).
  - A `500` on a webhook usually means a variable is missing from Step 14.
  - Fix it, then redeploy with `vercel deploy --cwd apps/web --prod`.

- [ ] **Step 17: [Founder confirms] Submit the A2P campaign**

Once `/privacy` and `/sms-terms` are live, submit the campaign on the brand from Step 10. Use these values:
- **Use case:** Low Volume Mixed (account notifications plus two-factor codes). If expected volume passes about 6,000 messages a day, use Mixed.
- **Description:** "Elsewhere (https://<APP_DOMAIN>) watches the flights on a group trip. Travelers who opt in get texts when a flight on their booking is cancelled, delayed, or rescheduled, with a link to what they may be owed, plus group votes, travel-document reminders, and one-time sign-in codes."
- **Sample messages**, from Task 2's templates and the Supabase code template:
  1. `Elsewhere: TP 204 on Nov 3 was cancelled. You may be owed a cash refund. https://<APP_DOMAIN>/trips/…/incidents/…`
  2. `Elsewhere: Quick question for Lisbon 2026: Did anyone accept the airline’s new flight or a travel credit? https://<APP_DOMAIN>/trips/…/incidents/…`
  3. `Elsewhere: Lisbon 2026 vote: Which flight should the group take? https://<APP_DOMAIN>/trips/…/votes/…`
  4. `Your Elsewhere code is 123456`
- **Message contents:** embedded links yes; phone numbers, age-gated content, and lending all no.
- **How users opt in (message flow):** "Travelers join a trip at https://<APP_DOMAIN>/join/(invite). Signed-in travelers see an unticked checkbox reading: 'Text me if something affects my flights. Elsewhere sends trip alerts, group votes, and sign-in codes; message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out.', with links to https://<APP_DOMAIN>/sms-terms and https://<APP_DOMAIN>/privacy. Joining works without it. https://<APP_DOMAIN>/sms-terms reproduces the checkbox and its wording. Travelers who sign in by text request the code themselves at https://<APP_DOMAIN>/login."
- **Links:** privacy policy URL `https://<APP_DOMAIN>/privacy`, and terms URL `https://<APP_DOMAIN>/sms-terms`.
- **Keywords:** opt-out STOP (Twilio's defaults), help HELP, with the HELP reply from Step 10.

Record the submission date, then each status change, in the launch log. Approval usually takes days to weeks. Notifications stay email-only until Step 19.

- [ ] **Step 18: [Founder confirms] Open trips, and run one hand-run trip end to end**

**Open trips.** C1 kept trip creation closed until intake shipped.
```bash
vercel env rm TRIPS_OPEN production --cwd apps/web --yes
printf 'true' | vercel env add TRIPS_OPEN production --cwd apps/web
vercel deploy --cwd apps/web --prod
```

**Run one trip.** The founder runs a real trip of their own, with a flight in the next 60 days. Each check below must pass before the next.

1. **Start a trip.** At `https://<APP_DOMAIN>/start`, sign in by email code, then create the trip with real dates. The trip page shows the forwarding address, `…@in.<APP_DOMAIN>`.
2. **Forward a booking.** Forward the booking confirmation from the founder's own email to that address. Within two minutes:
   - Resend shows the email under Receiving, and a `200` delivery under Webhooks.
   - `/trips/<id>/bookings` shows the booking.
   - This query shows `parsed` or `needs_confirmation` with no `error`:
```sql
select status, error from public.inbound_messages where trip_id = '<trip id from the URL>' order by received_at desc limit 1;
```
   - `npx workflow inspect runs --backend vercel --project elsewhere-web --team "$TEAM_SLUG"` lists a completed `intakeWorkflow` run.
   - AI Gateway → Logs shows the extraction request from `elsewhere-web`, which proves OIDC.
3. **Confirm it, and start monitoring.** Confirm the booking, then in `/admin` choose "Comp and hand-run" for the trip. Then:
```sql
select carrier_iata, flight_number, monitor_state, aeroapi_alert_id from public.booking_segments where trip_id = '<trip id>';
```
   - Expected: `monitoring`, with an alert id. Also, `/admin` lists the flight under "Flights on fallback watching" only if registration failed.
   - In the founder's terminal, AeroAPI shows the alert pointing at production:
```bash
curl -s "$AERO/alerts" -H "x-apikey: $AEROAPI_KEY" | jq -r '.alerts[] | "\(.id) \(.ident) \(.target_url)"' | sed "s/$AEROAPI_WEBHOOK_SECRET/<secret>/"
```
   - The workflow CLI lists a running `tripMonitorWorkflow`, and one `segmentMonitorWorkflow` per confirmed segment.
4. **The invite preview leaks nothing.** On the trip page, create the invite link, and send it to yourself in Messages and in WhatsApp.
   - The preview card shows only the trip name, the dates, the traveler count, and the cast. No member names, booking details, or addresses.
   - Confirm the metadata too:
```bash
curl -s "<invite link>" | grep -o '<meta [^>]*property="og:[a-z:]*"[^>]*>'
```
5. **A member joins.** Someone who is not on the Supabase team (a volunteer, or the founder's second address) opens the link, gets the code by email, joins, and claims their seat on the bookings page. Their documents page shows the owl or the capybara card. The planner's documents view shows the result and never the date.
6. **Clean up, only if this was not a real trip.** For a real trip, leave it running: the founder's own trip is the first hand-run trip. For a test trip, with the founder's yes:
   - **Cancel its runs.** `npx workflow cancel <run_id> --backend vercel --project elsewhere-web --team "$TEAM_SLUG"` for each of its runs.
   - **Delete its AeroAPI alerts.** `curl -s -X DELETE "$AERO/alerts/<id>" -H "x-apikey: $AEROAPI_KEY"`.
   - **Delete the trip.** `delete from public.trips where id = '<trip id>';`, which cascades.

If any check fails, close trips again (`TRIPS_OPEN=false`, then redeploy), fix the cause, and rerun this step.

- [ ] **Step 19: [Founder confirms] Turn SMS on once the A2P campaign clears**

Run this only when Twilio shows the campaign as approved. Until then, every alert goes by email, which Tasks 1 and 2 already enforce.
1. **Supabase phone sign-in.** Under Authentication → Sign In / Providers → Phone, enable the provider:
   - SMS provider Twilio, with the Account SID, the Auth Token, and the Messaging Service SID from Step 10
   - SMS message template: `Your Elsewhere code is {{ .Code }}`
2. **Switch SMS on and redeploy:**
```bash
vercel env rm SMS_ENABLED production --cwd apps/web --yes
printf 'true' | vercel env add SMS_ENABLED production --cwd apps/web
vercel deploy --cwd apps/web --prod
```
3. **Phone sign-in works.** `/login` now offers "Text message". Sign in by phone, and the code arrives by SMS.
4. **Opt-in is recorded.** Join the hand-run trip from that phone account, with the SMS box ticked:
```sql
select kind, policy_version, revoked_at from public.consents where user_id = (select id from public.profiles where phone = '<the E.164 number>');
```
   Expected: an `sms` row with `sms-2026-10`, and no `revoked_at`.
5. **The app's SMS path works.** In the founder's terminal, export the three `TWILIO_` values, then run `BASE_URL="https://$APP_DOMAIN" node --import tsx scripts/smoke-production.mts --sms <the E.164 number>` from `apps/web`.
   - The text arrives.
   - Twilio's Monitor → Logs shows it delivered, with no 11200 webhook errors.
6. **STOP is mirrored.** Reply STOP to it. Within a minute, `sms_opt_in` is false on that profile, and the consent row has `revoked_at` set.

Record the date SMS went on in the launch log.

- [ ] **Step 20: Record the launch log, and commit it**

Fill in every row as its step completes. Never put a secret in this table. A row that can't be filled yet, such as the A2P approval, stays empty until it can.

| # | Item | Result or evidence | Date |
|---|---|---|---|
| 1 | Vercel plan, and `TEAM_SLUG` (Step 2) | | |
| 2 | App secrets generated and stored: names only (Step 3) | | |
| 3 | `00012` is the last migration; the schema probe returns 0 rows; advisors as intended (Step 4) | | |
| 4 | Private `inbound` bucket exists (Step 4) | | |
| 5 | Expedited-passport affiliate: the program, or "none yet" (Step 4) | | |
| 6 | Resend domains verified, and the webhook id (Step 6) | | |
| 7 | Supabase SMTP through Resend; a non-team address got a code (Step 7) | | |
| 8 | AeroAPI tier, the monthly call estimate, and the account endpoint set (Step 8) | | |
| 9 | AI Gateway budget; both model IDs live; the ZDR choice (Step 9) | | |
| 10 | Twilio brand: type and submission date (Step 10) | | |
| 11 | `SUPPORT_EMAIL`, and the founder approved the wording (Step 11) | | |
| 12 | Production variables set; no seams (Step 14) | | |
| 13 | Merge commit, production deployment, crons listed, Workflow CLI reached (Step 15) | | |
| 14 | Production smoke passed (Step 16) | | |
| 15 | A2P campaign: submitted, then approved (Step 17) | | |
| 16 | `TRIPS_OPEN=true` deployed; the hand-run trip passed checks 1–5 (Step 18) | | |
| 17 | SMS on: phone sign-in, opt-in recorded, STOP mirrored (Step 19) | | |

Commit the filled log after Step 18, and again after Step 19:
```bash
git add docs/superpowers/plans/2026-10-01-track-c2-group-trip-assist.md
git commit -F - <<'EOF'
Record the C2 launch log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

## Self-Review Notes (C2 against the spec)

### Spec coverage

| Spec requirement | Task |
|---|---|
| **Group join:** one link per trip, hashed and revocable, expiring at trip end + 7 days; OTP by email or phone; pay handles; SMS opt-in recorded in `consents` | 1 |
| **Join-link preview reveals only the trip name, dates, and traveler count:** the OG image and the page metadata both go through `joinPreview`, whose test pins exactly those three keys. Task 18 checks it in production, in Messages and WhatsApp. | 1, 18 |
| **Members confirm which bookings they are on:** members toggle their own seat, under C1's RLS | 8, 17 |
| **Intake:** a per-trip address; a sender allow list, with everyone else quarantined for approval; a durable `intakeWorkflow` that fetches attachments from Resend; extraction with per-group confidence; dedupe on code plus segment; passenger matching; planner confirmation below 0.9 | 3, 5, 6, 15, 16 |
| **Screenshots, and manual entry when parsing fails** | 5, 8 |
| **Document checks:** passport country and expiry and REAL ID only; deterministic matching; `unknown` when skipped; the planner sees results, never dates; action items assigned to the member; checks on join, on booking change, at T-30 days, and at T-72h | 7, 9, 16 |
| **Travel admin:** the official route always shows (State Department renewal, seeded in C1, alongside TSA REAL ID, CBP Global Entry, and TSA PreCheck); the expedited-passport affiliate, with its disclosure, shows only when routine renewal no longer fits; no GovSwift partner API or callbacks | C1 seed, 7, 18 (Step 4 sets the affiliate once a program approves) |
| **Monitoring:** starts on an active or comped pass; an AeroAPI alert per segment, delivered to the path-secret route; a polling safety net; dedupe on the provider event; checks and a briefing at T-72h; ends at trip end + 7 days | 4, 9 |
| **AeroAPI down or alert registration failing:** polling with exponential backoff; persistent failure becomes an `/admin` alert | 9, 16 |
| **Flight not found:** an action item to the planner | 4 |
| **The situation builder fills `flight.departs_us` and `flight.scheduled_duration_minutes`** (Track A's Task 18 amendment), and both are pinned by scenario tests | 10 |
| **One targeted question when a fact is unknown;** the answer resumes the workflow through a hook | 10, 12 |
| **Playbooks:** only verified rules are cited, and `needs_review` rules appear in caveats as "being re-checked". The deterministic citation check catches a missing ID, a rule outside the allowed set, and any amount or duration not in the rule. A failed draft regenerates once, then falls back to the template. | 11 |
| **Options and the vote:** schedule data is labelled "availability not confirmed — ask the airline" | 13 |
| **Notify only the affected booking members.** Urgent alerts go now; everything else waits out quiet hours, 9pm–8am local. | 2, 12 |
| **Email-only until A2P clears:** SMS goes out only when `SMS_ENABLED=true` and the member opted in. Production starts with it `false`, and it turns on in Task 18 Step 19, after approval. | 1, 2, 18 |
| **STOP is honoured at Twilio and mirrored to `consents`;** delivery status is recorded; email always goes too | 2, 18 |
| **"We drafted," never "we filed"** | Global Constraints; 2 (a template test asserts "We drafted"); 11 (model instructions); 12 (page copy); 17 (the e2e asserts the heading) |
| **Who owes what:** minimal transfers; Venmo and Cash App links; marking settled; no money moves through Elsewhere | 14 |
| **Smart feed, and the members page** | 15 |
| **The cast in the app:** join and onboarding (1); the owl on document-check cards (7); the incident header's `lead_character`, small, with the text leading (12); the capybara's all-clear card (7, 15); empty states (15). There is no art on the bookings list (8), the money ledger (14), the members page (15), `/admin` (16), forms, or the legal pages (18). | 1, 7, 12, 15 |
| **`/admin`:** every trip; comp a pass; rerun checks; incidents; edits validated and logged in `incident_events`; release; quarantined mail; flights on fallback watching | 16 |
| **Retention:** documents 30 days after the last trip unless kept; raw inbound files after 30 days; bookings a year after the trip | 16 |
| **Confirmation codes visible only to members on that booking and to the planner** | C1 RLS, 8 |
| **AI through AI Gateway with no prompt training;** document fields never go to a model | 3, 11 (`NO_TRAINING`), 7 (deterministic checks), 18 |
| **Webhook signatures for Resend, Stripe, and Twilio;** the AeroAPI path token can be rotated | 6, C1 and 9, 2, 18 (Step 8 gives the rotation procedure) |
| **Idempotency on provider event IDs:** Stripe, AeroAPI, and Resend | C1, 9, 6 |
| **Testing:** unit tests; workflow integration tests driven by fake AeroAPI data, including the polling fallback; Playwright end to end | 1–17 |
| **Extraction eval:** 30 cases, at least 95% | 17 |
| **Replay eval:** 50 cases, 100% passing the citation check, graded against expected rules | 17 |
| **Providers:** Vercel (Pro for the 15-minute cron; AI Gateway by OIDC; Workflow; the domain); Supabase (custom SMTP; phone auth through Twilio); Resend (receiving MX, the sending domain, the key, the webhook secret); AeroAPI (an alerts tier, a quota estimate, the account alert endpoint); Twilio (Messaging Service, and A2P 10DLC or toll-free); Stripe | C1 Task 12, 18 |
| **v2 items** (credits, price drops, link → place, `.ics`, recap reel) | Out of scope by design |

### Gaps found in Tasks 1–17, and how they were closed

1. **No-training was never set on model calls.** The spec requires "provider no-training settings." Task 3 now exports `NO_TRAINING` (`providerOptions.gateway.disallowPromptTraining`). Tasks 3 and 11 pass it on every `generateText` call, and both tests assert it. The `ai` 7.0.127 type check passes.
2. **No T-30 document check.** Task 16 adds `GET /api/cron/document-checks`, a daily cron for trips that start in 30 days, with its test and its `vercel.json` entry. Task 7's comment names it. It covers free trips too, not only trips with a pass.
3. **One AeroAPI outage ended a segment's monitoring.** The failing poll step exhausted its retries and failed the run, and nothing reached `/admin`. Now:
   - Task 9's live poll returns `failed: true` instead of throwing.
   - The workflow backs off from 5 minutes up to the normal interval.
   - After three failures in a row, `flagMonitorTrouble` marks the segment `polling_only`.
   - Task 16 lists those flights.
   - A new integration test covers the path.
4. **The replay eval did not match the spec.** It asked for at least 10 cases and never graded matched rules. Task 17 now asks for 50 cases with `expected_rule_ids`, and fails on any rule mismatch.
5. **A build failure in Task 1.** `app/join/[token]/actions.ts` is a `'use server'` file that exported string constants, which Next rejects. The constants are no longer exported, and Task 18 moves the SMS version into `lib/notify/sms-consent.ts`.
6. **Task 12's Interfaces left out names Task 17 consumes:** the pure `assess` and `AssessmentInput`. They are now listed, along with `assessIncident`'s real return type and its file.
7. **Launch blockers that Task 18 closes:**
   - Supabase's built-in mailer reaches only team addresses, so invited members got no code. Task 18 Step 7 adds Resend SMTP.
   - Hobby rejects the 15-minute cron. Step 2 requires Pro.
   - AeroAPI needs `PUT /alerts/endpoint` before any alert can be created. Step 8 sets it.
   - A2P review needs a privacy policy and SMS terms. Step 11 adds both, with shared opt-in wording.
   - Trip creation stayed closed behind `TRIPS_OPEN`. Step 18 opens it.
   - The C2 branch had no merge step. Step 15 adds one.

### Deliberate deviations from the spec (kept)

- **AeroAPI alerts are recorded directly by the webhook route,** instead of resuming a hook raced against `sleep` (Task 9). Both paths share one dedupe key.
- **Join tokens are derived from a server secret** by HMAC (132 bits) rather than stored as random values (Task 1). Only the hash is stored, and resetting the link rotates it.
- **Comps:** `/admin` writes a `comp` pass directly, instead of using a Stripe 100% promotion code (Task 16). `pass_status = comp` still keeps comps out of the paid metrics, so no promotion codes are needed.
- **The e2e replaces providers with guarded seams** rather than provider test modes, and SMS is not exercised while it is off (Task 17). Task 18 Step 19 covers SMS live.
- **Extraction accuracy is measured over every field,** which is stricter than the spec's flight number, date, and names.
- **The T-72h checks and briefing run only for trips with a pass,** because the spec ties them to the monitor workflow. The T-30 check runs for every trip.

### Placeholder scan

There is no "TBD", "TODO", or "fill in later" anywhere in the plan. The only open cells are in Task 18's launch log.

Some values in angle brackets are not placeholders:
- **Recorded values:** `<APP_DOMAIN>`, `<trip id>`, and `<invite link>`.
- **Secrets the founder supplies,** like C1's `<sk_test_...>`: `<key>`, and the affiliate program's name and URL in Step 4, which exist only once a program approves.

The `placeholder=` hits are HTML input hints.

### Type and name consistency (spot checks)

- **C1 names.** All 17 C1 names C2 consumes exist in the C1 plan, with the signatures C2 uses. Among them are `startPassCheckout`, `inboundAddress`, `inboundCodeFromAddress`, `characterDataUrl`, `getCurrentUser`, `requireUser`, `CurrentUser`, `recordEvent`, `assertTestSeamAllowed`, `requireEnv`, `appUrl`, `CHARACTER_NAMES`, `Character` (`character`, `variant`, `width`), the `trip_directory` RPC, `getLibrary`, and `handleStripeEvent`'s `activated` outcome.
- **Schema columns.** Every column Task 18's schema probe lists exists in C1's `00012`, including `trips.join_token_expires_at`, `profiles.timezone`, `notifications.send_after`, and `booking_segments.monitor_state` (with `polling_only`).
- **Workflow ports.**
  - Task 9 defines the monitor operations, including the new `flagMonitorTrouble`.
  - Task 12 adds its incident operations to all three files, by appending.
  - The memory and live ports implement every method.
  - The `pollResults` type takes the optional `failed`.
- **Assessment to playbook.** `Assessment` (Task 12) structurally satisfies `PlaybookInput` (Task 11): `eventSummary`, `situation`, `applying`, `reviewing`, and `extraNumbers`. Task 17's replay passes it straight through.
- **AeroAPI.**
  - `AeroApi.flights` returns `AeroFlight[]`, which is how Task 9's live port now types it.
  - `routeSchedules` (Task 13) is added to both implementations, and to the resolve test's stub.
- **Notifications and hooks.**
  - `NotifyInput` and the template signatures (Task 2) match every `queueNotifications` call, in Tasks 7, 9, 12, and 13.
  - The hook tokens (Task 9) match their uses in Tasks 12 and 16.
- **Task 18's scripts.** `resend-setup.mts` and `smoke-production.mts` typecheck under `--strict` against `resend` 6.32.0 and `twilio` 6.1.2.
- **Noted, not changed:**
  - C1's self-review says "C2 Task 8" uses the travel-admin routes; it is Task 7.
  - Task 1's Interfaces lists `formatIsoDate` as consumed, but `joinPreview` formats with `Intl`. This is harmless.

### Not verified here

This plan was written without running any of it. The executor should know which claims rest on documentation or the shipped packages alone:
- **Resend:** that it accepts a receiving-only domain for `in.<APP_DOMAIN>`, and its record names. Task 18 gets the full hostnames from Resend's dashboard and checks them with `dig`.
- **Vercel AI Gateway:** the `budgets` and `api-keys` flags. Task 18 runs `--help` first.
- **Twilio and Supabase console labels.**
- **AeroAPI:** the tier names and prices.
- **Workflow:** that `sleep(Date)` and `wakeUp` behave in `@workflow/vitest` as they already do for the existing Task 9 test.

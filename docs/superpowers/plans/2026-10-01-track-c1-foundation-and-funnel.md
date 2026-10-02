# Track C1 — Foundation and Public Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the monorepo into one Next.js 16.3 app at `apps/web` and ship the public funnel on it: prerendered rule pages with the cast, the $9/$19 trip-pass offer with funnel telemetry and Stripe Checkout, post attribution for foundry, and money affiliate pages. It runs on the restructured Supabase schema that also serves C2.

**Architecture:** One Next.js 16 App Router app with Cache Components. Public pages are prerendered from a build-time snapshot of `@elsewhere/rules`. Anything that reads cookies streams behind `<Suspense>`. Supabase does auth (email OTP for the planner here; phone OTP and group join come in C2) and storage, with RLS on every trip-scoped table. The whole schema lands in one migration, `00012_group_trip_assist.sql`, tested locally against PGlite with a Supabase auth shim. Stripe Checkout sells the trip pass. Webhooks are idempotent on provider event IDs.

**Tech Stack:**
- **App:** Next.js 16.3.8, React 19.3.0, Tailwind CSS 4.3.3, shadcn/ui (new-york)
- **Data:** zod 4.6, Supabase (`@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.117)
- **Payments and images:** Stripe 23.0.0, `next/og`
- **Tests:** Vitest 5.0.3 with Vite 8, PGlite 0.5.8
- **Tooling and hosting:** tsx, Python 3 + Pillow (asset cutting only), Vercel

**Spec:** `docs/superpowers/specs/2026-10-01-group-trip-web-app-design.md` (primary) and `docs/superpowers/specs/2026-10-01-elsewhere-restart-program.md`.

**Depends on:** Track A's `packages/rules`, implementing `docs/superpowers/plans/2026-10-01-rules-package-interface.md` exactly. C1 Tasks 1–3 need nothing from Track A. Task 4 onward needs `packages/rules` with `npm run rules:build` producing `packages/rules/dist/rules.json`, plus `loadSources` and `CHARACTERS` exported.

**Followed by:** `2026-10-01-track-c2-group-trip-assist.md`, which depends on every task here.

**Not in this plan:** Track D owns `/api/rules.json`, `/api/rules/*`, and `/api/mcp`. Do not create them.

## Global Constraints

- **Node:** use Node **24** for every command. Vitest 5.0.3 declares `engines.node: ^22.12.0 || ^24.0.0 || >=26.0.0`, and the Mac's default Node is 25.4, which is outside that range. Once, run `brew install node@24`. In every shell, before any step, run `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`. `node -v` must print `v24.x`. The repo pins `24` in `.nvmrc`, and `apps/web` declares `"engines": { "node": "24.x" }`, which Vercel honours.
- **Pinned versions:**
  - `next` 16.3.8; `react`, `react-dom`, `@types/react`, `@types/react-dom` 19.3.0
  - `tailwindcss`, `@tailwindcss/postcss` 4.3.3
  - `zod` ^4.6.5, `@supabase/ssr` 0.12.7, `@supabase/supabase-js` ^2.117.2, `stripe` 23.0.0
  - `vitest` 5.0.3, `vite` ^8.3.2, `@vitejs/plugin-react` 6.1.1
  - `@electric-sql/pglite` 0.5.8, `tsx` ^4.19.2
- **Root overrides:** `"react": "19.3.0"` and `"react-dom": "19.3.0"`, replacing 19.1.0.
- **Next 16 conventions:**
  - **Cache Components:** `cacheComponents: true`. Any component that reads `cookies()`, `headers()`, `searchParams`, or per-request data sits inside `<Suspense>`.
  - **Page params:** pages type params as `params: Promise<{...}>` and await them inside the Suspense child.
  - **Runtime:** Node only, so never `export const runtime = 'edge'`.
  - **Proxy:** the proxy file is `apps/web/proxy.ts` (`middleware` is renamed in Next 16). Its matcher excludes `_next/static`, `_next/image`, `favicon.ico`, `characters/`, `.well-known/workflow/`, and `api/webhooks/`.
  - **No lint script:** `next lint` no longer exists in Next 16. Do not add a lint script.
- **`@elsewhere/rules`:** use the names and types from the interface contract exactly, including the 8a0da4a revision: `RulesLibrary.sources`, `Rule.history`, `Rule.replaced_by`, and `buildLibrary({ rules, sources })`. Rule objects keep snake_case keys. App code imports types and pure functions only.
- **Rules library loading:** the deployed rules library is `packages/rules/dist/rules.json`, read through `getLibrary()` in `apps/web/lib/rules/library.ts`. That file and `lib/rules/parse-library.ts` match Track D's plan exactly, so both tracks share one loader.
- **UTM data:** UTM parameters ride along in `funnel_telemetry_events.metadata` (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`). Track D's weekly report reads `metadata.utm_source`.
- **Copy rules:** say "we drafted," never "we filed." Elsewhere never books, rebooks, or files on anyone's behalf.
- **Sensitive data:** never store passport numbers, dates of birth, or loyalty credentials.
- **Service-role key:** only `lib/supabase/admin.ts` reads `SUPABASE_SERVICE_ROLE_KEY`, and it is imported only by route handlers, server actions, and server-only `lib` modules. Every `lib` module that touches it starts with `import 'server-only'`.
- **Money:** integer cents everywhere (`amount_cents`).
- **Cast in the app:**
  - **Where art goes:** full art on public surfaces, small at moments in the app, never in dense working screens.
  - **Where art never goes:** forms, booking lists, or the money ledger.
  - **Asset location:** `apps/web/public/characters/`.
- **Test seams:** environment variables that switch on fixtures or fakes call `assertTestSeamAllowed()`, which throws when `VERCEL_ENV === 'production'`.
- **Commit trailers:** every commit message ends with these two lines:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
  ```
- **[Founder confirms]:** a step marked this way is outward-facing (buying a domain, creating Vercel or Stripe resources, changing the remote database, deploying to production). Stop and get explicit approval before running it.
- **Working directory:** all paths are relative to the repo root, `/Users/eapha/Github/elsewhere-restart`, unless they start with `/`.

## File Structure

```
package.json                         # modify: scripts, overrides
.nvmrc                               # create: 24
turbo.json                           # modify: add test task
.env.example                         # rewrite for the new app
.gitignore                           # modify: apps/web/generated/
supabase/migrations/00012_group_trip_assist.sql   # create: whole C1+C2 schema
supabase/seed.sql                    # rewrite: travel-admin routes only
apps/api/                            # delete
apps/mobile/                         # delete (preserved by tag archive/mobile-expo-2026-10)
packages/shared/                     # delete
scripts/mobile-preview-test.mjs      # delete
scripts/audit-media.mjs              # delete
apps/web/
  package.json  next.config.ts  tsconfig.json  vitest.config.ts  proxy.ts
  app/
    layout.tsx  page.tsx  opengraph-image.tsx  globals.css
    login/page.tsx  login/login-form.tsx  login/actions.ts
    start/page.tsx
    trips/page.tsx  trips/new/page.tsx  trips/new/new-trip-form.tsx  trips/new/actions.ts
    trips/[id]/page.tsx  trips/[id]/actions.ts
    rules/page.tsx  rules/[id]/page.tsx  rules/[id]/opengraph-image.tsx
    money/[slug]/page.tsx  money/[slug]/opengraph-image.tsx
    r/[postId]/route.ts
    api/attribution/route.ts
    api/webhooks/stripe/route.ts
    actions/funnel.ts
  components/
    ui/button.tsx  ui/card.tsx       # kept
    character.tsx
    rules/rule-article.tsx
    offer/offer.tsx  offer/offer-card.tsx
    funnel/beacon.tsx
    money/affiliate-offers.tsx
  lib/
    env.ts  utils.ts  utils/errors.ts
    supabase/server.ts  supabase/admin.ts  supabase/proxy.ts
    auth/user.ts  auth/safe-next.ts
    funnel/anonymous-id.ts  funnel/variant.ts  funnel/events.ts
    rules/parse-library.ts  rules/library.ts  rules/accessors.ts
    characters.ts
    og/assets.ts  og/frame.tsx
    trips/inbound-code.ts  trips/new-trip.ts
    payments/stripe.ts  payments/passes.ts  payments/pass-store.ts
    attribution/link.ts  attribution/summary.ts  attribution/touchpoints.ts
    affiliate/offers.ts
  scripts/cut-characters.py  scripts/stripe-setup.mts
  public/characters/{capybara,owl,raccoon,pigeon}.png and *-avatar.png, scenes/raccoon-gate.png
  test/
    setup/server-only.ts
    db/harness.ts  db/schema.test.ts
    fixtures/rules-library.json      # RulesLibrary fixture (also used by C2's e2e)
    *.test.ts(x)
```

---

### Task 1: Collapse the monorepo into one Next.js 16 app

**Files:**
- Delete: `apps/mobile/`, `apps/api/` (after moving `lib/utils/errors.ts`), `packages/shared/`, `scripts/mobile-preview-test.mjs`, `scripts/audit-media.mjs`, `apps/web/app/preview/`, `apps/web/components/preview/`, `apps/web/app/login/`, `apps/web/lib/api.ts`, `apps/web/lib/image.ts`, `apps/web/lib/supabase.ts`
- Move: `apps/api/lib/utils/errors.ts` → `apps/web/lib/utils/errors.ts`
- Create: `apps/web/lib/env.ts`, `apps/web/vitest.config.ts`, `apps/web/test/setup/server-only.ts`, `apps/web/test/env.test.ts`, `apps/web/test/errors.test.ts`
- Create: `.nvmrc`
- Modify: `package.json`, `turbo.json`, `.env.example`, `.gitignore`, `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/lib/utils.ts`

**Interfaces:**
- Produces:
  - `requireEnv(name: string): string`
  - `appUrl(): string` (no trailing slash)
  - `assertTestSeamAllowed(name: string): void`
  - `errorResponse(error: unknown): NextResponse<APIError>`
  - `class AuthError extends Error`
  - `cn(...inputs)`

- [ ] **Step 1: Confirm the starting point and Node 24**

Run:
```bash
git tag --list 'archive/mobile-expo-2026-10' && git status --short
brew list node@24 >/dev/null 2>&1 || brew install node@24
export PATH="/opt/homebrew/opt/node@24/bin:$PATH" && node -v
printf '24\n' > .nvmrc
```
Expected: the tag prints, the status is empty, and `node -v` prints `v24.x`. If the tag is missing, stop and ask; the archive must exist before mobile is deleted.

- [ ] **Step 2: Move the one surviving API file, then delete everything parked**

```bash
mkdir -p apps/web/lib/utils
git mv apps/api/lib/utils/errors.ts apps/web/lib/utils/errors.ts
git rm -r -q apps/mobile apps/api packages/shared scripts/mobile-preview-test.mjs scripts/audit-media.mjs \
  apps/web/app/preview apps/web/components/preview apps/web/app/login \
  apps/web/lib/api.ts apps/web/lib/image.ts apps/web/lib/supabase.ts
```
Expected: no errors. `ls apps` prints `web` only, and `ls packages` prints `rules` once Track A has landed, or nothing.

C2 restores the reused trip-room contracts and mock scenarios from the tag with `git show archive/mobile-expo-2026-10:<path>`, so nothing is lost.

- [ ] **Step 3: Write the failing tests for env and errors**

`apps/web/test/env.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import { appUrl, assertTestSeamAllowed, requireEnv } from '@/lib/env';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('requireEnv', () => {
  it('returns the value when set', () => {
    process.env.SOME_KEY = 'abc';
    expect(requireEnv('SOME_KEY')).toBe('abc');
  });

  it('throws a named error when missing', () => {
    delete process.env.SOME_KEY;
    expect(() => requireEnv('SOME_KEY')).toThrow('Missing required environment variable SOME_KEY');
  });
});

describe('appUrl', () => {
  it('strips trailing slashes', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.test//';
    expect(appUrl()).toBe('https://example.test');
  });
});

describe('assertTestSeamAllowed', () => {
  it('allows seams outside production', () => {
    process.env.VERCEL_ENV = 'preview';
    expect(() => assertTestSeamAllowed('ELSEWHERE_OUTBOX_DIR')).not.toThrow();
  });

  it('refuses seams in production', () => {
    process.env.VERCEL_ENV = 'production';
    expect(() => assertTestSeamAllowed('ELSEWHERE_OUTBOX_DIR')).toThrow(/test seam/);
  });
});
```

`apps/web/test/errors.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AuthError, errorResponse } from '@/lib/utils/errors';

describe('errorResponse', () => {
  it('maps AuthError to 401', async () => {
    const res = errorResponse(new AuthError('Missing authorization token'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized', message: 'Missing authorization token', statusCode: 401 });
  });

  it('maps ZodError to 400 with field paths', async () => {
    const parsed = z.object({ email: z.email() }).safeParse({ email: 'nope' });
    if (parsed.success) throw new Error('expected failure');
    const res = errorResponse(parsed.error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('email');
  });

  it('hides internal error messages behind a generic 500', async () => {
    const res = errorResponse(new Error('db password is hunter2'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Error', message: 'Internal server error', statusCode: 500 });
  });
});
```

- [ ] **Step 4: Write the app package, configs, and test setup**

`apps/web/package.json`:
```json
{
  "name": "@elsewhere/web",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": "24.x" },
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@radix-ui/react-slot": "^1.1.2",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.460.0",
    "next": "16.3.8",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "server-only": "0.0.1",
    "tailwind-merge": "^2.5.5",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.3",
    "@types/node": "^22",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.1.1",
    "tailwindcss": "4.3.3",
    "tsx": "^4.19.2",
    "tw-animate-css": "^1.2.0",
    "typescript": "^5.5",
    "vite": "^8.3.2",
    "vitest": "5.0.3"
  }
}
```

Root `package.json`. Replace the whole file:
```json
{
  "name": "elsewhere",
  "version": "1.0.0",
  "private": true,
  "packageManager": "npm@11.7.0",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "typecheck": "turbo typecheck",
    "test": "turbo test"
  },
  "devDependencies": {
    "turbo": "^2",
    "typescript": "^5.5"
  },
  "dependencies": {
    "ruflo": "^3.5.51"
  },
  "overrides": {
    "react": "19.3.0",
    "react-dom": "19.3.0"
  }
}
```

`turbo.json`. Replace the whole file:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "persistent": true,
      "cache": false
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {}
  }
}
```

`apps/web/next.config.ts`:
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] },
    "noEmit": true,
    "allowJs": true,
    "incremental": true,
    "declaration": false,
    "declarationMap": false
  },
  "include": ["**/*.ts", "**/*.tsx", "next-env.d.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}/` },
      { find: 'server-only', replacement: `${root}/test/setup/server-only.ts` },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: ['test/**/*.integration.test.ts', 'e2e/**', 'node_modules/**'],
  },
});
```

`apps/web/test/setup/server-only.ts`:
```ts
// Vitest stand-in for the `server-only` package, which throws outside a React Server environment.
export {};
```

- [ ] **Step 5: Install and run the tests to verify they fail**

```bash
npm install
cd apps/web && npx vitest run test/env.test.ts test/errors.test.ts; cd ../..
```
Expected: FAIL. `@/lib/env` cannot be resolved, and `errors.ts` still uses the zod 3 `.errors` field.

- [ ] **Step 6: Write `env.ts`, update `errors.ts` for zod 4, and simplify `utils.ts`**

`apps/web/lib/env.ts`:
```ts
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function appUrl(): string {
  return requireEnv('NEXT_PUBLIC_APP_URL').replace(/\/+$/, '');
}

/** Fixture directories, outboxes, and fake ports are test seams. They must never switch on in production. */
export function assertTestSeamAllowed(name: string): void {
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error(`${name} is a test seam and cannot be enabled in production`);
  }
}
```

`apps/web/lib/utils/errors.ts`. Replace the whole file:
```ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface APIError {
  error: string;
  message: string;
  statusCode: number;
}

export function errorResponse(error: unknown): NextResponse<APIError> {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: 'Unauthorized', message: error.message, statusCode: 401 }, { status: 401 });
  }
  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
    return NextResponse.json({ error: 'Validation Error', message, statusCode: 400 }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: 'Internal Error', message: 'Internal server error', statusCode: 500 }, { status: 500 });
}
```

`apps/web/lib/utils.ts`. Replace the whole file; `apiBaseUrl` existed only for the removed `/api/v1` rewrite:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 7: Replace the layout and landing page (text only; Task 5 adds art)**

`apps/web/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: 'Elsewhere — your group trip, watched',
  description:
    'Forward the group’s bookings. Elsewhere checks everyone’s documents, watches every flight, and tells the right people what they’re owed — with the rule cited.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#faf8f1] text-[#2f3a2c] antialiased">{children}</body>
    </html>
  );
}
```

`apps/web/app/page.tsx`:
```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const STEPS = [
  { title: 'Forward the bookings', body: 'Send the confirmation emails to your trip’s address. We build the itinerary.' },
  { title: 'Drop one link in the group chat', body: 'Everyone joins in a browser. Nobody installs anything.' },
  { title: 'We watch the trip', body: 'Documents before you go, every flight while you travel, and the rule behind every answer.' },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-[#b4532a]">Elsewhere</p>
      <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
        Your group trip, watched. When it goes sideways, the right people know what they’re owed.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-[#4b5745]">
        We read the rules so you don’t have to: refunds, delays, passports, and the fine print — every answer cited.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/start">Start a trip</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/rules">Browse the rules</Link>
        </Button>
      </div>
      <ol className="mt-16 grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="rounded-xl border border-[#e4dfd0] bg-white p-6">
            <span className="text-sm font-semibold text-[#b4532a]">{index + 1}</span>
            <h2 className="mt-2 font-semibold">{step.title}</h2>
            <p className="mt-1 text-sm text-[#4b5745]">{step.body}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
```

- [ ] **Step 8: Rewrite `.env.example` and ignore generated output**

`.env.example`. Replace the whole file:
```bash
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
INBOUND_DOMAIN=in.example.test

# Supabase (project xiinobmygdfwkpjtqauo)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe (trip pass payment test)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_P9=
STRIPE_PRICE_P19=

# Foundry attribution sync
FOUNDRY_ATTRIBUTION_KEY=

# Affiliate offers on /money pages (leave empty until each program approves)
AFFILIATE_CARD_URL=
AFFILIATE_SAFETYWING_URL=
AFFILIATE_WORLDNOMADS_URL=

# Funnel telemetry (set to false to disable writes)
ELSEWHERE_ENABLE_FUNNEL_TELEMETRY=true

# Test seams — never set in production
ELSEWHERE_RULES_FIXTURE=
```

Append to `.gitignore`:
```
# Next app build-time output
apps/web/generated/
```

- [ ] **Step 9: Run the tests, typecheck, and build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && npx next build; cd ../..
```
Expected: 7 tests pass, tsc prints nothing, and `next build` finishes with `/` prerendered. `apps/web/package.json` deliberately has no `"type": "module"`, so `next.config.ts` can use `__dirname` (Task 4 and Track D rely on it). Config files that need ESM use `import.meta.url`, which Vite and tsx support either way. If `next build` complains about `jsx` in tsconfig, accept Next's automatic edit; Next 16 may switch it to `react-jsx`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -F - <<'EOF'
Collapse the monorepo into one Next.js 16 app

apps/api and apps/web merge into apps/web on Next 16.3 with Cache
Components. Mobile, the shared package, and the preview, booking,
financing, and feed code are removed; the mobile app is preserved by the
archive/mobile-expo-2026-10 tag and C2 restores the reused trip-room
contracts from it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 2: One migration for the group-trip schema, tested against PGlite

**Files:**
- Create: `supabase/migrations/00012_group_trip_assist.sql`, `apps/web/test/db/harness.ts`, `apps/web/test/db/schema.test.ts`
- Modify: `supabase/seed.sql` (rewrite), `apps/web/package.json` (devDependency `@electric-sql/pglite`)

**Interfaces:**
- Produces, used by every later task and by C2:
  - **Tables:**
    - `trips`, with new `name`, `destination_country`, `inbound_code`, `join_token_hash`, `join_token_expires_at`, `pass_status`, `created_anonymous_id`, and `created_utm`
    - `trip_members`, `member_documents`, `travel_admin_partner_routes`
    - `inbound_messages`, `bookings`, `booking_segments`, `booking_members`
    - `document_checks`, `incidents`, `incident_events`, `playbooks`, `action_items`
    - `votes`, `vote_options`, `vote_responses`, `expenses`, `settlements`
    - `notifications`, `consents`, `passes`, `webhook_events`
    - `experiment_assignments`, `funnel_telemetry_events`, `attribution_touchpoints`
  - **SQL functions:**
    - `is_trip_member(uuid)`, `is_trip_planner(uuid)`
    - `create_trip(p_name text, p_destination_country text, p_start_date date, p_end_date date, p_inbound_code text, p_display_name text, p_anonymous_id text, p_utm jsonb) returns uuid`
    - `join_trip(p_token_hash text, p_display_name text) returns uuid`
    - `trip_directory(p_trip_id uuid)`
    - `booking_confirmation_code(p_booking_id uuid) returns text`
    - `attribution_summary(p_since timestamptz)` (service role only)
  - **Test helpers:**
    - `createTestDb(): Promise<PGlite>`
    - `createAuthUser(db, { id, email?, phone?, displayName? })`
    - `asUser(db, userId, fn)`, `asService(db, fn)`

- [ ] **Step 1: Add PGlite**

```bash
npm install -D @electric-sql/pglite@0.5.8 -w @elsewhere/web
```

- [ ] **Step 2: Write the test harness**

`apps/web/test/db/harness.ts`:
```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const seedFile = path.join(repoRoot, 'supabase', 'seed.sql');

/**
 * The slice of Supabase that our migrations rely on: the auth schema, auth.uid(),
 * the three API roles, and the default grants Supabase gives them on public objects.
 */
const SUPABASE_SHIM = `
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  phone text,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export type TestDb = PGlite;

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await db.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  await db.exec(readFileSync(seedFile, 'utf8'));
  return db;
}

export async function createAuthUser(
  db: TestDb,
  user: { id: string; email?: string; phone?: string; displayName?: string },
): Promise<void> {
  await db.query('insert into auth.users (id, email, phone, raw_user_meta_data) values ($1, $2, $3, $4)', [
    user.id,
    user.email ?? null,
    user.phone ?? null,
    JSON.stringify(user.displayName ? { display_name: user.displayName } : {}),
  ]);
}

async function asRole<T>(db: TestDb, role: 'authenticated' | 'service_role', userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

export function asUser<T>(db: TestDb, userId: string, fn: () => Promise<T>): Promise<T> {
  return asRole(db, 'authenticated', userId, fn);
}

export function asService<T>(db: TestDb, fn: () => Promise<T>): Promise<T> {
  return asRole(db, 'service_role', '', fn);
}
```

- [ ] **Step 3: Write the failing schema tests**

`apps/web/test/db/schema.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { asService, asUser, createAuthUser, createTestDb, type TestDb } from './harness';

const PLANNER = '00000000-0000-4000-8000-000000000001';
const MEMBER = '00000000-0000-4000-8000-000000000002';
const OUTSIDER = '00000000-0000-4000-8000-000000000003';
const TOKEN_HASH = 'a'.repeat(64);

let db: TestDb;
let tripId: string;
let bookingId: string;
let plannerMemberId: string;
let memberMemberId: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<T>(sql, params);
  return result.rows[0] as T;
}

beforeAll(async () => {
  db = await createTestDb();
  await createAuthUser(db, { id: PLANNER, email: 'Planner@Example.test', displayName: 'Pat' });
  await createAuthUser(db, { id: MEMBER, phone: '15551234567' });
  await createAuthUser(db, { id: OUTSIDER, email: 'out@example.test' });

  tripId = await asUser(db, PLANNER, async () =>
    (await one<{ id: string }>(
      `select public.create_trip('Lisbon 2026', 'PT', '2026-11-03', '2026-11-10', 'trip-abc234', 'Pat',
         'aid0000000000000000000000000000a', '{"utm_source":"tiktok"}'::jsonb) as id`,
    )).id,
  );
  await asService(db, () =>
    db.query("update public.trips set join_token_hash = $1, join_token_expires_at = now() + interval '7 days' where id = $2", [TOKEN_HASH, tripId]),
  );
  await asUser(db, MEMBER, () => db.query("select public.join_trip($1, 'Sam')", [TOKEN_HASH]));

  const members = await asService(db, () => db.query<{ id: string; user_id: string }>('select id, user_id from public.trip_members where trip_id = $1', [tripId]));
  plannerMemberId = members.rows.find((m) => m.user_id === PLANNER)!.id;
  memberMemberId = members.rows.find((m) => m.user_id === MEMBER)!.id;

  bookingId = await asService(db, async () =>
    (await one<{ id: string }>(
      `insert into public.bookings (trip_id, kind, provider, confirmation_code, passenger_names, extraction_confidence, dedupe_key)
       values ($1, 'flight', 'TAP Air Portugal', 'ABC123', '{PAT,SAM}', 0.97, 'ABC123|TP204|2026-11-03') returning id`,
      [tripId],
    )).id,
  );
  await asService(db, () =>
    db.query('insert into public.booking_members (booking_id, member_id, trip_id) values ($1, $2, $3)', [bookingId, plannerMemberId, tripId]),
  );
}, 60_000);

describe('profiles trigger', () => {
  it('normalizes email, prefixes phone, and falls back to a display name', async () => {
    const rows = await asService(db, () =>
      db.query<{ id: string; email: string | null; phone: string | null; display_name: string }>(
        'select id, email, phone, display_name from public.profiles order by id',
      ),
    );
    expect(rows.rows).toEqual([
      { id: PLANNER, email: 'planner@example.test', phone: null, display_name: 'Pat' },
      { id: MEMBER, email: null, phone: '+15551234567', display_name: 'Traveler' },
      { id: OUTSIDER, email: 'out@example.test', phone: null, display_name: 'out' },
    ]);
  });
});

describe('trips and membership', () => {
  it('create_trip makes the caller the planner and keeps the visitor attribution', async () => {
    const role = await asUser(db, PLANNER, () => one<{ role: string }>('select role from public.trip_members where trip_id = $1 and user_id = $2', [tripId, PLANNER]));
    expect(role.role).toBe('planner');
    const trip = await asService(db, () => one<{ created_anonymous_id: string; created_utm: Record<string, string> }>('select created_anonymous_id, created_utm from public.trips where id = $1', [tripId]));
    expect(trip).toEqual({ created_anonymous_id: 'aid0000000000000000000000000000a', created_utm: { utm_source: 'tiktok' } });
  });

  it('members read the trip; outsiders do not', async () => {
    const member = await asUser(db, MEMBER, () => db.query('select id from public.trips where id = $1', [tripId]));
    const outsider = await asUser(db, OUTSIDER, () => db.query('select id from public.trips where id = $1', [tripId]));
    expect(member.rows).toHaveLength(1);
    expect(outsider.rows).toHaveLength(0);
  });

  it('join_trip rejects an expired link', async () => {
    await asService(db, () => db.query("update public.trips set join_token_expires_at = now() - interval '1 minute' where id = $1", [tripId]));
    await expect(asUser(db, OUTSIDER, () => db.query("select public.join_trip($1, 'Olly')", [TOKEN_HASH]))).rejects.toThrow(/invalid or expired link/);
    await asService(db, () => db.query("update public.trips set join_token_expires_at = now() + interval '7 days' where id = $1", [tripId]));
  });

  it('trip_directory exposes pay handles to members only', async () => {
    await asUser(db, PLANNER, () => db.query("update public.profiles set venmo_username = 'pat-travels' where id = $1", [PLANNER]));
    const forMember = await asUser(db, MEMBER, () => db.query<{ display_name: string; venmo_username: string | null }>('select display_name, venmo_username from public.trip_directory($1)', [tripId]));
    const forOutsider = await asUser(db, OUTSIDER, () => db.query('select * from public.trip_directory($1)', [tripId]));
    expect(forMember.rows).toContainEqual({ display_name: 'Pat', venmo_username: 'pat-travels' });
    expect(forOutsider.rows).toHaveLength(0);
  });
});

describe('bookings', () => {
  it('hides the confirmation code column from direct reads', async () => {
    await expect(asUser(db, PLANNER, () => db.query('select confirmation_code from public.bookings'))).rejects.toThrow(/permission denied/);
    const visible = await asUser(db, MEMBER, () => db.query('select id, provider from public.bookings where trip_id = $1', [tripId]));
    expect(visible.rows).toHaveLength(1);
  });

  it('booking_confirmation_code returns the code to the planner and booking members only', async () => {
    const planner = await asUser(db, PLANNER, () => one<{ code: string | null }>('select public.booking_confirmation_code($1) as code', [bookingId]));
    const member = await asUser(db, MEMBER, () => one<{ code: string | null }>('select public.booking_confirmation_code($1) as code', [bookingId]));
    expect(planner.code).toBe('ABC123');
    expect(member.code).toBeNull();
  });
});

describe('documents', () => {
  it('member_documents are owner-only', async () => {
    await asUser(db, MEMBER, () => db.query("insert into public.member_documents (user_id, kind, issuing_country, expires_on) values ($1, 'passport', 'US', '2027-01-15')", [MEMBER]));
    const planner = await asUser(db, PLANNER, () => db.query('select * from public.member_documents'));
    const member = await asUser(db, MEMBER, () => db.query('select kind from public.member_documents'));
    expect(planner.rows).toHaveLength(0);
    expect(member.rows).toEqual([{ kind: 'passport' }]);
  });

  it('planners see every document check; members see their own', async () => {
    await asService(db, () =>
      db.query(
        `insert into public.document_checks (trip_id, member_id, user_id, rule_id, rule_version, result, detail)
         values ($1, $2, $3, 'x', 1, 'action_needed', 'Passport may not be valid long enough for Portugal.'),
                ($1, $4, $5, null, null, 'ok', 'No document issues found.')`,
        [tripId, memberMemberId, MEMBER, plannerMemberId, PLANNER],
      ),
    );
    const planner = await asUser(db, PLANNER, () => db.query('select result from public.document_checks where trip_id = $1', [tripId]));
    const member = await asUser(db, MEMBER, () => db.query('select result from public.document_checks where trip_id = $1', [tripId]));
    expect(planner.rows).toHaveLength(2);
    expect(member.rows).toEqual([{ result: 'action_needed' }]);
  });

  it('seeds the official travel-admin routes', async () => {
    const routes = await asUser(db, OUTSIDER, () => db.query<{ kind: string }>('select kind from public.travel_admin_partner_routes order by kind'));
    expect(routes.rows.map((r) => r.kind)).toEqual(['passport', 'real_id', 'global_entry', 'tsa_precheck']);
  });
});

describe('incidents', () => {
  it('are visible to affected members and the planner only', async () => {
    const segment = await asService(db, () =>
      one<{ id: string }>(
        `insert into public.booking_segments (booking_id, trip_id, position, carrier_iata, flight_number, origin_iata, destination_iata, departure_local)
         values ($1, $2, 1, 'TP', '204', 'EWR', 'LIS', '2026-11-03T18:15') returning id`,
        [bookingId, tripId],
      ),
    );
    await asService(db, () =>
      db.query(
        `insert into public.incidents (trip_id, segment_id, event_type, dedupe_key, affected_user_ids)
         values ($1, $2, 'cancellation', 'seg:cancellation', $3)`,
        [tripId, segment.id, `{${PLANNER}}`],
      ),
    );
    const planner = await asUser(db, PLANNER, () => db.query('select id from public.incidents'));
    const member = await asUser(db, MEMBER, () => db.query('select id from public.incidents'));
    expect(planner.rows).toHaveLength(1);
    expect(member.rows).toHaveLength(0);
  });
});

describe('growth tables and attribution', () => {
  it('are closed to signed-in users', async () => {
    await expect(asUser(db, PLANNER, () => db.query('select * from public.funnel_telemetry_events'))).resolves.toMatchObject({ rows: [] });
    await expect(asUser(db, PLANNER, () => db.query("select * from public.attribution_summary(now() - interval '1 day')"))).rejects.toThrow(/permission denied/);
  });

  it('attributes conversions to the last touch before them', async () => {
    const aid = 'aid0000000000000000000000000000a';
    await asService(db, () =>
      db.query(
        `insert into public.attribution_touchpoints (anonymous_id, post_id, platform, landing_path, created_at) values
           ($1, 'post-1', 'tiktok', '/rules', now() - interval '3 hours'),
           ($1, 'post-2', 'instagram', '/rules', now() - interval '2 hours');
         insert into public.funnel_telemetry_events (anonymous_id, trip_id, event_name, created_at) values
           ($1, $2, 'booking_forwarded', now() - interval '1 hour'),
           ($1, $2, 'paid', now() - interval '30 minutes');`,
        [aid, tripId],
      ),
    );
    const summary = await asService(db, () =>
      db.query<{ post_id: string; clicks: number; forwarded_bookings: number; paid_passes: number }>(
        "select post_id, clicks::int, forwarded_bookings::int, paid_passes::int from public.attribution_summary(now() - interval '1 day')",
      ),
    );
    expect(summary.rows).toEqual([
      { post_id: 'post-1', clicks: 1, forwarded_bookings: 0, paid_passes: 0 },
      { post_id: 'post-2', clicks: 1, forwarded_bookings: 1, paid_passes: 1 },
    ]);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/db/schema.test.ts; cd ../..
```
Expected: FAIL in `beforeAll`, with `function public.create_trip(...) does not exist`. The seed also fails, because it inserts into `destinations`, which the old schema still has but whose seed no longer matches.

- [ ] **Step 5: Write the migration**

`supabase/migrations/00012_group_trip_assist.sql`:
```sql
-- Group-trip Assist restructure.
-- Spec: docs/superpowers/specs/2026-10-01-group-trip-web-app-design.md
-- The project holds seed data only, so parked tables are dropped outright.

-- 1. Drop parked features -----------------------------------------------------
drop table if exists public.preview_jobs cascade;
drop table if exists public.reference_photos cascade;
drop table if exists public.consent_audit_entries cascade;
drop table if exists public.branded_destination_packs cascade;
drop table if exists public.support_override_actions cascade;
drop table if exists public.financing_status_events cascade;
drop table if exists public.financing_disclosure_records cascade;
drop table if exists public.financing_checkouts cascade;
drop table if exists public.financing_offers cascade;
drop table if exists public.wallet_installments cascade;
drop table if exists public.assist_action_recommendations cascade;
drop table if exists public.assist_timeline cascade;
drop table if exists public.assist_incidents cascade;
drop table if exists public.assist_disruption_events cascade;
drop table if exists public.assist_policy_rules cascade;
drop table if exists public.travel_admin_applications cascade;
drop table if exists public.travel_admin_partner_routes cascade;
drop table if exists public.travel_document_records cascade;
drop table if exists public.trip_quotes cascade;
drop table if exists public.trip_room_messages cascade;
drop table if exists public.travelers cascade;
drop table if exists public.attribution_touchpoints cascade;
drop table if exists public.experiment_assignments cascade;
drop table if exists public.funnel_telemetry_events cascade;

drop policy if exists "Users manage own trips" on public.trips;
alter table public.trips
  drop column destination_id,
  drop column traveler_count,
  drop column total_cost,
  drop column booking_flow_state,
  drop column booking_flow_attempt_count,
  drop column booking_flow_error,
  drop column booking_flow_checkout_url,
  drop column booking_flow_updated_at;
drop table if exists public.destinations cascade;

drop type if exists booking_flow_state, payment_state, message_author_type, financing_provider,
  installment_status, preview_job_status, preview_media_type, disruption_source, disruption_kind,
  disruption_severity, incident_resolution, policy_action_type, timeline_entry_type,
  partner_route_mode, travel_document_type;

-- 2. Profiles ------------------------------------------------------------------
alter table public.profiles
  drop column is_auto_rebook_enabled,
  drop column is_credit_protection_enabled,
  drop column is_calendar_connected,
  add column email text,
  add column phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  add column sms_opt_in boolean not null default false,
  add column venmo_username text check (venmo_username is null or venmo_username ~ '^[A-Za-z0-9_-]{5,30}$'),
  add column cashtag text check (cashtag is null or cashtag ~ '^[A-Za-z][A-Za-z0-9]{0,19}$'),
  add column timezone text not null default 'America/New_York';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email, phone)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Traveler'
    ),
    lower(nullif(new.email, '')),
    case when coalesce(new.phone, '') = '' then null else '+' || ltrim(new.phone, '+') end
  );
  return new;
end;
$$;

-- 3. Trips and membership --------------------------------------------------------
create type pass_status as enum ('none', 'active', 'comp');
create type member_role as enum ('planner', 'member');

alter table public.trips
  add column name text not null default 'New trip',
  add column destination_country text check (destination_country is null or destination_country ~ '^[A-Z]{2}$'),
  add column inbound_code text unique,
  add column join_token_hash text unique,
  add column join_token_expires_at timestamptz,
  add column pass_status pass_status not null default 'none',
  add column created_anonymous_id text,
  add column created_utm jsonb not null default '{}';
update public.trips set inbound_code = 'trip-' || replace(gen_random_uuid()::text, '-', '') where inbound_code is null;
alter table public.trips alter column inbound_code set not null;

create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role member_role not null default 'member',
  display_name text not null check (length(display_name) between 1 and 80),
  joined_at timestamptz not null default now(),
  unique (trip_id, user_id),
  unique (id, trip_id)
);

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_members where trip_id = p_trip_id and user_id = auth.uid());
$$;

create or replace function public.is_trip_planner(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members where trip_id = p_trip_id and user_id = auth.uid() and role = 'planner'
  );
$$;

create or replace function public.create_trip(
  p_name text, p_destination_country text, p_start_date date, p_end_date date,
  p_inbound_code text, p_display_name text, p_anonymous_id text, p_utm jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_trip uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.trips (owner_id, name, destination_country, start_date, end_date, inbound_code,
                            created_anonymous_id, created_utm)
  values (auth.uid(), p_name, p_destination_country, p_start_date, p_end_date, p_inbound_code,
          p_anonymous_id, coalesce(p_utm, '{}'::jsonb))
  returning id into v_trip;
  insert into public.trip_members (trip_id, user_id, role, display_name)
  values (v_trip, auth.uid(), 'planner', p_display_name);
  return v_trip;
end;
$$;

create or replace function public.join_trip(p_token_hash text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_trip uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select id into v_trip from public.trips
   where join_token_hash = p_token_hash and join_token_expires_at > now();
  if v_trip is null then
    raise exception 'invalid or expired link' using errcode = 'P0002';
  end if;
  insert into public.trip_members (trip_id, user_id, role, display_name)
  values (v_trip, auth.uid(), 'member', p_display_name)
  on conflict (trip_id, user_id) do update set display_name = excluded.display_name;
  return v_trip;
end;
$$;

create or replace function public.trip_directory(p_trip_id uuid)
returns table (member_id uuid, user_id uuid, display_name text, role member_role, venmo_username text, cashtag text)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, m.display_name, m.role, p.venmo_username, p.cashtag
  from public.trip_members m
  join public.profiles p on p.id = m.user_id
  where m.trip_id = p_trip_id and public.is_trip_member(p_trip_id)
  order by m.role, m.display_name;
$$;

-- 4. Documents and travel-admin routes --------------------------------------------
create type member_document_kind as enum ('passport', 'real_id', 'global_entry', 'tsa_precheck');

create table public.member_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind member_document_kind not null,
  issuing_country text check (issuing_country is null or issuing_country ~ '^[A-Z]{2}$'),
  expires_on date,
  real_id_compliant boolean,
  keep_on_profile boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, kind)
);

-- Per document kind: the free official route (always shown) and an optional affiliate fallback.
create table public.travel_admin_partner_routes (
  id uuid primary key default gen_random_uuid(),
  kind member_document_kind not null unique,
  official_label text not null,
  official_url text not null,
  official_note text,
  routine_processing_days int check (routine_processing_days > 0),
  expedited_processing_days int check (expedited_processing_days > 0),
  processing_source_url text,
  affiliate_label text,
  affiliate_url text,
  affiliate_disclosure text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (affiliate_url is null or (affiliate_label is not null and affiliate_disclosure is not null))
);

-- 5. Intake and bookings -------------------------------------------------------
create type booking_kind as enum ('flight', 'hotel', 'rental', 'car', 'rail', 'activity');
create type inbound_status as enum ('received', 'parsed', 'needs_confirmation', 'quarantined', 'failed');

create table public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  source text not null check (source in ('email', 'screenshot')),
  provider_message_id text unique,
  sender text,
  subject text,
  storage_path text,
  status inbound_status not null default 'received',
  error text,
  received_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  inbound_message_id uuid references public.inbound_messages(id) on delete set null,
  kind booking_kind not null,
  provider text not null,
  confirmation_code text,
  booked_via text,
  passenger_names text[] not null default '{}',
  extraction_confidence numeric(3,2) not null check (extraction_confidence between 0 and 1),
  dedupe_key text not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (trip_id, dedupe_key),
  unique (id, trip_id)
);
-- Confirmation codes are readable only through booking_confirmation_code().
revoke select on public.bookings from anon, authenticated;
grant select (id, trip_id, inbound_message_id, kind, provider, booked_via, passenger_names,
              extraction_confidence, dedupe_key, confirmed_at, created_at)
  on public.bookings to authenticated;

create table public.booking_segments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  trip_id uuid not null,
  position int not null check (position >= 1),
  carrier_iata text not null check (carrier_iata ~ '^[A-Z0-9]{2}$'),
  flight_number text not null check (flight_number ~ '^[0-9]{1,4}$'),
  origin_iata text not null check (origin_iata ~ '^[A-Z]{3}$'),
  destination_iata text not null check (destination_iata ~ '^[A-Z]{3}$'),
  departure_local text not null,
  arrival_local text,
  scheduled_out timestamptz,
  scheduled_in timestamptz,
  origin_country text check (origin_country is null or origin_country ~ '^[A-Z]{2}$'),
  destination_country text check (destination_country is null or destination_country ~ '^[A-Z]{2}$'),
  distance_km int,
  fa_flight_id text,
  aeroapi_alert_id text,
  last_status jsonb,
  monitor_state text not null default 'idle' check (monitor_state in ('idle', 'monitoring', 'polling_only', 'ended')),
  foreign key (booking_id, trip_id) references public.bookings(id, trip_id) on delete cascade,
  unique (booking_id, position)
);

create table public.booking_members (
  booking_id uuid not null,
  member_id uuid not null,
  trip_id uuid not null,
  primary key (booking_id, member_id),
  foreign key (booking_id, trip_id) references public.bookings(id, trip_id) on delete cascade,
  foreign key (member_id, trip_id) references public.trip_members(id, trip_id) on delete cascade
);

create or replace function public.booking_confirmation_code(p_booking_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select b.confirmation_code
  from public.bookings b
  where b.id = p_booking_id
    and (
      public.is_trip_planner(b.trip_id)
      or exists (
        select 1 from public.booking_members bm
        join public.trip_members m on m.id = bm.member_id
        where bm.booking_id = b.id and m.user_id = auth.uid()
      )
    );
$$;

-- 6. Checks, incidents, playbooks, action items ------------------------------------
create type check_result as enum ('ok', 'action_needed', 'unknown');
create type incident_status as enum ('open', 'needs_answer', 'playbook_ready', 'resolved');

create table public.document_checks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid not null references public.trip_members(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rule_id text,
  rule_version int,
  result check_result not null,
  detail text not null,
  checked_at timestamptz not null default now()
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  segment_id uuid not null references public.booking_segments(id) on delete cascade,
  event_type text not null,
  delay_minutes int,
  dedupe_key text not null unique,
  raw_payload jsonb not null default '{}',
  affected_user_ids uuid[] not null default '{}',
  facts jsonb not null default '{}',
  pending_question jsonb,
  status incident_status not null default 'open',
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  kind text not null check (kind in ('detected', 'question_asked', 'answered', 'playbook_generated', 'playbook_edited', 'notified', 'resolved')),
  actor_user_id uuid references public.profiles(id),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.playbooks (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  content jsonb not null,
  rules_cited jsonb not null,
  model text not null,
  citation_check_passed boolean not null,
  created_at timestamptz not null default now()
);

create table public.action_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  kind text not null check (kind in ('approval', 'payment', 'document', 'checklist', 'assist', 'booking', 'media')),
  title text not null,
  detail text not null,
  assigned_user_ids uuid[] not null default '{}',
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'snoozed', 'done')),
  source_kind text not null check (source_kind in ('document_check', 'incident', 'booking_confirmation', 'passenger_match', 'inbound_quarantine', 'flight_not_found')),
  related_entity_id uuid,
  created_at timestamptz not null default now(),
  unique (trip_id, source_kind, related_entity_id, title)
);

-- 7. Votes and money ------------------------------------------------------------
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  incident_id uuid references public.incidents(id) on delete set null,
  title text not null,
  detail text not null,
  required_user_ids uuid[] not null default '{}',
  deadline timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.vote_options (
  id uuid primary key default gen_random_uuid(),
  vote_id uuid not null references public.votes(id) on delete cascade,
  label text not null,
  note text,
  position int not null
);

create table public.vote_responses (
  vote_id uuid not null references public.votes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_id uuid not null references public.vote_options(id) on delete cascade,
  responded_at timestamptz not null default now(),
  primary key (vote_id, user_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  payer_user_id uuid not null references public.profiles(id),
  amount_cents int not null check (amount_cents > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  description text not null,
  split jsonb not null,
  incident_id uuid references public.incidents(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id),
  to_user_id uuid not null references public.profiles(id),
  amount_cents int not null check (amount_cents > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  settled_by uuid not null references public.profiles(id),
  settled_at timestamptz not null default now()
);

-- 8. Notifications, consents, passes, webhooks ------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('sms', 'email')),
  template text not null,
  subject text,
  body text not null,
  urgent boolean not null default false,
  send_after timestamptz not null default now(),
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed', 'skipped')),
  related_entity_id uuid,
  created_at timestamptz not null default now()
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('sms', 'email', 'documents')),
  policy_version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.passes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  stripe_session_id text unique,
  price_variant text not null check (price_variant in ('p9', 'p19', 'comp')),
  amount_cents int not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'comp', 'expired')),
  anonymous_id text,
  created_by uuid references public.profiles(id),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.webhook_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- 9. Payment test and attribution (service role only) ----------------------------
create table public.experiment_assignments (
  anonymous_id text not null,
  flag_key text not null,
  variant text not null,
  user_id uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (anonymous_id, flag_key)
);

create table public.funnel_telemetry_events (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null,
  user_id uuid references public.profiles(id) on delete set null,
  trip_id uuid references public.trips(id) on delete set null,
  event_name text not null check (event_name in ('rule_page_view', 'offer_click', 'trip_started', 'booking_forwarded', 'checkout_started', 'paid')),
  rule_id text,
  variant text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.attribution_touchpoints (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null,
  post_id text not null check (post_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  platform text not null check (platform in ('tiktok', 'instagram', 'youtube', 'facebook', 'pinterest', 'other')),
  landing_path text not null,
  utm jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index attribution_touchpoints_aid_idx on public.attribution_touchpoints (anonymous_id, created_at desc);
create index funnel_events_created_idx on public.funnel_telemetry_events (created_at);

create or replace function public.attribution_summary(p_since timestamptz)
returns table (post_id text, clicks bigint, forwarded_bookings bigint, paid_passes bigint)
language sql stable security definer set search_path = public as $$
  with conv as (
    select e.event_name, e.trip_id,
      (select t.post_id from public.attribution_touchpoints t
        where t.anonymous_id = e.anonymous_id and t.created_at <= e.created_at
        order by t.created_at desc limit 1) as post_id
    from public.funnel_telemetry_events e
    where e.created_at >= p_since
      and e.event_name in ('booking_forwarded', 'paid')
      and coalesce(e.variant, '') <> 'comp'
  ),
  clk as (
    select t.post_id, count(*) as clicks
    from public.attribution_touchpoints t
    where t.created_at >= p_since
    group by t.post_id
  ),
  ids as (
    select clk.post_id from clk
    union
    select conv.post_id from conv where conv.post_id is not null
  )
  select ids.post_id,
    coalesce((select clk.clicks from clk where clk.post_id = ids.post_id), 0)::bigint,
    (select count(distinct conv.trip_id) from conv where conv.post_id = ids.post_id and conv.event_name = 'booking_forwarded')::bigint,
    (select count(distinct conv.trip_id) from conv where conv.post_id = ids.post_id and conv.event_name = 'paid')::bigint
  from ids
  order by ids.post_id;
$$;
revoke execute on function public.attribution_summary(timestamptz) from public, anon, authenticated;
grant execute on function public.attribution_summary(timestamptz) to service_role;

-- 10. Row-level security ---------------------------------------------------------
alter table public.trip_members enable row level security;
alter table public.member_documents enable row level security;
alter table public.travel_admin_partner_routes enable row level security;
alter table public.inbound_messages enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_segments enable row level security;
alter table public.booking_members enable row level security;
alter table public.document_checks enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_events enable row level security;
alter table public.playbooks enable row level security;
alter table public.action_items enable row level security;
alter table public.votes enable row level security;
alter table public.vote_options enable row level security;
alter table public.vote_responses enable row level security;
alter table public.expenses enable row level security;
alter table public.settlements enable row level security;
alter table public.notifications enable row level security;
alter table public.consents enable row level security;
alter table public.passes enable row level security;
alter table public.webhook_events enable row level security;
alter table public.experiment_assignments enable row level security;
alter table public.funnel_telemetry_events enable row level security;
alter table public.attribution_touchpoints enable row level security;

create policy "Members read trips" on public.trips for select using (public.is_trip_member(id));
create policy "Planners update trips" on public.trips for update
  using (public.is_trip_planner(id)) with check (public.is_trip_planner(id));

create policy "Members read members" on public.trip_members for select using (public.is_trip_member(trip_id));
create policy "Members edit themselves" on public.trip_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Members leave" on public.trip_members for delete using (user_id = auth.uid() and role = 'member');

create policy "Owners manage documents" on public.member_documents for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Anyone reads active routes" on public.travel_admin_partner_routes for select using (is_active);

create policy "Planners read inbound" on public.inbound_messages for select using (public.is_trip_planner(trip_id));

create policy "Members read bookings" on public.bookings for select using (public.is_trip_member(trip_id));
create policy "Planners update bookings" on public.bookings for update
  using (public.is_trip_planner(trip_id)) with check (public.is_trip_planner(trip_id));

create policy "Members read segments" on public.booking_segments for select using (public.is_trip_member(trip_id));

create policy "Members read booking members" on public.booking_members for select using (public.is_trip_member(trip_id));
create policy "Planner or self assigns bookings" on public.booking_members for insert with check (
  public.is_trip_planner(trip_id)
  or exists (select 1 from public.trip_members m where m.id = member_id and m.trip_id = booking_members.trip_id and m.user_id = auth.uid())
);
create policy "Planner or self unassigns bookings" on public.booking_members for delete using (
  public.is_trip_planner(trip_id)
  or exists (select 1 from public.trip_members m where m.id = member_id and m.user_id = auth.uid())
);

create policy "Planner or self reads checks" on public.document_checks for select
  using (public.is_trip_planner(trip_id) or user_id = auth.uid());

create policy "Affected or planner reads incidents" on public.incidents for select
  using (public.is_trip_planner(trip_id) or auth.uid() = any (affected_user_ids));
create policy "Readers of the incident read its events" on public.incident_events for select using (
  exists (select 1 from public.incidents i where i.id = incident_id
          and (public.is_trip_planner(i.trip_id) or auth.uid() = any (i.affected_user_ids)))
);
create policy "Readers of the incident read its playbooks" on public.playbooks for select using (
  exists (select 1 from public.incidents i where i.id = incident_id
          and (public.is_trip_planner(i.trip_id) or auth.uid() = any (i.affected_user_ids)))
);

create policy "Assignees or planner read action items" on public.action_items for select
  using (public.is_trip_planner(trip_id) or auth.uid() = any (assigned_user_ids));
create policy "Assignees or planner update action items" on public.action_items for update
  using (public.is_trip_planner(trip_id) or auth.uid() = any (assigned_user_ids))
  with check (public.is_trip_planner(trip_id) or auth.uid() = any (assigned_user_ids));

create policy "Members read votes" on public.votes for select using (public.is_trip_member(trip_id));
create policy "Members create votes" on public.votes for insert
  with check (public.is_trip_member(trip_id) and created_by = auth.uid());
create policy "Creator or planner updates votes" on public.votes for update
  using (created_by = auth.uid() or public.is_trip_planner(trip_id))
  with check (created_by = auth.uid() or public.is_trip_planner(trip_id));
create policy "Members read vote options" on public.vote_options for select using (
  exists (select 1 from public.votes v where v.id = vote_id and public.is_trip_member(v.trip_id))
);
create policy "Vote creator adds options" on public.vote_options for insert with check (
  exists (select 1 from public.votes v where v.id = vote_id and (v.created_by = auth.uid() or public.is_trip_planner(v.trip_id)))
);
create policy "Members read responses" on public.vote_responses for select using (
  exists (select 1 from public.votes v where v.id = vote_id and public.is_trip_member(v.trip_id))
);
create policy "Members respond to open votes" on public.vote_responses for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.votes v where v.id = vote_id and v.status = 'open' and public.is_trip_member(v.trip_id))
);
create policy "Members change their open-vote response" on public.vote_responses for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.votes v where v.id = vote_id and v.status = 'open' and public.is_trip_member(v.trip_id))
  );

create policy "Members read expenses" on public.expenses for select using (public.is_trip_member(trip_id));
create policy "Members add expenses" on public.expenses for insert
  with check (public.is_trip_member(trip_id) and created_by = auth.uid());
create policy "Creator or planner deletes expenses" on public.expenses for delete
  using (created_by = auth.uid() or public.is_trip_planner(trip_id));

create policy "Members read settlements" on public.settlements for select using (public.is_trip_member(trip_id));
create policy "Parties or planner record settlements" on public.settlements for insert with check (
  public.is_trip_member(trip_id) and settled_by = auth.uid()
  and (from_user_id = auth.uid() or to_user_id = auth.uid() or public.is_trip_planner(trip_id))
);

create policy "Users read their notifications" on public.notifications for select using (user_id = auth.uid());

create policy "Users read their consents" on public.consents for select using (user_id = auth.uid());
create policy "Users grant consents" on public.consents for insert with check (user_id = auth.uid());
create policy "Users revoke consents" on public.consents for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Members read passes" on public.passes for select using (public.is_trip_member(trip_id));
-- webhook_events, experiment_assignments, funnel_telemetry_events, attribution_touchpoints:
-- RLS on with no policies, so only the service role reads or writes them.
```

- [ ] **Step 6: Rewrite the seed**

`supabase/seed.sql`. Replace the whole file:
```sql
-- Official routes are always shown. Affiliate fallbacks stay null until each program
-- approves us; the founder fills affiliate_label, affiliate_url, and affiliate_disclosure then.
insert into public.travel_admin_partner_routes
  (kind, official_label, official_url, official_note, routine_processing_days, expedited_processing_days, processing_source_url)
values
  ('passport', 'Renew online with the U.S. State Department',
   'https://travel.state.gov/content/travel/en/passports/have-passport/renew-online.html',
   'For adults 25 and older renewing a 10-year passport. Routine takes 6–8 weeks; expedited takes 2–3 weeks.',
   56, 21, 'https://travel.state.gov/content/travel/en/passports/how-apply/processing-times.html'),
  ('real_id', 'Check your state’s REAL ID requirements', 'https://www.tsa.gov/real-id', null, null, null, null),
  ('global_entry', 'Apply through CBP Trusted Traveler Programs', 'https://ttp.dhs.gov/', null, null, null, null),
  ('tsa_precheck', 'Enroll with a TSA PreCheck enrollment provider', 'https://www.tsa.gov/precheck', null, null, null, null)
on conflict (kind) do nothing;
```

- [ ] **Step 7: Run the schema tests to verify they pass**

```bash
cd apps/web && npx vitest run test/db/schema.test.ts; cd ../..
```
Expected: PASS, 13 tests.

- [ ] **Step 8: Check that the seeded official URLs resolve**

```bash
for u in https://travel.state.gov/content/travel/en/passports/have-passport/renew-online.html \
         https://travel.state.gov/content/travel/en/passports/how-apply/processing-times.html \
         https://www.tsa.gov/real-id https://ttp.dhs.gov/ https://www.tsa.gov/precheck; do
  printf '%s ' "$u"; curl -s -o /dev/null -L -w '%{http_code}\n' "$u"; done
```
Expected: `200` for each. If a URL has moved, replace it in `seed.sql` with the page the redirect chain ends on, then rerun Step 7.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/00012_group_trip_assist.sql supabase/seed.sql apps/web/test/db apps/web/package.json package-lock.json
git commit -F - <<'EOF'
Restructure the schema for group-trip Assist in one migration

Drops the parked booking, financing, preview, and assist tables and adds
membership, intake, segments, document checks, incidents, playbooks,
votes, expenses, passes, and the payment-test tables, all under RLS. The
schema is tested against PGlite with a minimal Supabase auth shim.
Travel-admin routes now hold the free official route per document kind,
with an optional affiliate fallback.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 3: Supabase clients, the proxy, and the anonymous visitor ID

**Files:**
- Create: `apps/web/lib/supabase/server.ts`, `apps/web/lib/supabase/admin.ts`, `apps/web/lib/supabase/proxy.ts`, `apps/web/lib/funnel/anonymous-id.ts`, `apps/web/lib/auth/user.ts`, `apps/web/lib/auth/safe-next.ts`, `apps/web/proxy.ts`, `apps/web/test/anonymous-id.test.ts`, `apps/web/test/safe-next.test.ts`
- Modify: `apps/web/package.json` (dependencies `@supabase/ssr`, `@supabase/supabase-js`)

**Interfaces:**
- Produces:
  - **Supabase clients:**
    - `createClient(): Promise<SupabaseClient>` (session-scoped, `lib/supabase/server.ts`)
    - `createAdminClient(): SupabaseClient` (service role)
    - `updateSession(request: NextRequest): Promise<NextResponse>`
  - **Anonymous visitor ID:**
    - `ANONYMOUS_ID_COOKIE = 'elsewhere_aid'`
    - `isAnonymousId(v): v is string`
    - `newAnonymousId(): string`
    - `assignAnonymousId(request): string | null`
    - `persistAnonymousId(response, id | null): void`
  - **Auth:**
    - `getCurrentUser(): Promise<CurrentUser | null>`
    - `requireUser(next: string): Promise<CurrentUser>`, where `CurrentUser = { id; email: string | null; phone: string | null }`
    - `safeNext(value, fallback = '/trips'): string`

- [ ] **Step 1: Add the Supabase packages**

```bash
npm install @supabase/ssr@0.12.7 @supabase/supabase-js@^2.117.2 -w @elsewhere/web
```

- [ ] **Step 2: Write the failing tests**

`apps/web/test/anonymous-id.test.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_ID_COOKIE,
  assignAnonymousId,
  isAnonymousId,
  newAnonymousId,
  persistAnonymousId,
} from '@/lib/funnel/anonymous-id';

describe('anonymous id', () => {
  it('generates 32 lowercase hex characters', () => {
    const id = newAnonymousId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(isAnonymousId(id)).toBe(true);
  });

  it('rejects malformed values', () => {
    expect(isAnonymousId(undefined)).toBe(false);
    expect(isAnonymousId('abc')).toBe(false);
    expect(isAnonymousId('Z'.repeat(32))).toBe(false);
  });

  it('assigns a new id to a request without one and persists it on the response', () => {
    const request = new NextRequest('https://example.test/rules');
    const id = assignAnonymousId(request);
    expect(id).not.toBeNull();
    expect(request.cookies.get(ANONYMOUS_ID_COOKIE)?.value).toBe(id);
    const response = NextResponse.next();
    persistAnonymousId(response, id);
    expect(response.cookies.get(ANONYMOUS_ID_COOKIE)?.value).toBe(id);
  });

  it('keeps an existing valid id', () => {
    const existing = newAnonymousId();
    const request = new NextRequest('https://example.test/rules', { headers: { cookie: `${ANONYMOUS_ID_COOKIE}=${existing}` } });
    expect(assignAnonymousId(request)).toBeNull();
    expect(request.cookies.get(ANONYMOUS_ID_COOKIE)?.value).toBe(existing);
  });
});
```

`apps/web/test/safe-next.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/auth/safe-next';

describe('safeNext', () => {
  it('keeps same-site relative paths', () => {
    expect(safeNext('/trips/new')).toBe('/trips/new');
  });

  it('falls back for absolute, protocol-relative, and backslash paths', () => {
    expect(safeNext('https://evil.test')).toBe('/trips');
    expect(safeNext('//evil.test')).toBe('/trips');
    expect(safeNext('/\\evil.test')).toBe('/trips');
    expect(safeNext(null)).toBe('/trips');
    expect(safeNext('', '/start')).toBe('/start');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/anonymous-id.test.ts test/safe-next.test.ts; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 4: Implement**

`apps/web/lib/funnel/anonymous-id.ts`:
```ts
import type { NextRequest, NextResponse } from 'next/server';

export const ANONYMOUS_ID_COOKIE = 'elsewhere_aid';
export const ANONYMOUS_ID_MAX_AGE = 60 * 60 * 24 * 365;
const PATTERN = /^[0-9a-f]{32}$/;

export function isAnonymousId(value: string | null | undefined): value is string {
  return typeof value === 'string' && PATTERN.test(value);
}

export function newAnonymousId(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

/** Sets the cookie on the incoming request so this same render already sees it. Returns the new id, or null if one existed. */
export function assignAnonymousId(request: NextRequest): string | null {
  if (isAnonymousId(request.cookies.get(ANONYMOUS_ID_COOKIE)?.value)) return null;
  const id = newAnonymousId();
  request.cookies.set(ANONYMOUS_ID_COOKIE, id);
  return id;
}

export function persistAnonymousId(response: NextResponse, id: string | null): void {
  if (!id) return;
  response.cookies.set(ANONYMOUS_ID_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ANONYMOUS_ID_MAX_AGE,
  });
}
```

`apps/web/lib/auth/safe-next.ts`:
```ts
export function safeNext(value: string | null | undefined, fallback = '/trips'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
```

`apps/web/lib/supabase/server.ts`:
```ts
import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
```

`apps/web/lib/supabase/admin.ts`:
```ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env';

/** Service role. Webhooks, workflows, and telemetry only; never pass results to a client unfiltered. */
export function createAdminClient() {
  return createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

`apps/web/lib/supabase/proxy.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Refreshes the Supabase session cookie on every matched request. */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}
```

`apps/web/lib/auth/user.ts`:
```ts
import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface CurrentUser {
  id: string;
  email: string | null;
  phone: string | null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; email?: string; phone?: string } | undefined;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: claims.email || null, phone: claims.phone || null };
}

export async function requireUser(next: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
```

`apps/web/proxy.ts`:
```ts
import type { NextRequest } from 'next/server';
import { assignAnonymousId, persistAnonymousId } from '@/lib/funnel/anonymous-id';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  const newId = assignAnonymousId(request);
  const response = await updateSession(request);
  persistAnonymousId(response, newId);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|characters/|\\.well-known/workflow/|api/webhooks/).*)',
    },
  ],
};
```

- [ ] **Step 5: Run the tests and typecheck**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit; cd ../..
```
Expected: all tests pass and tsc is clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web package.json package-lock.json
git commit -F - <<'EOF'
Add Supabase clients, the session proxy, and the visitor id

proxy.ts refreshes the Supabase session and gives every visitor a
first-party anonymous id before the page renders, so the payment test
can tie rule-page views, offer clicks, and checkouts to one visitor.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---
### Task 4: The rules library loader and page accessors

Track A must be in place first: `packages/rules` exists, and `npm run rules:build -w @elsewhere/rules` writes `packages/rules/dist/rules.json` per contract revision 8a0da4a.

**Files:**
- Create: `apps/web/lib/rules/parse-library.ts`, `apps/web/lib/rules/library.ts`, `apps/web/lib/rules/accessors.ts`, `apps/web/lib/rules/present.ts`, `apps/web/test/fixtures/rules-library.json`, `apps/web/test/rules/accessors.test.ts`, `apps/web/test/rules/parse-library.test.ts`
- Modify: `apps/web/package.json` (dependency and scripts), `apps/web/next.config.ts`

**Interfaces:**
- Consumes: from `@elsewhere/rules`, the types `RulesLibrary`, `Rule`, `RuleStatus`, `Domain`, `Source`, and `RuleSourceRef`.
- Produces:
  - **Library loading:**
    - `getLibrary(): RulesLibrary` and `LibraryLoadError`, the same as Track D's Task 2, so Track D's Step 1 keeps them
    - `parseLibrary(raw: unknown): RulesLibrary`
  - **Accessors** (`lib/rules/accessors.ts`), each taking a `RulesLibrary`:
    - `PUBLISHED_STATUSES`, `DOMAIN_ORDER`, `DOMAIN_LABELS`
    - `publishedRules(library): Rule[]`
    - `staticRuleIds(library): string[]`
    - `findRule(library, id): Rule | null`
    - `resolveRulePage(library, id): RulePageResolution`
    - `needsReviewSince(rule): string | null`
    - `sourcesFor(library, rule): { ref: RuleSourceRef; source: Source | null }[]`
    - `verifiedRulesIn(library, domain): Rule[]`
  - **Presentation** (`lib/rules/present.ts`):
    - `entitlementLines(rule): string[]`
    - `formatIsoDate(iso: string): string`
  - **Fixture:** `test/fixtures/rules-library.json`, a `RulesLibrary` with eight rules: drafts, retired, `needs_review`, and verified rules in every domain. C2's tests and e2e reuse it.

- [ ] **Step 1: Wire the package into the app**

```bash
npm install @elsewhere/rules@* -w @elsewhere/web
```

In `apps/web/package.json`, add to `scripts`. These are the same strings as Track D's plan, so its Step 2 has nothing to add:
```json
"predev": "npm run rules:build -w @elsewhere/rules",
"prebuild": "npm run rules:build -w @elsewhere/rules",
"pretypecheck": "npm run rules:build -w @elsewhere/rules"
```

`apps/web/next.config.ts`. Replace the whole file:
```ts
import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  transpilePackages: ['@elsewhere/rules'],
  // The app imports packages/rules/dist/rules.json from the monorepo root.
  turbopack: { root: path.join(__dirname, '../..') },
};

export default nextConfig;
```

- [ ] **Step 2: Write the fixture library**

`apps/web/test/fixtures/rules-library.json`:
```json
{
  "schema_version": 1,
  "library_version": "2026-10-20.0f1a2b3",
  "generated_at": "2026-10-20T12:00:00.000Z",
  "rules": [
    {
      "id": "fixture-card-trip-delay",
      "version": 1,
      "status": "verified",
      "domain": "money",
      "jurisdiction": "issuer:fixture-bank",
      "title": "Your card may cover meals and a hotel when a flight is 6+ hours late",
      "summary": "Some travel cards reimburse reasonable meals and lodging when a covered trip is delayed six hours or more, up to a limit per ticket.",
      "applies_when": { "all": [ { "fact": "event.type", "in": ["delay", "cancellation"] }, { "fact": "event.delay_minutes", "gte": 360 } ] },
      "entitlement": { "kind": "protection", "amount": { "max_usd_per_ticket": 500, "min_delay_hours": 6 }, "timing": "File within 60 days of the delay" },
      "how_to_claim": { "steps": ["Keep receipts for meals and the hotel.", "Ask the airline for written proof of the delay.", "File with the card's benefits administrator."], "templates": [] },
      "exceptions": ["The trip has to be paid with the card."],
      "sources": [ { "id": "s1", "source": "fixture-issuer-guide", "quotes": [ { "text": "Fixture quote: reimbursement for reasonable expenses when a common carrier delays travel six hours or more, up to $500 per ticket.", "supports": ["summary", "entitlement.amount"] } ] } ],
      "lead_character": "pigeon",
      "tags": ["card-benefit", "trip-delay"],
      "last_verified": "2026-10-06",
      "verified_by": "ifaemuh",
      "review_by": "2027-01-04",
      "history": [ { "version": 1, "status": "draft", "date": "2026-10-05" }, { "version": 1, "status": "verified", "date": "2026-10-06" } ]
    },
    {
      "id": "fixture-draft-rule",
      "version": 1,
      "status": "draft",
      "domain": "hotels",
      "jurisdiction": "US-FTC",
      "title": "A draft that must never be shown",
      "summary": "Draft rules stay out of every public surface.",
      "applies_when": { "all": [ { "fact": "lodging.kind", "eq": "hotel" } ] },
      "entitlement": { "kind": "protection" },
      "how_to_claim": { "steps": ["Not published."], "templates": [] },
      "exceptions": [],
      "sources": [ { "id": "s1", "source": "fixture-gov-page", "quotes": [ { "text": "Fixture quote: draft.", "supports": ["summary", "entitlement"] } ] } ],
      "lead_character": "capybara",
      "tags": [],
      "last_verified": null,
      "verified_by": null,
      "review_by": null,
      "history": [ { "version": 1, "status": "draft", "date": "2026-10-05" } ]
    },
    {
      "id": "fixture-eu261-delay-compensation",
      "version": 1,
      "status": "verified",
      "domain": "flights",
      "jurisdiction": "EU-261",
      "title": "Landed 3+ hours late on an EU flight? You may be owed up to €600",
      "summary": "Under EU261, arriving three hours or more late on a flight that left the EU, or reached it on an EU airline, can mean fixed cash compensation by distance.",
      "applies_when": {
        "all": [
          { "fact": "event.type", "in": ["delay", "cancellation"] },
          { "fact": "event.delay_minutes", "gte": 180 },
          { "any": [ { "fact": "flight.departs_eu", "eq": true }, { "all": [ { "fact": "flight.arrives_eu", "eq": true }, { "fact": "flight.carrier_is_eu", "eq": true } ] } ] }
        ]
      },
      "entitlement": { "kind": "compensation", "amount": { "eur_up_to_1500km": 250, "eur_1500_to_3500km": 400, "eur_over_3500km": 600 }, "timing": "Paid within 7 days of a valid claim" },
      "how_to_claim": { "steps": ["Write to the operating airline and ask for EU261 compensation.", "Include the flight number, date, and your arrival delay."], "templates": ["eu261_claim_letter"] },
      "exceptions": ["Extraordinary circumstances such as severe weather can remove compensation, but not the right to care."],
      "sources": [ { "id": "s1", "source": "fixture-eu-regulation", "quotes": [ { "text": "Fixture quote: passengers shall receive compensation amounting to EUR 250, EUR 400, or EUR 600 depending on distance.", "supports": ["summary", "entitlement.amount"] } ] } ],
      "lead_character": "raccoon",
      "tags": ["delay", "compensation", "eu"],
      "last_verified": "2026-10-06",
      "verified_by": "ifaemuh",
      "review_by": "2027-01-04",
      "history": [ { "version": 1, "status": "draft", "date": "2026-10-05" }, { "version": 1, "status": "verified", "date": "2026-10-06" } ]
    },
    {
      "id": "fixture-old-refund-rule",
      "version": 2,
      "status": "retired",
      "domain": "flights",
      "jurisdiction": "US-DOT",
      "title": "The old refund rule",
      "summary": "Replaced by the current refund rule.",
      "applies_when": { "all": [ { "fact": "event.type", "in": ["cancellation"] } ] },
      "entitlement": { "kind": "refund" },
      "how_to_claim": { "steps": ["See the current rule."], "templates": [] },
      "exceptions": [],
      "sources": [ { "id": "s1", "source": "fixture-regulation", "quotes": [ { "text": "Fixture quote: superseded text.", "supports": ["summary", "entitlement"] } ] } ],
      "lead_character": "pigeon",
      "tags": ["refund"],
      "last_verified": "2026-10-06",
      "verified_by": "ifaemuh",
      "review_by": "2027-01-04",
      "replaced_by": "fixture-us-refund-cancelled-flight",
      "history": [ { "version": 1, "status": "draft", "date": "2026-10-05" }, { "version": 1, "status": "verified", "date": "2026-10-06" }, { "version": 2, "status": "retired", "date": "2026-10-08", "note": "replaced by the current refund rule" } ]
    },
    {
      "id": "fixture-passport-validity-pt",
      "version": 1,
      "status": "verified",
      "domain": "documents",
      "jurisdiction": "country:PT",
      "title": "Portugal: your passport must be valid 3 months after you leave",
      "summary": "For a short stay in Portugal, a U.S. passport has to stay valid for at least three months after the date you plan to leave.",
      "applies_when": { "all": [ { "fact": "trip.destination_country", "in": ["PT"] }, { "fact": "passenger.passport_months_valid_after_return", "lt": 3 } ] },
      "entitlement": { "kind": "requirement", "amount": { "min_months_valid_after_return": 3 } },
      "how_to_claim": { "steps": ["Check the expiry date on your passport.", "Renew before the trip if it ends less than three months after you leave."], "templates": [] },
      "exceptions": [],
      "sources": [ { "id": "s1", "source": "fixture-gov-page", "quotes": [ { "text": "Fixture quote: passports must be valid for at least three months beyond your planned date of departure.", "supports": ["summary", "entitlement.amount"] } ] } ],
      "lead_character": "owl",
      "tags": ["passport", "documents"],
      "last_verified": "2026-10-06",
      "verified_by": "ifaemuh",
      "review_by": "2027-01-04",
      "history": [ { "version": 1, "status": "draft", "date": "2026-10-05" }, { "version": 1, "status": "verified", "date": "2026-10-06" } ]
    },
    {
      "id": "fixture-tarmac-delay",
      "version": 1,
      "status": "needs_review",
      "domain": "flights",
      "jurisdiction": "US-DOT",
      "title": "Stuck on the tarmac? There are time limits",
      "summary": "U.S. airlines have to let you off a plane stuck on the tarmac after a set time, and provide food and water along the way.",
      "applies_when": { "all": [ { "fact": "event.type", "in": ["tarmac_delay"] }, { "fact": "flight.touches_us", "eq": true } ] },
      "entitlement": { "kind": "care", "amount": { "domestic_hours": 3, "international_hours": 4 } },
      "how_to_claim": { "steps": ["Note the time the doors closed.", "Ask the crew about deplaning once the limit is near."], "templates": [] },
      "exceptions": ["Safety and air traffic control exceptions apply."],
      "sources": [ { "id": "s1", "source": "fixture-regulation", "quotes": [ { "text": "Fixture quote: no more than three hours for domestic flights and four hours for international flights.", "supports": ["summary", "entitlement.amount"] } ] } ],
      "lead_character": "raccoon",
      "tags": ["tarmac", "us"],
      "last_verified": "2026-10-06",
      "verified_by": "ifaemuh",
      "review_by": "2027-01-04",
      "history": [ { "version": 1, "status": "draft", "date": "2026-10-05" }, { "version": 1, "status": "verified", "date": "2026-10-06" }, { "version": 1, "status": "needs_review", "date": "2026-10-20", "note": "source amended" } ]
    },
    {
      "id": "fixture-us-real-id",
      "version": 1,
      "status": "verified",
      "domain": "documents",
      "jurisdiction": "US-TSA",
      "title": "Flying within the U.S.? Your ID has to be REAL ID",
      "summary": "For domestic flights, a state ID only works at the checkpoint if it is REAL ID compliant. A passport works too.",
      "applies_when": { "all": [ { "fact": "flight.is_domestic_us", "eq": true }, { "fact": "passenger.has_real_id", "eq": false } ] },
      "entitlement": { "kind": "requirement" },
      "how_to_claim": { "steps": ["Look for the star on your license.", "Bring your passport if your ID is not REAL ID."], "templates": [] },
      "exceptions": [],
      "sources": [ { "id": "s1", "source": "fixture-gov-page", "quotes": [ { "text": "Fixture quote: a REAL ID compliant license or another acceptable form of ID is required to fly within the United States.", "supports": ["summary", "entitlement"] } ] } ],
      "lead_character": "owl",
      "tags": ["real-id", "documents"],
      "last_verified": "2026-10-06",
      "verified_by": "ifaemuh",
      "review_by": "2027-01-04",
      "history": [ { "version": 1, "status": "draft", "date": "2026-10-05" }, { "version": 1, "status": "verified", "date": "2026-10-06" } ]
    },
    {
      "id": "fixture-us-refund-cancelled-flight",
      "version": 1,
      "status": "verified",
      "domain": "flights",
      "jurisdiction": "US-DOT",
      "title": "Cancelled flight? You're owed cash, not a voucher",
      "summary": "If a U.S. airline cancels your flight and you don't take the rebooking, it has to refund your original payment method.",
      "applies_when": { "all": [ { "fact": "event.type", "in": ["cancellation"] }, { "fact": "flight.touches_us", "eq": true }, { "fact": "passenger.accepted_alternative", "eq": false } ] },
      "entitlement": { "kind": "refund", "amount": { "basis": "full_ticket_price", "payment": "original_method" }, "timing": "7 business days for card purchases" },
      "how_to_claim": { "steps": ["Decline the rebooking or the travel credit if you don't want it.", "Ask for a refund to your original payment method, in writing."], "templates": ["airline_refund_request"] },
      "exceptions": ["Accepting the new flight or a voucher ends the refund right."],
      "sources": [ { "id": "s1", "source": "fixture-regulation", "quotes": [ { "text": "Fixture quote: a carrier must provide a prompt refund when it cancels a flight and the passenger declines the alternative.", "supports": ["summary", "entitlement.amount", "entitlement.timing"] } ] } ],
      "lead_character": "pigeon",
      "tags": ["cancellation", "refund", "us"],
      "last_verified": "2026-10-06",
      "verified_by": "ifaemuh",
      "review_by": "2027-01-04",
      "history": [ { "version": 1, "status": "draft", "date": "2026-10-05" }, { "version": 1, "status": "verified", "date": "2026-10-06" } ]
    }
  ],
  "sources": {
    "fixture-eu-regulation": { "key": "fixture-eu-regulation", "url": "https://example.test/eu-261", "kind": "regulation", "detector": { "changedetection": { "watch_uuid": "00000000-0000-4000-8000-0000000000e1" } } },
    "fixture-gov-page": { "key": "fixture-gov-page", "url": "https://example.test/passports", "kind": "government_page", "detector": { "changedetection": { "watch_uuid": "00000000-0000-4000-8000-0000000000e2" } } },
    "fixture-issuer-guide": { "key": "fixture-issuer-guide", "url": "https://example.test/card-benefits.pdf", "kind": "issuer_benefit_guide", "detector": { "changedetection": { "watch_uuid": "00000000-0000-4000-8000-0000000000e3" } } },
    "fixture-regulation": { "key": "fixture-regulation", "url": "https://example.test/14-cfr-260", "kind": "regulation", "detector": { "ecfr": { "title": 14, "part": 260 } } }
  },
  "changes": [
    { "rule_id": "fixture-tarmac-delay", "from_version": 1, "to_version": 1, "from_status": "verified", "to_status": "needs_review", "date": "2026-10-20" },
    { "rule_id": "fixture-old-refund-rule", "from_version": 1, "to_version": 2, "from_status": "verified", "to_status": "retired", "date": "2026-10-08" },
    { "rule_id": "fixture-card-trip-delay", "from_version": 1, "to_version": 1, "from_status": "draft", "to_status": "verified", "date": "2026-10-06" }
  ]
}
```

- [ ] **Step 3: Write the failing tests**

`apps/web/test/rules/parse-library.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { LibraryLoadError, parseLibrary } from '@/lib/rules/parse-library';

describe('parseLibrary', () => {
  it('accepts a schema_version 1 library', () => {
    expect(parseLibrary(fixture).rules).toHaveLength(8);
  });

  it('rejects other schema versions', () => {
    expect(() => parseLibrary({ ...fixture, schema_version: 2 })).toThrow(LibraryLoadError);
  });
});
```

`apps/web/test/rules/accessors.test.ts`:
```ts
import type { RulesLibrary } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import {
  findRule,
  needsReviewSince,
  publishedRules,
  resolveRulePage,
  sourcesFor,
  staticRuleIds,
  verifiedRulesIn,
} from '@/lib/rules/accessors';
import { entitlementLines, formatIsoDate } from '@/lib/rules/present';

const library = fixture as unknown as RulesLibrary;

describe('publishedRules', () => {
  it('shows verified and needs_review rules, ordered by domain then title', () => {
    expect(publishedRules(library).map((r) => r.id)).toEqual([
      'fixture-us-refund-cancelled-flight',
      'fixture-eu261-delay-compensation',
      'fixture-tarmac-delay',
      'fixture-us-real-id',
      'fixture-passport-validity-pt',
      'fixture-card-trip-delay',
    ]);
  });

  it('prerenders every rule except drafts', () => {
    expect(staticRuleIds(library)).not.toContain('fixture-draft-rule');
    expect(staticRuleIds(library)).toContain('fixture-old-refund-rule');
  });
});

describe('resolveRulePage', () => {
  it('treats drafts and unknown ids the same', () => {
    expect(resolveRulePage(library, 'fixture-draft-rule')).toEqual({ kind: 'missing' });
    expect(resolveRulePage(library, 'nope')).toEqual({ kind: 'missing' });
  });

  it('redirects a retired rule to its published replacement', () => {
    expect(resolveRulePage(library, 'fixture-old-refund-rule')).toEqual({ kind: 'redirect', to: '/rules/fixture-us-refund-cancelled-flight' });
  });

  it('serves needs_review rules', () => {
    expect(resolveRulePage(library, 'fixture-tarmac-delay').kind).toBe('page');
  });
});

describe('needsReviewSince', () => {
  it('returns the start of the current needs_review run', () => {
    expect(needsReviewSince(findRule(library, 'fixture-tarmac-delay')!)).toBe('2026-10-20');
    expect(needsReviewSince(findRule(library, 'fixture-us-real-id')!)).toBeNull();
  });
});

describe('sourcesFor and verifiedRulesIn', () => {
  it('resolves source URLs from the library', () => {
    const [entry] = sourcesFor(library, findRule(library, 'fixture-us-refund-cancelled-flight')!);
    expect(entry.source?.url).toBe('https://example.test/14-cfr-260');
  });

  it('filters verified rules by domain', () => {
    expect(verifiedRulesIn(library, 'money').map((r) => r.id)).toEqual(['fixture-card-trip-delay']);
  });
});

describe('present', () => {
  it('formats entitlement amounts and dates for people', () => {
    expect(entitlementLines(findRule(library, 'fixture-card-trip-delay')!)).toEqual(['Max usd per ticket: 500', 'Min delay hours: 6']);
    expect(formatIsoDate('2026-10-20')).toBe('Oct 20, 2026');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/rules; cd ../..
```
Expected: FAIL, with `@/lib/rules/parse-library` and `@/lib/rules/accessors` not found.

- [ ] **Step 5: Implement the loader, accessors, and presenters**

`apps/web/lib/rules/parse-library.ts`, the same as Track D's plan:
```ts
import type { RulesLibrary } from '@elsewhere/rules/core';

export class LibraryLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryLoadError';
  }
}

export const SUPPORTED_SCHEMA_VERSION = 1;

export function parseLibrary(raw: unknown): RulesLibrary {
  if (typeof raw !== 'object' || raw === null) {
    throw new LibraryLoadError('rules.json is not an object');
  }
  const lib = raw as Partial<RulesLibrary>;
  if (lib.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new LibraryLoadError(`Unsupported schema_version ${String(lib.schema_version)}`);
  }
  if (typeof lib.library_version !== 'string' || !Array.isArray(lib.rules) || !Array.isArray(lib.changes)) {
    throw new LibraryLoadError('rules.json is missing library_version, rules, or changes');
  }
  return { ...lib, sources: lib.sources ?? {} } as RulesLibrary;
}
```

`apps/web/lib/rules/library.ts`, the same as Track D's plan:
```ts
import type { RulesLibrary } from '@elsewhere/rules/core';
import raw from '../../../../packages/rules/dist/rules.json';
import { parseLibrary } from './parse-library';

export { LibraryLoadError } from './parse-library';

let cached: RulesLibrary | null = null;

/** The rules library baked into this deployment. Changes only by deploying. */
export function getLibrary(): RulesLibrary {
  cached ??= parseLibrary(raw);
  return cached;
}
```

`apps/web/lib/rules/accessors.ts`:
```ts
import type { Domain, Rule, RuleSourceRef, RuleStatus, RulesLibrary, Source } from '@elsewhere/rules/core';

export const PUBLISHED_STATUSES: readonly RuleStatus[] = ['verified', 'needs_review'];
export const DOMAIN_ORDER: readonly Domain[] = ['flights', 'documents', 'money', 'hotels'];
export const DOMAIN_LABELS: Record<Domain, string> = {
  flights: 'Flights',
  documents: 'Documents',
  money: 'Money and perks',
  hotels: 'Hotels and booking',
};

export type RulePageResolution =
  | { kind: 'page'; rule: Rule }
  | { kind: 'redirect'; to: string }
  | { kind: 'gone' }
  | { kind: 'missing' };

const isPublished = (rule: Rule) => PUBLISHED_STATUSES.includes(rule.status);

export function publishedRules(library: RulesLibrary): Rule[] {
  return library.rules
    .filter(isPublished)
    .sort((a, b) => DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain) || a.title.localeCompare(b.title));
}

/** Retired rules are prerendered too, so their URLs redirect or explain instead of 404ing. */
export function staticRuleIds(library: RulesLibrary): string[] {
  return library.rules.filter((rule) => rule.status !== 'draft').map((rule) => rule.id);
}

export function findRule(library: RulesLibrary, id: string): Rule | null {
  return library.rules.find((rule) => rule.id === id) ?? null;
}

export function resolveRulePage(library: RulesLibrary, id: string): RulePageResolution {
  const rule = findRule(library, id);
  if (!rule || rule.status === 'draft') return { kind: 'missing' };
  if (rule.status === 'retired') {
    const replacement = rule.replaced_by ? findRule(library, rule.replaced_by) : null;
    return replacement && isPublished(replacement) ? { kind: 'redirect', to: `/rules/${replacement.id}` } : { kind: 'gone' };
  }
  return { kind: 'page', rule };
}

export function needsReviewSince(rule: Rule): string | null {
  if (rule.status !== 'needs_review') return null;
  let since: string | null = null;
  for (const entry of rule.history) {
    since = entry.status === 'needs_review' ? (since ?? entry.date) : null;
  }
  return since;
}

export function sourcesFor(library: RulesLibrary, rule: Rule): { ref: RuleSourceRef; source: Source | null }[] {
  return rule.sources.map((ref) => ({ ref, source: library.sources[ref.source] ?? null }));
}

export function verifiedRulesIn(library: RulesLibrary, domain: Domain): Rule[] {
  return library.rules.filter((rule) => rule.status === 'verified' && rule.domain === domain);
}
```

`apps/web/lib/rules/present.ts`:
```ts
import type { Rule } from '@elsewhere/rules/core';

export function humanizeKey(key: string): string {
  const words = key.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function entitlementLines(rule: Rule): string[] {
  return Object.entries(rule.entitlement.amount ?? {}).map(
    ([key, value]) => `${humanizeKey(key)}: ${Array.isArray(value) ? value.join(', ') : String(value)}`,
  );
}

export function formatIsoDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );
}
```

- [ ] **Step 6: Run the tests, typecheck, and build**

```bash
cd apps/web && npx vitest run && npm run typecheck && npm run build; cd ../..
```
Expected: all tests pass. `pretypecheck` and `prebuild` run `rules:build` first, so `packages/rules/dist/rules.json` exists before tsc and Next read it.

- [ ] **Step 7: Commit**

```bash
git add apps/web package.json package-lock.json
git commit -F - <<'EOF'
Load the rules library into the app with page accessors

getLibrary() reads the deployment's dist/rules.json, the same loader
Track D builds on. Accessors decide what is public: drafts never are,
retired rules redirect to their replacement, and needs_review rules
report when the re-check started.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 5: The cast in the app — assets, `Character`, and the landing page

The interim art comes from the approved A++ mockups. Task 13 swaps in foundry's cast-bible exports.

**Files:**
- Create: `apps/web/scripts/cut-characters.py`, `apps/web/public/characters/{capybara,owl,raccoon,pigeon}.png`, `apps/web/public/characters/{capybara,owl,raccoon,pigeon}-avatar.png`, `apps/web/public/characters/scenes/raccoon-gate.png`, `apps/web/lib/characters.ts`, `apps/web/components/character.tsx`, `apps/web/lib/og/assets.ts`, `apps/web/lib/og/frame.tsx`, `apps/web/app/opengraph-image.tsx`, `apps/web/test/characters.test.ts`
- Modify: `apps/web/app/page.tsx`, `apps/web/next.config.ts`

**Interfaces:**
- Consumes: the `Character` type from `@elsewhere/rules`. App code imports only types and pure functions from the package; Track A warns that `loadRules` must never run inside the Next bundle. The test file may import `CHARACTERS` at runtime.
- Produces:
  - **Character data:**
    - `CHARACTER_INFO: Record<Character, { name: string; role: string }>`
    - `CHARACTER_NAMES: Character[]`
    - `CHARACTER_DIMENSIONS`
    - `characterSrc(character, variant?: 'portrait' | 'avatar'): string`
  - **React component:** `<Character character width variant? decorative? className? priority? />`
  - **OG helpers:**
    - `characterDataUrl(character, variant?): Promise<string>`, for `next/og`
    - `<OgFrame characterSrc eyebrow title footer? />`

- [ ] **Step 1: Write the failing test**

`apps/web/test/characters.test.ts`:
```ts
import { CHARACTERS } from '@elsewhere/rules/core';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHARACTER_INFO, CHARACTER_NAMES, characterSrc } from '@/lib/characters';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

describe('characters', () => {
  it('names every character in the contract', () => {
    expect(Object.keys(CHARACTER_INFO).sort()).toEqual([...CHARACTERS].sort());
    expect([...CHARACTER_NAMES].sort()).toEqual([...CHARACTERS].sort());
  });

  it('points at a portrait and an avatar that exist on disk', () => {
    for (const character of CHARACTERS) {
      expect(existsSync(path.join(publicDir, characterSrc(character)))).toBe(true);
      expect(existsSync(path.join(publicDir, characterSrc(character, 'avatar')))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web && npx vitest run test/characters.test.ts; cd ../..
```
Expected: FAIL, with `@/lib/characters` not found.

- [ ] **Step 3: Write the cutter and generate the interim assets**

`apps/web/scripts/cut-characters.py`:
```python
"""Cut the cast into web assets for apps/web/public/characters.

Interim source (Task 5): the approved A++ lineup mockup.
  python3 scripts/cut-characters.py lineup /Users/eapha/Github/elsewhere/.superpowers/brainstorm/18616-1790897391/content/a-plusplus.png
Cast-bible source (Task 13): one PNG per character named <character>.png.
  python3 scripts/cut-characters.py portraits ~/Github/foundry/accounts/go-elsewhere/sheets

Writes <name>.png (640x960, transparent, feet on a shared baseline) and <name>-avatar.png (256x256).
"""
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

NAMES = ["capybara", "owl", "raccoon", "pigeon"]
# Measured on the 2528x1696 lineup with a column scan on 2026-10-01.
LINEUP_BOXES = {
    "capybara": (40, 350, 716, 1414),
    "owl": (690, 474, 1246, 1416),
    "raccoon": (1214, 374, 1820, 1434),
    "pigeon": (1808, 374, 2494, 1434),
}
OUT = Path(__file__).resolve().parent.parent / "public" / "characters"
PORTRAIT = (640, 960)
AVATAR = 256


def keep_largest_component(img: Image.Image) -> Image.Image:
    """Drops slivers of neighbouring characters that fall inside a crop box."""
    w, h = img.size
    alpha = img.getchannel("A").load()
    seen = bytearray(w * h)
    best: list[tuple[int, int]] = []
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            if alpha[x, y] == 0 or seen[y * w + x]:
                continue
            component = []
            queue = deque([(x, y)])
            seen[y * w + x] = 1
            while queue:
                cx, cy = queue.popleft()
                component.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and alpha[nx, ny]:
                        seen[ny * w + nx] = 1
                        queue.append((nx, ny))
            if len(component) > len(best):
                best = component
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for x, y in best:
        mp[x, y] = 255
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out.crop(out.getbbox())


def remove_background(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if img.getpixel(seed)[3] != 0:
            ImageDraw.floodfill(img, seed, (0, 0, 0, 0), thresh=40)
    return keep_largest_component(img)


def fit_portrait(img: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", PORTRAIT, (0, 0, 0, 0))
    scale = min((PORTRAIT[0] - 40) / img.width, (PORTRAIT[1] - 40) / img.height)
    resized = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(resized, ((PORTRAIT[0] - resized.width) // 2, PORTRAIT[1] - 20 - resized.height))
    return canvas


def avatar(img: Image.Image) -> Image.Image:
    side = round(img.width * 0.78)
    left = (img.width - side) // 2
    return img.crop((left, 0, left + side, side)).resize((AVATAR, AVATAR), Image.LANCZOS)


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in ("lineup", "portraits"):
        raise SystemExit("usage: cut-characters.py lineup <lineup.png> | portraits <dir>")
    mode, src = sys.argv[1], Path(sys.argv[2]).expanduser()
    OUT.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        raw = Image.open(src).crop(LINEUP_BOXES[name]) if mode == "lineup" else Image.open(src / f"{name}.png")
        cut = remove_background(raw)
        fit_portrait(cut).save(OUT / f"{name}.png", optimize=True)
        avatar(cut).save(OUT / f"{name}-avatar.png", optimize=True)
        print(f"{name}: cut {cut.width}x{cut.height} -> public/characters/{name}.png")


if __name__ == "__main__":
    main()
```

Run:
```bash
cd apps/web
python3 scripts/cut-characters.py lineup /Users/eapha/Github/elsewhere/.superpowers/brainstorm/18616-1790897391/content/a-plusplus.png
mkdir -p public/characters/scenes
python3 - <<'EOF'
from PIL import Image
src = Image.open('/Users/eapha/Github/elsewhere/.superpowers/brainstorm/18616-1790897391/content/cover-raccoon.png').convert('RGB')
w, h = src.size
# The mockup's top 36% is empty space reserved for headline text; the scene is the rest.
src.crop((0, int(h * 0.36), w, h)).resize((1200, round((h * 0.64) * 1200 / w))).save('public/characters/scenes/raccoon-gate.png', optimize=True)
print('scene saved')
EOF
cd ../..
```
Expected: four "cut" lines and "scene saved".

Then check the output by eye. Use the Read tool on `apps/web/public/characters/owl.png` and `apps/web/public/characters/pigeon-avatar.png`. You should see:
- a single character, with no sliver of a neighbour
- a transparent background
- an avatar that shows the head

If a crop clips a character, widen its box in `LINEUP_BOXES` by 10–20px and rerun.

- [ ] **Step 4: Write the character module and component**

`apps/web/lib/characters.ts`:
```ts
import type { Character } from '@elsewhere/rules/core';

export const CHARACTER_INFO: Record<Character, { name: string; role: string }> = {
  capybara: { name: 'Capybara', role: 'the unbothered one' },
  owl: { name: 'Owl', role: 'the planner' },
  raccoon: { name: 'Raccoon', role: 'the chaos one' },
  pigeon: { name: 'Pigeon', role: 'the deal hunter' },
};

/** Runtime list of the cast. The test pins it to the contract's CHARACTERS. */
export const CHARACTER_NAMES = Object.keys(CHARACTER_INFO) as Character[];

export type CharacterVariant = 'portrait' | 'avatar';

export const CHARACTER_DIMENSIONS: Record<CharacterVariant, { width: number; height: number }> = {
  portrait: { width: 640, height: 960 },
  avatar: { width: 256, height: 256 },
};

export function characterSrc(character: Character, variant: CharacterVariant = 'portrait'): string {
  return variant === 'avatar' ? `/characters/${character}-avatar.png` : `/characters/${character}.png`;
}
```

`apps/web/components/character.tsx`:
```tsx
import Image from 'next/image';
import type { Character as CharacterName } from '@elsewhere/rules/core';
import { CHARACTER_DIMENSIONS, CHARACTER_INFO, characterSrc, type CharacterVariant } from '@/lib/characters';
import { cn } from '@/lib/utils';

/**
 * Full art on public surfaces, small at moments in the app. Never use it in forms,
 * booking lists, or the money ledger.
 */
export function Character({
  character,
  width,
  variant = 'portrait',
  decorative = true,
  className,
  priority,
}: {
  character: CharacterName;
  width: number;
  variant?: CharacterVariant;
  decorative?: boolean;
  className?: string;
  priority?: boolean;
}) {
  const dims = CHARACTER_DIMENSIONS[variant];
  const info = CHARACTER_INFO[character];
  return (
    <Image
      src={characterSrc(character, variant)}
      width={width}
      height={Math.round((width * dims.height) / dims.width)}
      alt={decorative ? '' : `${info.name}, ${info.role}`}
      aria-hidden={decorative || undefined}
      priority={priority}
      className={cn('select-none', variant === 'avatar' && 'rounded-full bg-[#efe9da]', className)}
    />
  );
}
```

- [ ] **Step 5: Write the OG helpers and the landing OG image**

`apps/web/lib/og/assets.ts`:
```ts
import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Character } from '@elsewhere/rules/core';
import { characterSrc, type CharacterVariant } from '@/lib/characters';

/** next/og cannot fetch relative URLs, so character art is inlined as a data URL. */
export async function characterDataUrl(character: Character, variant: CharacterVariant = 'portrait'): Promise<string> {
  const file = path.join(process.cwd(), 'public', characterSrc(character, variant));
  return `data:image/png;base64,${await readFile(file, 'base64')}`;
}
```

`apps/web/lib/og/frame.tsx`:
```tsx
/** Layout for 1200x630 link previews. Satori supports flexbox only, so every multi-child div sets display: flex. */
export function OgFrame({ characterSrc, eyebrow, title, footer }: { characterSrc: string; eyebrow: string; title: string; footer?: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', background: '#faf8f1', padding: 56 }}>
      <img src={characterSrc} width={300} height={450} style={{ objectFit: 'contain' }} />
      <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 48, flex: 1 }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 2, color: '#b4532a' }}>{eyebrow.toUpperCase()}</div>
        <div style={{ fontSize: title.length > 70 ? 50 : 62, fontWeight: 800, lineHeight: 1.1, marginTop: 16, color: '#2f3a2c' }}>{title}</div>
        {footer ? <div style={{ fontSize: 28, marginTop: 24, color: '#4b5745' }}>{footer}</div> : null}
      </div>
    </div>
  );
}
```

`apps/web/app/opengraph-image.tsx`:
```tsx
import { ImageResponse } from 'next/og';
import { CHARACTER_NAMES } from '@/lib/characters';
import { characterDataUrl } from '@/lib/og/assets';

export const alt = 'Elsewhere — your group trip, watched';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const portraits = await Promise.all(CHARACTER_NAMES.map((character) => characterDataUrl(character)));
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#faf8f1', padding: 48 }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 2, color: '#b4532a' }}>ELSEWHERE</div>
        <div style={{ fontSize: 58, fontWeight: 800, color: '#2f3a2c', marginTop: 8 }}>Your group trip, watched.</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', marginTop: 'auto' }}>
          {portraits.map((src) => (
            <img key={src.slice(-24)} src={src} width={240} height={360} style={{ objectFit: 'contain' }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
```

Add file tracing to `apps/web/next.config.ts`, so OG routes that render at request time can read the PNGs. Replace the whole file:
```ts
import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  transpilePackages: ['@elsewhere/rules'],
  // The app imports packages/rules/dist/rules.json from the monorepo root.
  turbopack: { root: path.join(__dirname, '../..') },
  // next/og routes read character art from disk.
  outputFileTracingIncludes: { '/**': ['./public/characters/**/*'] },
};

export default nextConfig;
```

- [ ] **Step 6: Put the cast on the landing page**

In `apps/web/app/page.tsx`, add the imports and two sections. The hero gets the raccoon-at-the-gate scene. A "Meet the group" row goes below the steps.

Add the imports at the top:
```tsx
import Image from 'next/image';
import { Character } from '@/components/character';
import { CHARACTER_INFO, CHARACTER_NAMES } from '@/lib/characters';
```

Wrap the existing hero copy and the scene in a two-column grid. Replace the opening `<main ...>` through the closing `</div>` of the buttons with:
```tsx
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-[#b4532a]">Elsewhere</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Your group trip, watched. When it goes sideways, the right people know what they’re owed.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-[#4b5745]">
            We read the rules so you don’t have to: refunds, delays, passports, and the fine print — every answer cited.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/start">Start a trip</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/rules">Browse the rules</Link>
            </Button>
          </div>
        </div>
        <Image
          src="/characters/scenes/raccoon-gate.png"
          alt="The raccoon at a departure gate, panicking over a cancelled flight"
          width={1200}
          height={720}
          priority
          className="w-full rounded-2xl"
        />
      </div>
```

After the closing `</ol>` of the steps, add:
```tsx
      <section aria-labelledby="cast-heading" className="mt-16">
        <h2 id="cast-heading" className="text-2xl font-bold">Meet the group</h2>
        <ul className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {CHARACTER_NAMES.map((character) => (
            <li key={character} className="flex flex-col items-center text-center">
              <Character character={character} width={160} />
              <p className="mt-2 font-semibold">{CHARACTER_INFO[character].name}</p>
              <p className="text-sm text-[#4b5745]">{CHARACTER_INFO[character].role}</p>
            </li>
          ))}
        </ul>
      </section>
```
Note that `scenes/raccoon-gate.png` is 1200 wide, but its height depends on the mockup. Set `height` to the value Step 3 printed, or read it with `python3 -c "from PIL import Image; print(Image.open('apps/web/public/characters/scenes/raccoon-gate.png').size)"`.

- [ ] **Step 7: Run the tests and build, then look at the OG image**

```bash
cd apps/web && npx vitest run && npm run build && (npx next start -p 3100 & sleep 4; curl -s -o /tmp/og-landing.png -w '%{http_code} %{content_type}\n' http://localhost:3100/opengraph-image; kill %1); cd ../..
```
Expected:
- the tests pass
- the build succeeds
- curl prints `200 image/png`

Use the Read tool on `/tmp/og-landing.png` to check that all four characters render.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -F - <<'EOF'
Bring the cast into the web app

Portraits and avatars for the four characters, cut from the approved
A++ mockups until foundry's cast bible exports exist. A Character
component carries the in-app rule: full art on public pages, small at
moments, never in forms or ledgers. The landing page and its link
preview now show the group.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 6: Rule pages and their link previews

**Files:**
- Create: `apps/web/components/rules/rule-article.tsx`, `apps/web/app/rules/page.tsx`, `apps/web/app/rules/[id]/page.tsx`, `apps/web/app/rules/[id]/opengraph-image.tsx`, `apps/web/test/rules/rule-article.test.tsx`

**Interfaces:**
- Consumes:
  - Task 4: `getLibrary`, `publishedRules`, `staticRuleIds`, `resolveRulePage`, `needsReviewSince`, `sourcesFor`, `entitlementLines`, `formatIsoDate`, `DOMAIN_LABELS`, `DOMAIN_ORDER`
  - Task 5: `Character`, `characterDataUrl`, `OgFrame`
- Produces:
  - `<RuleArticle rule sources reviewSince art? />`
  - The routes `/rules`, `/rules/[id]`, and `/rules/[id]/opengraph-image`
  - `RuleContent` and the page's `params` handling, which Task 7 extends with the offer

- [ ] **Step 1: Write the failing component test**

`apps/web/test/rules/rule-article.test.tsx`:
```tsx
import type { RulesLibrary } from '@elsewhere/rules/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { RuleArticle } from '@/components/rules/rule-article';
import { findRule, needsReviewSince, sourcesFor } from '@/lib/rules/accessors';

const library = fixture as unknown as RulesLibrary;

function render(id: string) {
  const rule = findRule(library, id)!;
  return renderToStaticMarkup(<RuleArticle rule={rule} sources={sourcesFor(library, rule)} reviewSince={needsReviewSince(rule)} />);
}

describe('RuleArticle', () => {
  it('shows the rule, steps, and quoted sources', () => {
    const html = render('fixture-us-refund-cancelled-flight');
    expect(html).toContain('Cancelled flight? You&#x27;re owed cash, not a voucher');
    expect(html).toContain('Ask for a refund to your original payment method, in writing.');
    expect(html).toContain('href="https://example.test/14-cfr-260"');
    expect(html).toContain('Fixture quote: a carrier must provide a prompt refund');
    expect(html).toContain('Not legal advice');
    expect(html).not.toContain('Being re-checked');
  });

  it('flags a rule under review with the date the re-check started', () => {
    expect(render('fixture-tarmac-delay')).toContain('Being re-checked since Oct 20, 2026');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web && npx vitest run test/rules/rule-article.test.tsx; cd ../..
```
Expected: FAIL, with `@/components/rules/rule-article` not found.

- [ ] **Step 3: Write the article component**

`apps/web/components/rules/rule-article.tsx`:
```tsx
import type { ReactNode } from 'react';
import type { Rule, RuleSourceRef, Source } from '@elsewhere/rules/core';
import { DOMAIN_LABELS } from '@/lib/rules/accessors';
import { entitlementLines, formatIsoDate } from '@/lib/rules/present';

export function RuleArticle({
  rule,
  sources,
  reviewSince,
  art,
}: {
  rule: Rule;
  sources: { ref: RuleSourceRef; source: Source | null }[];
  reviewSince: string | null;
  art?: ReactNode;
}) {
  const amounts = entitlementLines(rule);
  return (
    <article className="mt-6">
      {reviewSince ? (
        <p role="status" className="mb-6 rounded-lg border border-[#e7c37a] bg-[#fdf3dc] px-4 py-3 text-sm">
          Being re-checked since {formatIsoDate(reviewSince)}. A source this rule quotes changed, and we are confirming the details.
        </p>
      ) : null}
      <div className="flex items-start gap-6">
        <div className="flex-1">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#b4532a]">{DOMAIN_LABELS[rule.domain]}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{rule.title}</h1>
          <p className="mt-4 text-lg text-[#4b5745]">{rule.summary}</p>
        </div>
        {art ? <div className="hidden shrink-0 sm:block">{art}</div> : null}
      </div>

      {amounts.length > 0 || rule.entitlement.timing ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">What you’re owed</h2>
          <ul className="mt-2 list-disc pl-6">
            {amounts.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {rule.entitlement.timing ? <li>{rule.entitlement.timing}</li> : null}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">How to claim it</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-6">
          {rule.how_to_claim.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      {rule.exceptions.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Exceptions</h2>
          <ul className="mt-2 list-disc pl-6">
            {rule.exceptions.map((exception) => (
              <li key={exception}>{exception}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Sources</h2>
        <ul className="mt-2 space-y-4">
          {sources.map(({ ref, source }) => (
            <li key={ref.id}>
              {source ? (
                <a href={source.url} rel="noopener" className="font-medium underline">
                  {source.url}
                </a>
              ) : (
                <span className="font-medium">{ref.source}</span>
              )}
              {ref.quotes.map((quote) => (
                <blockquote key={quote.text} className="mt-2 border-l-4 border-[#d9d3c2] pl-4 text-[#4b5745]">
                  “{quote.text}”
                </blockquote>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 text-sm text-[#4b5745]">
        {rule.last_verified ? `Last verified ${formatIsoDate(rule.last_verified)}. ` : ''}Not legal advice — the sources above are the authority.
      </p>
    </article>
  );
}
```

- [ ] **Step 4: Write the pages and the OG image**

`apps/web/app/rules/page.tsx`:
```tsx
import Link from 'next/link';
import type { Metadata } from 'next';
import { Character } from '@/components/character';
import { getLibrary } from '@/lib/rules/library';
import { DOMAIN_LABELS, DOMAIN_ORDER, publishedRules } from '@/lib/rules/accessors';

export const metadata: Metadata = {
  title: 'Travel rules, explained · Elsewhere',
  description: 'Refunds, delays, passports, and the fine print — every rule quoted from its source.',
};

export default function RulesIndexPage() {
  const rules = publishedRules(getLibrary());
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-4xl font-bold tracking-tight">Travel rules, explained</h1>
      <p className="mt-3 text-lg text-[#4b5745]">Every rule here quotes its source word for word.</p>
      {DOMAIN_ORDER.map((domain) => {
        const inDomain = rules.filter((rule) => rule.domain === domain);
        if (inDomain.length === 0) return null;
        return (
          <section key={domain} className="mt-10">
            <h2 className="text-xl font-semibold">{DOMAIN_LABELS[domain]}</h2>
            <ul className="mt-4 grid gap-3">
              {inDomain.map((rule) => (
                <li key={rule.id}>
                  <Link href={`/rules/${rule.id}`} className="flex items-center gap-4 rounded-xl border border-[#e4dfd0] bg-white p-4 hover:border-[#b4532a]">
                    <Character character={rule.lead_character} variant="avatar" width={44} />
                    <span className="font-medium">{rule.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
```

`apps/web/app/rules/[id]/page.tsx`:
```tsx
import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Character } from '@/components/character';
import { RuleArticle } from '@/components/rules/rule-article';
import { needsReviewSince, resolveRulePage, sourcesFor, staticRuleIds } from '@/lib/rules/accessors';
import { getLibrary } from '@/lib/rules/library';

type Params = Promise<{ id: string }>;

export function generateStaticParams() {
  return staticRuleIds(getLibrary()).map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const resolution = resolveRulePage(getLibrary(), id);
  if (resolution.kind !== 'page') return { title: 'Travel rules · Elsewhere' };
  return { title: `${resolution.rule.title} · Elsewhere`, description: resolution.rule.summary };
}

export default function RulePage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/rules" className="text-sm text-[#4b5745] hover:underline">
        ← All rules
      </Link>
      <Suspense fallback={<p className="mt-8 text-[#4b5745]">Loading the rule…</p>}>
        <RuleContent params={params} />
      </Suspense>
    </main>
  );
}

async function RuleContent({ params }: { params: Params }) {
  const { id } = await params;
  const library = getLibrary();
  const resolution = resolveRulePage(library, id);
  if (resolution.kind === 'missing') notFound();
  if (resolution.kind === 'redirect') permanentRedirect(resolution.to);
  if (resolution.kind === 'gone') {
    return (
      <section className="mt-8">
        <h1 className="text-3xl font-bold">This rule no longer applies</h1>
        <p className="mt-3 text-[#4b5745]">
          The source it quoted changed or was withdrawn. <Link href="/rules" className="underline">See the current rules.</Link>
        </p>
      </section>
    );
  }
  const { rule } = resolution;
  return (
    <RuleArticle
      rule={rule}
      sources={sourcesFor(library, rule)}
      reviewSince={needsReviewSince(rule)}
      art={<Character character={rule.lead_character} width={180} priority />}
    />
  );
}
```

`apps/web/app/rules/[id]/opengraph-image.tsx`:
```tsx
import { ImageResponse } from 'next/og';
import { resolveRulePage, staticRuleIds } from '@/lib/rules/accessors';
import { getLibrary } from '@/lib/rules/library';
import { characterDataUrl } from '@/lib/og/assets';
import { OgFrame } from '@/lib/og/frame';

export const alt = 'An Elsewhere travel rule';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return staticRuleIds(getLibrary()).map((id) => ({ id }));
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolution = resolveRulePage(getLibrary(), id);
  const rule = resolution.kind === 'page' ? resolution.rule : null;
  return new ImageResponse(
    (
      <OgFrame
        characterSrc={await characterDataUrl(rule?.lead_character ?? 'capybara')}
        eyebrow="Elsewhere · travel rules"
        title={rule?.title ?? 'Travel rules, explained'}
        footer="Quoted from the source. Not legal advice."
      />
    ),
    size,
  );
}
```

- [ ] **Step 5: Run the tests and build, then smoke the routes**

```bash
cd apps/web && npx vitest run && npm run build && (npx next start -p 3100 & sleep 4; \
  for p in /rules "/rules/$(node -e "const l=require('../../packages/rules/dist/rules.json');console.log((l.rules.find(r=>r.status==='verified')||{}).id||'none')")"; do \
    curl -s -o /dev/null -w "$p %{http_code}\n" "http://localhost:3100$p"; done; kill %1); cd ../..
```
Expected: `/rules 200`, then the first verified rule's page with `200`. If Track A has no verified rules yet, the second line shows `/rules/none 404`; that is fine until rules land.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -F - <<'EOF'
Publish rule pages with the cast and link previews

Rule pages prerender from the library with each rule's lead character,
its steps, and its sources quoted word for word. Rules under review carry
a banner with the date the re-check began, and retired rules redirect to
their replacement.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 7: Price variants, funnel telemetry, and the offer

**Files:**
- Create: `apps/web/lib/funnel/variant.ts`, `apps/web/lib/funnel/utm.ts`, `apps/web/lib/funnel/events.ts`, `apps/web/app/actions/funnel.ts`, `apps/web/components/funnel/beacon.tsx`, `apps/web/components/offer/offer-card.tsx`, `apps/web/components/offer/offer.tsx`, `apps/web/test/funnel/variant.test.ts`, `apps/web/test/funnel/utm.test.ts`, `apps/web/test/funnel/events.test.ts`, `apps/web/test/offer-card.test.tsx`
- Modify: `apps/web/app/rules/[id]/page.tsx`

**Interfaces:**
- Consumes: `ANONYMOUS_ID_COOKIE` and `isAnonymousId` (Task 3); `createAdminClient` (Task 3); `resolveRulePage` and `getLibrary` (Task 4).
- Produces, used by Tasks 8–10 and by C2:
  - **Price variants:**
    - `PRICE_EXPERIMENT_KEY = 'pass_price_v1'`
    - `type PriceVariant = 'p9' | 'p19'`
    - `VARIANT_PRICE_CENTS`
    - `assignVariant(anonymousId): PriceVariant`
    - `variantPriceLabel(v): string`
  - **UTM handling:**
    - `UTM_COOKIE = 'elsewhere_utm'`
    - `type Utm`
    - `pickUtm(record): Utm`
    - `parseUtmCookie(value): Utm`
    - `UTM_COOKIE_OPTIONS`
  - **Funnel events:**
    - `type FunnelEventName`
    - `FunnelEventInput`
    - `toEventRow(input): FunnelEventRow`
    - `recordEvent(input): Promise<void>`
    - `telemetryEnabled(): boolean`
    - `recordFunnelEvent({ event, ruleId, utm })`, a server action
  - **Components:** `<FunnelBeacon event ruleId? />`, `<Offer ruleId />`, and `<OfferCard ruleId priceLabel />`

- [ ] **Step 1: Write the failing tests**

`apps/web/test/funnel/variant.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { newAnonymousId } from '@/lib/funnel/anonymous-id';
import { assignVariant, variantPriceLabel } from '@/lib/funnel/variant';

describe('assignVariant', () => {
  it('is stable for a visitor', () => {
    const id = newAnonymousId();
    expect(assignVariant(id)).toBe(assignVariant(id));
  });

  it('splits visitors roughly in half', () => {
    const counts = { p9: 0, p19: 0 };
    for (let i = 0; i < 2000; i += 1) counts[assignVariant(newAnonymousId())] += 1;
    expect(counts.p9 / 2000).toBeGreaterThan(0.45);
    expect(counts.p9 / 2000).toBeLessThan(0.55);
  });

  it('labels prices in dollars', () => {
    expect(variantPriceLabel('p9')).toBe('$9');
    expect(variantPriceLabel('p19')).toBe('$19');
  });
});
```

`apps/web/test/funnel/utm.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseUtmCookie, pickUtm } from '@/lib/funnel/utm';

describe('pickUtm', () => {
  it('keeps the four utm keys with safe values', () => {
    expect(pickUtm({ utm_source: 'tiktok', utm_medium: 'social', utm_campaign: 'go-elsewhere', utm_content: 'post_12', ref: 'x' })).toEqual({
      utm_source: 'tiktok',
      utm_medium: 'social',
      utm_campaign: 'go-elsewhere',
      utm_content: 'post_12',
    });
  });

  it('drops empty and unsafe values', () => {
    expect(pickUtm({ utm_source: '', utm_medium: '<script>' })).toEqual({});
  });
});

describe('parseUtmCookie', () => {
  it('round-trips JSON and survives garbage', () => {
    expect(parseUtmCookie(JSON.stringify({ utm_source: 'mcp' }))).toEqual({ utm_source: 'mcp' });
    expect(parseUtmCookie('not json')).toEqual({});
    expect(parseUtmCookie(undefined)).toEqual({});
  });
});
```

`apps/web/test/funnel/events.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import { telemetryEnabled, toEventRow } from '@/lib/funnel/events';

afterEach(() => {
  delete process.env.ELSEWHERE_ENABLE_FUNNEL_TELEMETRY;
});

describe('toEventRow', () => {
  it('maps input to the table columns and folds utm into metadata', () => {
    expect(
      toEventRow({
        anonymousId: 'a'.repeat(32),
        event: 'rule_page_view',
        ruleId: 'fixture-us-refund-cancelled-flight',
        variant: 'p9',
        utm: { utm_source: 'mcp' },
      }),
    ).toEqual({
      anonymous_id: 'a'.repeat(32),
      event_name: 'rule_page_view',
      rule_id: 'fixture-us-refund-cancelled-flight',
      variant: 'p9',
      user_id: null,
      trip_id: null,
      metadata: { utm_source: 'mcp' },
    });
  });
});

describe('telemetryEnabled', () => {
  it('is on unless explicitly disabled', () => {
    expect(telemetryEnabled()).toBe(true);
    process.env.ELSEWHERE_ENABLE_FUNNEL_TELEMETRY = 'false';
    expect(telemetryEnabled()).toBe(false);
  });
});
```

`apps/web/test/offer-card.test.tsx`:
```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OfferCard } from '@/components/offer/offer-card';

describe('OfferCard', () => {
  it('shows the price and links to the start flow for the rule', () => {
    const html = renderToStaticMarkup(<OfferCard ruleId="fixture-us-refund-cancelled-flight" priceLabel="$9" />);
    expect(html).toContain('Forward your group’s bookings and we’ll watch the trip.');
    expect(html).toContain('$9');
    expect(html).toContain('href="/start?rule=fixture-us-refund-cancelled-flight"');
    expect(html).toContain('We draft the messages; you send them.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/funnel test/offer-card.test.tsx; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 3: Implement the funnel modules**

`apps/web/lib/funnel/variant.ts`:
```ts
import { createHash } from 'node:crypto';

export const PRICE_EXPERIMENT_KEY = 'pass_price_v1';
export type PriceVariant = 'p9' | 'p19';
export const VARIANT_PRICE_CENTS: Record<PriceVariant, number> = { p9: 900, p19: 1900 };

/** Deterministic 50/50 split: the same visitor always sees the same price, with no lookup. */
export function assignVariant(anonymousId: string): PriceVariant {
  const digest = createHash('sha256').update(`${PRICE_EXPERIMENT_KEY}:${anonymousId}`).digest();
  return digest[0] % 2 === 0 ? 'p9' : 'p19';
}

export function variantPriceLabel(variant: PriceVariant): string {
  return `$${VARIANT_PRICE_CENTS[variant] / 100}`;
}
```

`apps/web/lib/funnel/utm.ts`:
```ts
export const UTM_COOKIE = 'elsewhere_utm';
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;
export const UTM_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
};

const SAFE_VALUE = /^[A-Za-z0-9._~-]{1,100}$/;

export function pickUtm(input: Record<string, string | null | undefined>): Utm {
  const utm: Utm = {};
  for (const key of UTM_KEYS) {
    const value = input[key];
    if (value && SAFE_VALUE.test(value)) utm[key] = value;
  }
  return utm;
}

export function parseUtmCookie(value: string | undefined): Utm {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? pickUtm(parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
```

`apps/web/lib/funnel/events.ts`:
```ts
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Utm } from './utm';
import { PRICE_EXPERIMENT_KEY } from './variant';

export type FunnelEventName =
  | 'rule_page_view'
  | 'offer_click'
  | 'trip_started'
  | 'booking_forwarded'
  | 'checkout_started'
  | 'paid';

export interface FunnelEventInput {
  anonymousId: string;
  event: FunnelEventName;
  ruleId?: string | null;
  variant?: string | null;
  userId?: string | null;
  tripId?: string | null;
  utm?: Utm;
  metadata?: Record<string, unknown>;
}

export interface FunnelEventRow {
  anonymous_id: string;
  event_name: FunnelEventName;
  rule_id: string | null;
  variant: string | null;
  user_id: string | null;
  trip_id: string | null;
  metadata: Record<string, unknown>;
}

export function telemetryEnabled(): boolean {
  return process.env.ELSEWHERE_ENABLE_FUNNEL_TELEMETRY !== 'false';
}

export function toEventRow(input: FunnelEventInput): FunnelEventRow {
  return {
    anonymous_id: input.anonymousId,
    event_name: input.event,
    rule_id: input.ruleId ?? null,
    variant: input.variant ?? null,
    user_id: input.userId ?? null,
    trip_id: input.tripId ?? null,
    metadata: { ...(input.metadata ?? {}), ...(input.utm ?? {}) },
  };
}

/** Never throws: telemetry must not break a page or a checkout. */
export async function recordEvent(input: FunnelEventInput): Promise<void> {
  if (!telemetryEnabled()) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('funnel_telemetry_events').insert(toEventRow(input));
    if (error) console.error('funnel event failed', error.message);
    if (input.event === 'rule_page_view' && input.variant) {
      await admin
        .from('experiment_assignments')
        .upsert(
          { anonymous_id: input.anonymousId, flag_key: PRICE_EXPERIMENT_KEY, variant: input.variant, user_id: input.userId ?? null },
          { onConflict: 'anonymous_id,flag_key', ignoreDuplicates: true },
        );
    }
  } catch (error) {
    console.error('funnel event failed', error);
  }
}
```

`apps/web/app/actions/funnel.ts`:
```ts
'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { ANONYMOUS_ID_COOKIE, isAnonymousId } from '@/lib/funnel/anonymous-id';
import { recordEvent } from '@/lib/funnel/events';
import { parseUtmCookie, pickUtm, UTM_COOKIE, UTM_COOKIE_OPTIONS } from '@/lib/funnel/utm';
import { assignVariant } from '@/lib/funnel/variant';

const Input = z.object({
  event: z.enum(['rule_page_view', 'offer_click']),
  ruleId: z.string().max(120).nullable(),
  utm: z.record(z.string(), z.string().max(100)).optional(),
});

export async function recordFunnelEvent(input: z.input<typeof Input>): Promise<void> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return;
  const store = await cookies();
  const anonymousId = store.get(ANONYMOUS_ID_COOKIE)?.value;
  if (!isAnonymousId(anonymousId)) return;

  // Last-touch UTM: a landing with UTM tags replaces the stored set; otherwise reuse it.
  const fresh = pickUtm(parsed.data.utm ?? {});
  const utm = Object.keys(fresh).length > 0 ? fresh : parseUtmCookie(store.get(UTM_COOKIE)?.value);
  if (Object.keys(fresh).length > 0) store.set(UTM_COOKIE, JSON.stringify(fresh), UTM_COOKIE_OPTIONS);

  await recordEvent({
    anonymousId,
    event: parsed.data.event,
    ruleId: parsed.data.ruleId,
    variant: assignVariant(anonymousId),
    utm,
  });
}
```

`apps/web/components/funnel/beacon.tsx`:
```tsx
'use client';

import { useEffect, useRef } from 'react';
import { recordFunnelEvent } from '@/app/actions/funnel';

/** Fires one funnel event per mount. Pages stay static, and the event rides a server action. */
export function FunnelBeacon({ event, ruleId }: { event: 'rule_page_view' | 'offer_click'; ruleId?: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const utm = Object.fromEntries(new URLSearchParams(window.location.search));
    void recordFunnelEvent({ event, ruleId: ruleId ?? null, utm });
  }, [event, ruleId]);
  return null;
}
```

`apps/web/components/offer/offer-card.tsx`:
```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function OfferCard({ ruleId, priceLabel }: { ruleId: string; priceLabel: string }) {
  return (
    <section aria-labelledby="offer-heading" className="mt-12 rounded-2xl border border-[#e4dfd0] bg-white p-6">
      <h2 id="offer-heading" className="text-xl font-bold">
        Forward your group’s bookings and we’ll watch the trip.
      </h2>
      <p className="mt-2 text-[#4b5745]">
        Free: we read your confirmations, build the itinerary, and check everyone’s documents.
      </p>
      <p className="mt-2 text-[#4b5745]">
        Trip pass, {priceLabel} for the whole group: we watch every flight and tell the affected people what they’re owed, with the rule
        cited. We draft the messages; you send them.
      </p>
      <Button asChild className="mt-4">
        <Link href={`/start?rule=${encodeURIComponent(ruleId)}`}>Start a trip</Link>
      </Button>
    </section>
  );
}
```

`apps/web/components/offer/offer.tsx`:
```tsx
import { cookies } from 'next/headers';
import { FunnelBeacon } from '@/components/funnel/beacon';
import { ANONYMOUS_ID_COOKIE, isAnonymousId } from '@/lib/funnel/anonymous-id';
import { assignVariant, variantPriceLabel } from '@/lib/funnel/variant';
import { OfferCard } from './offer-card';

/** Reads the visitor cookie, so render it inside <Suspense>. */
export async function Offer({ ruleId }: { ruleId: string }) {
  const anonymousId = (await cookies()).get(ANONYMOUS_ID_COOKIE)?.value;
  const variant = isAnonymousId(anonymousId) ? assignVariant(anonymousId) : 'p19';
  return (
    <>
      <FunnelBeacon event="rule_page_view" ruleId={ruleId} />
      <OfferCard ruleId={ruleId} priceLabel={variantPriceLabel(variant)} />
    </>
  );
}
```

- [ ] **Step 4: Put the offer on rule pages**

In `apps/web/app/rules/[id]/page.tsx`, add `import { Offer } from '@/components/offer/offer';`. In `RulePage`, add a second Suspense boundary after the first, so the article stays in the static shell and only the offer streams:
```tsx
      <Suspense fallback={null}>
        <RuleOffer params={params} />
      </Suspense>
```
Then add this component at the bottom of the file:
```tsx
async function RuleOffer({ params }: { params: Params }) {
  const { id } = await params;
  const resolution = resolveRulePage(getLibrary(), id);
  return resolution.kind === 'page' ? <Offer ruleId={resolution.rule.id} /> : null;
}
```

- [ ] **Step 5: Run the tests and build**

```bash
cd apps/web && npx vitest run && npm run build; cd ../..
```
Expected: all tests pass and the build succeeds. In the build output, `/rules/[id]` is marked as partially prerendered (`◐`), because the offer streams.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -F - <<'EOF'
Add the trip-pass offer, price variants, and funnel telemetry

Each visitor gets a stable $9 or $19 price from a hash of their
anonymous id. Rule-page views and offer clicks are recorded with the
visitor's last-touch UTM tags in metadata, which is where Track D's
weekly report reads them. The offer streams beside a fully static rule
page.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 8: Planner sign-in by email code, and creating a trip

C2 adds phone codes and group joining. This task gives the planner a way in, so the pass can be bought. Trip creation stays closed behind `TRIPS_OPEN` until C2 ships intake. Until then the offer collects clicks, which are an early signal.

**Files:**
- Create: `apps/web/lib/auth/otp.ts`, `apps/web/lib/trips/inbound-code.ts`, `apps/web/lib/trips/new-trip.ts`, `apps/web/lib/trips/open.ts`, `apps/web/app/login/page.tsx`, `apps/web/app/login/login-form.tsx`, `apps/web/app/login/actions.ts`, `apps/web/app/start/page.tsx`, `apps/web/app/trips/page.tsx`, `apps/web/app/trips/new/page.tsx`, `apps/web/app/trips/new/new-trip-form.tsx`, `apps/web/app/trips/new/actions.ts`, `apps/web/app/trips/[id]/page.tsx`, `apps/web/test/auth/otp.test.ts`, `apps/web/test/trips/inbound-code.test.ts`, `apps/web/test/trips/new-trip.test.ts`
- Modify: `.env.example` (add `TRIPS_OPEN=false`)

**Interfaces:**
- Consumes:
  - Task 3: `createClient`, `requireUser`, `getCurrentUser`, `safeNext`, `ANONYMOUS_ID_COOKIE`
  - Task 7: `recordEvent`, `UTM_COOKIE`, `parseUtmCookie`, `FunnelBeacon`
  - Task 5: `Character`
- Produces:
  - **Auth parsing:**
    - `parseEmail(v): string | null`
    - `parseOtpCode(v): string | null`
    - `loginAction(prev: LoginState, form): Promise<LoginState>`
  - **Inbound addresses:**
    - `newInboundCode(): string`, matching `^trip-[a-km-np-z2-9]{12}$`
    - `inboundAddress(code, domain): string`
    - `inboundCodeFromAddress(address, domain): string | null`
  - **New trips:**
    - `parseNewTrip(form): { success: true; data: NewTrip } | { success: false; error: string }`
    - `tripsOpen(): boolean`
  - **Routes:**
    - `/trips/[id]`: C2 Task 15 replaces it with the smart feed. Task 9 adds the pass section here first.
    - `/login`: C2 Task 1 adds the phone option.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/auth/otp.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseEmail, parseOtpCode } from '@/lib/auth/otp';

describe('parseEmail', () => {
  it('lowercases and trims valid emails', () => {
    expect(parseEmail('  Pat@Example.TEST ')).toBe('pat@example.test');
  });

  it('rejects invalid input', () => {
    expect(parseEmail('pat@')).toBeNull();
    expect(parseEmail(null)).toBeNull();
  });
});

describe('parseOtpCode', () => {
  it('accepts 6 to 10 digits and ignores spaces', () => {
    expect(parseOtpCode('123 456')).toBe('123456');
    expect(parseOtpCode('12345')).toBeNull();
    expect(parseOtpCode('abcdef')).toBeNull();
  });
});
```

`apps/web/test/trips/inbound-code.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { inboundAddress, inboundCodeFromAddress, newInboundCode } from '@/lib/trips/inbound-code';

describe('inbound codes', () => {
  it('generates unambiguous codes', () => {
    const codes = new Set(Array.from({ length: 500 }, () => newInboundCode()));
    expect(codes.size).toBe(500);
    for (const code of codes) expect(code).toMatch(/^trip-[a-km-np-z2-9]{12}$/);
  });

  it('builds and parses trip addresses case-insensitively', () => {
    const address = inboundAddress('trip-abcdefghjkmn', 'in.example.test');
    expect(address).toBe('trip-abcdefghjkmn@in.example.test');
    expect(inboundCodeFromAddress('Lisbon Trip <TRIP-ABCDEFGHJKMN@IN.EXAMPLE.TEST>', 'in.example.test')).toBe('trip-abcdefghjkmn');
    expect(inboundCodeFromAddress('someone@else.test', 'in.example.test')).toBeNull();
  });
});
```

`apps/web/test/trips/new-trip.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseNewTrip } from '@/lib/trips/new-trip';

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const valid = { name: 'Lisbon 2026', destinationCountry: 'pt', startDate: '2026-11-03', endDate: '2026-11-10', displayName: 'Pat' };

describe('parseNewTrip', () => {
  it('normalizes a valid trip', () => {
    expect(parseNewTrip(form(valid))).toEqual({ success: true, data: { ...valid, destinationCountry: 'PT' } });
  });

  it('rejects an end date before the start', () => {
    const result = parseNewTrip(form({ ...valid, endDate: '2026-11-01' }));
    expect(result).toEqual({ success: false, error: 'The trip has to end on or after it starts.' });
  });

  it('rejects a country that is not a two-letter code', () => {
    expect(parseNewTrip(form({ ...valid, destinationCountry: 'Portugal' })).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/auth test/trips; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 3: Implement the pure modules**

`apps/web/lib/auth/otp.ts`:
```ts
import { z } from 'zod';

const Email = z.email().max(254);

export function parseEmail(value: FormDataEntryValue | string | null | undefined): string | null {
  const parsed = Email.safeParse(String(value ?? '').trim().toLowerCase());
  return parsed.success ? parsed.data : null;
}

export function parseOtpCode(value: FormDataEntryValue | null | undefined): string | null {
  const code = String(value ?? '').replace(/\s+/g, '');
  return /^\d{6,10}$/.test(code) ? code : null;
}
```

`apps/web/lib/trips/inbound-code.ts`:
```ts
import { randomBytes } from 'node:crypto';

// 32 symbols without l, o, 0, or 1, so a code read aloud or retyped stays unambiguous. 256 % 32 === 0, so there is no bias.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function newInboundCode(): string {
  let code = '';
  for (const byte of randomBytes(12)) code += ALPHABET[byte % ALPHABET.length];
  return `trip-${code}`;
}

export function inboundAddress(code: string, inboundDomain: string): string {
  return `${code}@${inboundDomain}`;
}

export function inboundCodeFromAddress(address: string, inboundDomain: string): string | null {
  const match = address.toLowerCase().match(/(trip-[a-z0-9]{12})@([a-z0-9.-]+)/);
  return match && match[2] === inboundDomain.toLowerCase() ? match[1] : null;
}
```

`apps/web/lib/trips/new-trip.ts`:
```ts
import { z } from 'zod';

const NewTripSchema = z
  .object({
    name: z.string().trim().min(2, 'Give the trip a name.').max(80),
    destinationCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use the two-letter country code, like PT.'),
    startDate: z.iso.date('Pick a start date.'),
    endDate: z.iso.date('Pick an end date.'),
    displayName: z.string().trim().min(1, 'Add your name.').max(80),
  })
  .refine((trip) => trip.endDate >= trip.startDate, { message: 'The trip has to end on or after it starts.', path: ['endDate'] });

export type NewTrip = z.infer<typeof NewTripSchema>;

export function parseNewTrip(form: FormData): { success: true; data: NewTrip } | { success: false; error: string } {
  const parsed = NewTripSchema.safeParse({
    name: form.get('name') ?? '',
    destinationCountry: form.get('destinationCountry') ?? '',
    startDate: form.get('startDate') ?? '',
    endDate: form.get('endDate') ?? '',
    displayName: form.get('displayName') ?? '',
  });
  return parsed.success ? { success: true, data: parsed.data } : { success: false, error: parsed.error.issues[0].message };
}
```

`apps/web/lib/trips/open.ts`:
```ts
/** Trip creation opens when C2's intake ships. Until then the offer collects clicks only. */
export function tripsOpen(): boolean {
  return process.env.TRIPS_OPEN === 'true';
}
```

Append to `.env.example`:
```bash
# Trip creation opens when C2 ships intake
TRIPS_OPEN=false
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/web && npx vitest run test/auth test/trips; cd ../..
```
Expected: PASS.

- [ ] **Step 5: Write sign-in**

`apps/web/app/login/actions.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import { parseEmail, parseOtpCode } from '@/lib/auth/otp';
import { safeNext } from '@/lib/auth/safe-next';
import { createClient } from '@/lib/supabase/server';

export interface LoginState {
  step: 'email' | 'verify';
  email: string;
  error: string | null;
}

export async function loginAction(prev: LoginState, form: FormData): Promise<LoginState> {
  const supabase = await createClient();
  if (form.get('intent') === 'verify') {
    const email = parseEmail(form.get('email')) ?? prev.email;
    const code = parseOtpCode(form.get('code'));
    if (!email || !code) return { step: 'verify', email, error: 'Enter the code from the email.' };
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) return { step: 'verify', email, error: 'That code did not work. Check it, or go back and request a new one.' };
    redirect(safeNext(String(form.get('next') ?? '')));
  }
  const email = parseEmail(form.get('email'));
  if (!email) return { step: 'email', email: '', error: 'Enter a valid email address.' };
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) return { step: 'email', email, error: 'We could not send a code just now. Try again in a minute.' };
  return { step: 'verify', email, error: null };
}
```

`apps/web/app/login/login-form.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { loginAction, type LoginState } from './actions';

const inputClass = 'w-full rounded-md border border-[#d9d3c2] bg-white px-3 py-2';

export function LoginForm({ next, initialEmail, initialStep }: { next: string; initialEmail: string; initialStep: 'email' | 'verify' }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {
    step: initialStep,
    email: initialEmail,
    error: null,
  });
  return (
    <form action={formAction} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next} />
      {state.step === 'email' ? (
        <>
          <label htmlFor="email" className="block text-sm font-medium">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className={inputClass} />
          <input type="hidden" name="intent" value="send" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Sending…' : 'Email me a code'}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-[#4b5745]">We sent a code to {state.email}.</p>
          <input type="hidden" name="email" value={state.email} />
          <label htmlFor="code" className="block text-sm font-medium">Code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required className={`${inputClass} tracking-widest`} />
          <input type="hidden" name="intent" value="verify" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Checking…' : 'Sign in'}
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

`apps/web/app/login/page.tsx`:
```tsx
import { Suspense } from 'react';
import { safeNext } from '@/lib/auth/safe-next';
import { LoginForm } from './login-form';

type SearchParams = Promise<{ next?: string; email?: string; step?: string }>;

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Sign in to Elsewhere</h1>
      <p className="mt-2 text-[#4b5745]">We email you a one-time code. No password.</p>
      <Suspense fallback={null}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <LoginForm next={safeNext(params.next)} initialEmail={params.email ?? ''} initialStep={params.step === 'verify' ? 'verify' : 'email'} />;
}
```

- [ ] **Step 6: Write the start page, the trip pages, and trip creation**

`apps/web/app/start/page.tsx`:
```tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { FunnelBeacon } from '@/components/funnel/beacon';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/auth/user';
import { tripsOpen } from '@/lib/trips/open';

type SearchParams = Promise<{ rule?: string }>;

export default function StartPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Forward the bookings. We’ll watch the trip.</h1>
      <ol className="mt-8 list-decimal space-y-2 pl-6 text-lg text-[#4b5745]">
        <li>Create the trip and get its forwarding address.</li>
        <li>Forward the confirmation emails. We build the itinerary and check everyone’s documents, free.</li>
        <li>Add the trip pass and we watch every flight for the whole group.</li>
      </ol>
      <Suspense fallback={null}>
        <StartActions searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function StartActions({ searchParams }: { searchParams: SearchParams }) {
  const { rule } = await searchParams;
  if (!tripsOpen()) {
    return (
      <>
        <FunnelBeacon event="offer_click" ruleId={rule} />
        <p className="mt-10 rounded-xl border border-[#e4dfd0] bg-white p-6 text-lg">
          We’re opening trip watching to the first groups soon. Follow <strong>@go.elsewhere</strong> for the launch.
        </p>
      </>
    );
  }
  const user = await getCurrentUser();
  const href = user ? '/trips/new' : `/login?next=${encodeURIComponent('/trips/new')}`;
  return (
    <>
      <FunnelBeacon event="offer_click" ruleId={rule} />
      <Button asChild size="lg" className="mt-10">
        <Link href={href}>Start a trip</Link>
      </Button>
    </>
  );
}
```

`apps/web/app/trips/page.tsx`:
```tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { Character } from '@/components/character';
import { requireUser } from '@/lib/auth/user';
import { createClient } from '@/lib/supabase/server';

export default function TripsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Your trips</h1>
      <Suspense fallback={<p className="mt-6 text-[#4b5745]">Loading your trips…</p>}>
        <TripList />
      </Suspense>
    </main>
  );
}

async function TripList() {
  await requireUser('/trips');
  const supabase = await createClient();
  const { data: trips } = await supabase.from('trips').select('id, name, start_date, end_date').order('start_date', { ascending: true });
  if (!trips || trips.length === 0) {
    return (
      <div className="mt-10 flex items-center gap-4 rounded-xl border border-[#e4dfd0] bg-white p-6">
        <Character character="capybara" variant="avatar" width={56} />
        <div>
          <p className="font-medium">No trips yet. Nothing to worry about.</p>
          <Link href="/trips/new" className="text-[#b4532a] underline">Start one</Link>
        </div>
      </div>
    );
  }
  return (
    <ul className="mt-6 space-y-3">
      {trips.map((trip) => (
        <li key={trip.id}>
          <Link href={`/trips/${trip.id}`} className="block rounded-xl border border-[#e4dfd0] bg-white p-4 hover:border-[#b4532a]">
            <span className="font-medium">{trip.name}</span>
            <span className="ml-2 text-sm text-[#4b5745]">
              {trip.start_date} → {trip.end_date}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

`apps/web/app/trips/new/actions.ts`:
```ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/user';
import { ANONYMOUS_ID_COOKIE, isAnonymousId } from '@/lib/funnel/anonymous-id';
import { recordEvent } from '@/lib/funnel/events';
import { parseUtmCookie, UTM_COOKIE } from '@/lib/funnel/utm';
import { createClient } from '@/lib/supabase/server';
import { newInboundCode } from '@/lib/trips/inbound-code';
import { parseNewTrip } from '@/lib/trips/new-trip';
import { tripsOpen } from '@/lib/trips/open';

export interface NewTripState {
  error: string | null;
}

export async function createTrip(_prev: NewTripState, form: FormData): Promise<NewTripState> {
  if (!tripsOpen()) redirect('/start');
  const user = await requireUser('/trips/new');
  const parsed = parseNewTrip(form);
  if (!parsed.success) return { error: parsed.error };

  const store = await cookies();
  const anonymousId = store.get(ANONYMOUS_ID_COOKIE)?.value;
  const utm = parseUtmCookie(store.get(UTM_COOKIE)?.value);
  const supabase = await createClient();
  const { data: tripId, error } = await supabase.rpc('create_trip', {
    p_name: parsed.data.name,
    p_destination_country: parsed.data.destinationCountry,
    p_start_date: parsed.data.startDate,
    p_end_date: parsed.data.endDate,
    p_inbound_code: newInboundCode(),
    p_display_name: parsed.data.displayName,
    p_anonymous_id: isAnonymousId(anonymousId) ? anonymousId : null,
    p_utm: utm,
  });
  if (error || typeof tripId !== 'string') return { error: 'We could not create the trip. Try again.' };

  if (isAnonymousId(anonymousId)) {
    await recordEvent({ anonymousId, event: 'trip_started', userId: user.id, tripId, utm });
  }
  redirect(`/trips/${tripId}`);
}
```

`apps/web/app/trips/new/new-trip-form.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { createTrip, type NewTripState } from './actions';

const inputClass = 'mt-1 w-full rounded-md border border-[#d9d3c2] bg-white px-3 py-2';
const COMMON_COUNTRIES = ['US', 'MX', 'CA', 'GB', 'FR', 'ES', 'PT', 'IT', 'GR', 'DE', 'NL', 'IE', 'IS', 'JP', 'CO', 'CR', 'DO', 'JM'];

export function NewTripForm() {
  const [state, formAction, pending] = useActionState<NewTripState, FormData>(createTrip, { error: null });
  return (
    <form action={formAction} className="mt-8 space-y-5">
      <label className="block text-sm font-medium">
        Trip name
        <input name="name" required placeholder="Lisbon 2026" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        Destination country (two-letter code)
        <input name="destinationCountry" required maxLength={2} list="countries" placeholder="PT" className={`${inputClass} uppercase`} />
        <datalist id="countries">
          {COMMON_COUNTRIES.map((code) => (
            <option key={code} value={code} />
          ))}
        </datalist>
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm font-medium">
          Leaving
          <input name="startDate" type="date" required className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          Back
          <input name="endDate" type="date" required className={inputClass} />
        </label>
      </div>
      <label className="block text-sm font-medium">
        Your name, as the group knows you
        <input name="displayName" required className={inputClass} />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-[#b42318]">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create the trip'}
      </Button>
    </form>
  );
}
```

`apps/web/app/trips/new/page.tsx`:
```tsx
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/user';
import { tripsOpen } from '@/lib/trips/open';
import { NewTripForm } from './new-trip-form';

export default function NewTripPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">New trip</h1>
      <Suspense fallback={null}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  if (!tripsOpen()) redirect('/start');
  await requireUser('/trips/new');
  return <NewTripForm />;
}
```

`apps/web/app/trips/[id]/page.tsx`:
```tsx
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/user';
import { requireEnv } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { inboundAddress } from '@/lib/trips/inbound-code';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ pass?: string }>;

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
  await searchParams;
  await requireUser(`/trips/${id}`);
  const supabase = await createClient();
  const { data: trip } = await supabase
    .from('trips')
    .select('id, name, destination_country, start_date, end_date, inbound_code, pass_status')
    .eq('id', id)
    .maybeSingle();
  if (!trip) notFound();
  const address = inboundAddress(trip.inbound_code, requireEnv('INBOUND_DOMAIN'));
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">{trip.name}</h1>
      <p className="mt-1 text-[#4b5745]">
        {trip.start_date} → {trip.end_date} · {trip.destination_country}
      </p>
      <section className="mt-8 rounded-xl border border-[#e4dfd0] bg-white p-6">
        <h2 className="font-semibold">Forward the bookings here</h2>
        <p className="mt-2 break-all font-mono text-lg">{address}</p>
        <p className="mt-2 text-sm text-[#4b5745]">
          Forward flight, hotel, and rental confirmations from the email address you signed in with.
        </p>
      </section>
    </>
  );
}
```

- [ ] **Step 7: Run the tests, typecheck, and build**

```bash
cd apps/web && npx vitest run && npm run typecheck && npm run build; cd ../..
```
Expected: all tests pass, typecheck is clean, and the build succeeds.

- [ ] **Step 8: Commit**

```bash
git add apps/web .env.example
git commit -F - <<'EOF'
Let the planner sign in with an email code and create a trip

Sign-in is a one-time email code with no password. Creating a trip
makes the caller its planner, gives the trip a forwarding address, and
keeps the visitor's anonymous id and UTM tags for attribution. Trip
creation stays closed behind TRIPS_OPEN until intake ships in C2.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---
### Task 9: The trip pass — Stripe Checkout and the webhook

**Files:**
- Create: `apps/web/lib/payments/stripe.ts`, `apps/web/lib/payments/passes.ts`, `apps/web/lib/payments/pass-store.ts`, `apps/web/app/trips/[id]/actions.ts`, `apps/web/app/api/webhooks/stripe/route.ts`, `apps/web/test/payments/passes.test.ts`, `apps/web/test/payments/webhook-route.test.ts`
- Modify: `apps/web/app/trips/[id]/page.tsx` (pass section), `apps/web/package.json` (dependency `stripe`)

**Interfaces:**
- Consumes:
  - Task 7: `assignVariant`, `VARIANT_PRICE_CENTS`, `variantPriceLabel`, `recordEvent`, `parseUtmCookie`, `UTM_COOKIE`
  - Task 3: `requireUser`, `createClient`, `createAdminClient`
  - Task 1: `appUrl`, `requireEnv`
- Produces:
  - **Stripe client:**
    - `stripe(): Stripe`
    - `priceIdFor(variant): string`
  - **Webhook handling:**
    - `handleStripeEvent(event: Stripe.Event, store: PassStore): Promise<PassOutcome>`
    - `PassOutcome = { kind: 'ignored'; reason: string } | { kind: 'activated'; tripId: string; status: 'paid' | 'comp' }`
    - `PassStore`
    - `supabasePassStore(): PassStore`
  - **Checkout:** `startPassCheckout(tripId: string)`, a server action.
  - **Route:** `POST /api/webhooks/stripe`. C2 Task 9 extends it to start trip monitoring when `outcome.kind === 'activated'`.

- [ ] **Step 1: Add Stripe**

```bash
npm install stripe@23.0.0 -w @elsewhere/web
```

- [ ] **Step 2: Write the failing tests**

`apps/web/test/payments/passes.test.ts`:
```ts
import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { handleStripeEvent, type PassStore } from '@/lib/payments/passes';

function memoryStore(pass: { anonymousId: string | null; variant: string; utm: Record<string, string> } | null = {
  anonymousId: 'a'.repeat(32),
  variant: 'p9',
  utm: { utm_source: 'tiktok' },
}) {
  const calls = { processed: new Set<string>(), completed: [] as unknown[], activated: [] as unknown[], paid: [] as unknown[] };
  const store: PassStore = {
    async alreadyProcessed(id) {
      return calls.processed.has(id);
    },
    async markProcessed(id) {
      calls.processed.add(id);
    },
    async completePass(input) {
      calls.completed.push(input);
      return pass;
    },
    async activateTrip(tripId, status) {
      calls.activated.push({ tripId, status });
    },
    async recordPaid(input) {
      calls.paid.push(input);
    },
  };
  return { store, calls };
}

function checkoutEvent(overrides: Partial<Stripe.Checkout.Session> = {}, id = 'evt_1'): Stripe.Event {
  return {
    id,
    type: 'checkout.session.completed',
    created: 1_790_000_000,
    data: {
      object: {
        id: 'cs_test_1',
        client_reference_id: 'trip-1',
        payment_status: 'paid',
        amount_total: 900,
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

describe('handleStripeEvent', () => {
  it('activates a paid pass and records the paid funnel event with the trip’s utm', async () => {
    const { store, calls } = memoryStore();
    const outcome = await handleStripeEvent(checkoutEvent(), store);
    expect(outcome).toEqual({ kind: 'activated', tripId: 'trip-1', status: 'paid' });
    expect(calls.activated).toEqual([{ tripId: 'trip-1', status: 'active' }]);
    expect(calls.paid).toEqual([{ anonymousId: 'a'.repeat(32), tripId: 'trip-1', variant: 'p9', amountCents: 900, utm: { utm_source: 'tiktok' } }]);
  });

  it('treats a 100% promotion code as a comp and keeps it out of paid metrics', async () => {
    const { store, calls } = memoryStore();
    const outcome = await handleStripeEvent(checkoutEvent({ payment_status: 'no_payment_required', amount_total: 0 }), store);
    expect(outcome).toEqual({ kind: 'activated', tripId: 'trip-1', status: 'comp' });
    expect(calls.activated).toEqual([{ tripId: 'trip-1', status: 'comp' }]);
    expect(calls.paid).toEqual([]);
  });

  it('ignores duplicates, other events, and unpaid sessions', async () => {
    const { store } = memoryStore();
    await handleStripeEvent(checkoutEvent(), store);
    expect(await handleStripeEvent(checkoutEvent(), store)).toEqual({ kind: 'ignored', reason: 'duplicate' });
    expect(await handleStripeEvent({ id: 'evt_2', type: 'charge.refunded' } as unknown as Stripe.Event, store)).toEqual({
      kind: 'ignored',
      reason: 'unhandled charge.refunded',
    });
    expect(await handleStripeEvent(checkoutEvent({ payment_status: 'unpaid' }, 'evt_3'), store)).toEqual({
      kind: 'ignored',
      reason: 'payment_status unpaid',
    });
  });
});
```

`apps/web/test/payments/webhook-route.test.ts`:
```ts
import Stripe from 'stripe';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/payments/pass-store', () => ({
  supabasePassStore: () => ({
    alreadyProcessed: async () => false,
    markProcessed: async () => undefined,
    completePass: async () => ({ anonymousId: null, variant: 'p19', utm: {} }),
    activateTrip: async () => undefined,
    recordPaid: async () => undefined,
  }),
}));

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
});

const payload = JSON.stringify({
  id: 'evt_route_1',
  object: 'event',
  type: 'checkout.session.completed',
  created: 1_790_000_000,
  data: { object: { id: 'cs_test_9', object: 'checkout.session', client_reference_id: 'trip-9', payment_status: 'paid', amount_total: 1900 } },
});

describe('POST /api/webhooks/stripe', () => {
  it('rejects a bad signature', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(new Request('http://test/api/webhooks/stripe', { method: 'POST', body: payload, headers: { 'stripe-signature': 't=1,v1=bad' } }));
    expect(res.status).toBe(400);
  });

  it('activates the trip for a correctly signed event', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const signature = new Stripe('sk_test_123').webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });
    const res = await POST(new Request('http://test/api/webhooks/stripe', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: 'activated', tripId: 'trip-9', status: 'paid' });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/payments; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 4: Implement**

`apps/web/lib/payments/stripe.ts`:
```ts
import 'server-only';
import Stripe from 'stripe';
import { requireEnv } from '@/lib/env';
import type { PriceVariant } from '@/lib/funnel/variant';

let client: Stripe | null = null;

export function stripe(): Stripe {
  client ??= new Stripe(requireEnv('STRIPE_SECRET_KEY'));
  return client;
}

export function priceIdFor(variant: PriceVariant): string {
  return requireEnv(variant === 'p9' ? 'STRIPE_PRICE_P9' : 'STRIPE_PRICE_P19');
}
```

`apps/web/lib/payments/passes.ts`:
```ts
import type Stripe from 'stripe';

export interface CompletedPass {
  anonymousId: string | null;
  variant: string;
  utm: Record<string, string>;
}

export interface PassStore {
  alreadyProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string): Promise<void>;
  completePass(input: { sessionId: string; tripId: string; status: 'paid' | 'comp'; amountCents: number; paidAt: string }): Promise<CompletedPass | null>;
  activateTrip(tripId: string, passStatus: 'active' | 'comp'): Promise<void>;
  recordPaid(input: { anonymousId: string; tripId: string; variant: string; amountCents: number; utm: Record<string, string> }): Promise<void>;
}

export type PassOutcome =
  | { kind: 'ignored'; reason: string }
  | { kind: 'activated'; tripId: string; status: 'paid' | 'comp' };

/**
 * Idempotent on the Stripe event id. Every write is safe to repeat, and the event is
 * marked processed last, so a crash mid-way lets Stripe's retry finish the job.
 */
export async function handleStripeEvent(event: Stripe.Event, store: PassStore): Promise<PassOutcome> {
  if (event.type !== 'checkout.session.completed') return { kind: 'ignored', reason: `unhandled ${event.type}` };
  if (await store.alreadyProcessed(event.id)) return { kind: 'ignored', reason: 'duplicate' };

  const session = event.data.object;
  const tripId = session.client_reference_id;
  if (!tripId) {
    await store.markProcessed(event.id);
    return { kind: 'ignored', reason: 'no trip' };
  }
  const free = session.payment_status === 'no_payment_required' || (session.amount_total ?? 0) === 0;
  if (session.payment_status !== 'paid' && !free) {
    await store.markProcessed(event.id);
    return { kind: 'ignored', reason: `payment_status ${session.payment_status}` };
  }

  const status = free ? 'comp' : 'paid';
  const amountCents = session.amount_total ?? 0;
  const pass = await store.completePass({
    sessionId: session.id,
    tripId,
    status,
    amountCents,
    paidAt: new Date(event.created * 1000).toISOString(),
  });
  await store.activateTrip(tripId, status === 'paid' ? 'active' : 'comp');
  if (status === 'paid' && pass?.anonymousId) {
    await store.recordPaid({ anonymousId: pass.anonymousId, tripId, variant: pass.variant, amountCents, utm: pass.utm });
  }
  await store.markProcessed(event.id);
  return { kind: 'activated', tripId, status };
}
```

`apps/web/lib/payments/pass-store.ts`:
```ts
import 'server-only';
import { recordEvent } from '@/lib/funnel/events';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PassStore } from './passes';

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export function supabasePassStore(): PassStore {
  const admin = createAdminClient();
  return {
    async alreadyProcessed(eventId) {
      const row = check(await admin.from('webhook_events').select('event_id').eq('provider', 'stripe').eq('event_id', eventId).maybeSingle());
      return row !== null;
    },
    async markProcessed(eventId) {
      check(await admin.from('webhook_events').upsert({ provider: 'stripe', event_id: eventId }, { onConflict: 'provider,event_id', ignoreDuplicates: true }));
    },
    async completePass({ sessionId, tripId, status, amountCents, paidAt }) {
      const pass = check(
        await admin
          .from('passes')
          .update({ status, amount_cents: amountCents, paid_at: paidAt })
          .eq('stripe_session_id', sessionId)
          .select('anonymous_id, price_variant')
          .maybeSingle(),
      );
      const trip = check(await admin.from('trips').select('created_utm').eq('id', tripId).maybeSingle());
      if (!pass) return null;
      return { anonymousId: pass.anonymous_id, variant: pass.price_variant, utm: (trip?.created_utm ?? {}) as Record<string, string> };
    },
    async activateTrip(tripId, passStatus) {
      check(await admin.from('trips').update({ pass_status: passStatus }).eq('id', tripId));
    },
    async recordPaid({ anonymousId, tripId, variant, amountCents, utm }) {
      await recordEvent({ anonymousId, event: 'paid', tripId, variant, utm, metadata: { amount_cents: amountCents } });
    },
  };
}
```

`apps/web/app/api/webhooks/stripe/route.ts`:
```ts
import type Stripe from 'stripe';
import { requireEnv } from '@/lib/env';
import { supabasePassStore } from '@/lib/payments/pass-store';
import { handleStripeEvent } from '@/lib/payments/passes';
import { stripe } from '@/lib/payments/stripe';

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, request.headers.get('stripe-signature') ?? '', requireEnv('STRIPE_WEBHOOK_SECRET'));
  } catch {
    return new Response('invalid signature', { status: 400 });
  }
  const outcome = await handleStripeEvent(event, supabasePassStore());
  return Response.json(outcome);
}
```

`apps/web/app/trips/[id]/actions.ts`:
```ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/user';
import { appUrl } from '@/lib/env';
import { ANONYMOUS_ID_COOKIE, isAnonymousId } from '@/lib/funnel/anonymous-id';
import { recordEvent } from '@/lib/funnel/events';
import { parseUtmCookie, UTM_COOKIE } from '@/lib/funnel/utm';
import { assignVariant, VARIANT_PRICE_CENTS } from '@/lib/funnel/variant';
import { priceIdFor, stripe } from '@/lib/payments/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function startPassCheckout(tripId: string): Promise<void> {
  const user = await requireUser(`/trips/${tripId}`);
  const supabase = await createClient();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: tripId });
  if (isPlanner !== true) throw new Error('Only the planner can start the trip pass.');

  const store = await cookies();
  const anonymousId = store.get(ANONYMOUS_ID_COOKIE)?.value;
  const variant = isAnonymousId(anonymousId) ? assignVariant(anonymousId) : 'p19';
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceIdFor(variant), quantity: 1 }],
    client_reference_id: tripId,
    customer_email: user.email ?? undefined,
    allow_promotion_codes: true,
    metadata: { trip_id: tripId, variant },
    success_url: `${appUrl()}/trips/${tripId}?pass=success`,
    cancel_url: `${appUrl()}/trips/${tripId}?pass=cancelled`,
  });
  const { error } = await createAdminClient().from('passes').insert({
    trip_id: tripId,
    stripe_session_id: session.id,
    price_variant: variant,
    amount_cents: VARIANT_PRICE_CENTS[variant],
    status: 'pending',
    anonymous_id: isAnonymousId(anonymousId) ? anonymousId : null,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  if (isAnonymousId(anonymousId)) {
    await recordEvent({ anonymousId, event: 'checkout_started', userId: user.id, tripId, variant, utm: parseUtmCookie(store.get(UTM_COOKIE)?.value) });
  }
  if (!session.url) throw new Error('Stripe did not return a checkout URL.');
  redirect(session.url);
}
```

- [ ] **Step 5: Add the pass section to the trip page**

In `apps/web/app/trips/[id]/page.tsx`:
1. Add the imports:
   ```tsx
   import { cookies } from 'next/headers';
   import { Button } from '@/components/ui/button';
   import { ANONYMOUS_ID_COOKIE, isAnonymousId } from '@/lib/funnel/anonymous-id';
   import { assignVariant, variantPriceLabel } from '@/lib/funnel/variant';
   import { startPassCheckout } from './actions';
   ```
2. In `TripContent`, replace `await searchParams;` with `const { pass } = await searchParams;`.
3. After the forwarding-address `</section>`, insert `<PassSection tripId={trip.id} passStatus={trip.pass_status} justPaid={pass === 'success'} />`.

Then add this component at the bottom of the file:
```tsx
async function PassSection({ tripId, passStatus, justPaid }: { tripId: string; passStatus: 'none' | 'active' | 'comp'; justPaid: boolean }) {
  if (passStatus !== 'none') {
    return (
      <section className="mt-6 rounded-xl border border-[#cfe3c8] bg-[#f1f8ee] p-6">
        <h2 className="font-semibold">Trip pass active</h2>
        <p className="mt-1 text-sm text-[#4b5745]">We’re watching every confirmed flight for the group.</p>
      </section>
    );
  }
  if (justPaid) {
    return (
      <section role="status" className="mt-6 rounded-xl border border-[#e4dfd0] bg-white p-6">
        Payment received. Turning on the trip pass — refresh in a moment.
      </section>
    );
  }
  const anonymousId = (await cookies()).get(ANONYMOUS_ID_COOKIE)?.value;
  const price = variantPriceLabel(isAnonymousId(anonymousId) ? assignVariant(anonymousId) : 'p19');
  return (
    <section className="mt-6 rounded-xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="font-semibold">Watch this trip</h2>
      <p className="mt-1 text-sm text-[#4b5745]">
        One {price} pass covers the whole group: flight watching, cited playbooks, and group alerts. We draft the messages; you send them.
      </p>
      <form action={startPassCheckout.bind(null, tripId)} className="mt-4">
        <Button type="submit">Get the trip pass — {price}</Button>
      </form>
    </section>
  );
}
```

- [ ] **Step 6: Run the tests, typecheck, and build**

```bash
cd apps/web && npx vitest run && npm run typecheck && npm run build; cd ../..
```
Expected: all tests pass, typecheck is clean, and the build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/web package.json package-lock.json
git commit -F - <<'EOF'
Sell the trip pass through Stripe Checkout

The planner checks out at the price their visitor id was assigned. The
webhook is idempotent on the Stripe event id: it activates the trip and
records the paid event with the trip's original UTM tags. A 100%
promotion code becomes a comp, which stays out of the payment-test
numbers.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 10: Post attribution for foundry — `/r/[postId]` and `/api/attribution`

This task implements Track B's pinned contract exactly (`foundry/docs/superpowers/plans/2026-10-01-track-b-e2-publishing-and-tracking.md`):
- **Tracked links:** `/r/<postId>?p=<ig|fb|tt|yt|pin>`. Only those five platform codes count. Any other code, or none, is ignored and recorded as `other`.
- **Attribution request:** `GET /api/attribution?since=YYYY-MM-DD` with `Authorization: Bearer ${FOUNDRY_ATTRIBUTION_KEY}`. A missing or wrong key returns 401.
- **Attribution response:** `{ "since": "YYYY-MM-DD", "generated_at": "<ISO timestamp>", "posts": [{ "post_id", "clicks", "forwarded_bookings", "paid_passes" }] }`. Counts are cumulative since `since`, and comped passes are excluded from `paid_passes`.

Track B's links name no rule, so `/r/` lands on `/rules` by default. It also accepts an optional `to` parameter (`/rules/<id>`, `/money/<slug>`, `/rules`, or `/money`; anything else falls back to `/rules`). Track B can add `to` later without breaking its contract.

**Files:**
- Create: `apps/web/lib/attribution/link.ts`, `apps/web/lib/attribution/summary.ts`, `apps/web/lib/attribution/touchpoints.ts`, `apps/web/app/r/[postId]/route.ts`, `apps/web/app/api/attribution/route.ts`, `apps/web/test/attribution/link.test.ts`, `apps/web/test/attribution/summary.test.ts`, `apps/web/test/attribution/routes.test.ts`, `apps/web/test/attribution/contract.test.ts`
- Modify: `.env.example` (already has `FOUNDRY_ATTRIBUTION_KEY`)

**Interfaces:**
- Consumes: `ANONYMOUS_ID_COOKIE`, `isAnonymousId`, `newAnonymousId`, and `persistAnonymousId` (Task 3); `createAdminClient` (Task 3); the SQL `attribution_summary` (Task 2).
- Produces:
  - **Link parsing:**
    - `PLATFORM_CODES = { ig: 'instagram', fb: 'facebook', tt: 'tiktok', yt: 'youtube', pin: 'pinterest' }`
    - `parsePostLink(postId, search): PostLink | null`
    - `redirectUrl(base, link): string`
  - **Summary:**
    - `authorizedFoundry(header, key): boolean`
    - `parseSince(value): string | null`, which accepts `YYYY-MM-DD` only
    - `toAttributionResponse(since, rows): AttributionResponse`
    - `AttributionResponseSchema`, a strict zod schema for the contract
  - **Routes:** `GET /r/[postId]` (307) and `GET /api/attribution?since=YYYY-MM-DD` (Bearer `FOUNDRY_ATTRIBUTION_KEY`).

- [ ] **Step 1: Write the failing tests**

`apps/web/test/attribution/link.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parsePostLink, redirectUrl } from '@/lib/attribution/link';

describe('parsePostLink', () => {
  it('maps the five platform codes and tags UTM, landing on /rules by default', () => {
    const link = parsePostLink('b-x-c', new URLSearchParams('p=tt'));
    expect(link).toEqual({
      postId: 'b-x-c',
      platform: 'tiktok',
      landingPath: '/rules',
      utm: { utm_source: 'tiktok', utm_medium: 'social', utm_campaign: 'go-elsewhere', utm_content: 'b-x-c' },
    });
    expect(['ig', 'fb', 'tt', 'yt', 'pin'].map((p) => parsePostLink('x', new URLSearchParams(`p=${p}`))!.platform)).toEqual([
      'instagram',
      'facebook',
      'tiktok',
      'youtube',
      'pinterest',
    ]);
  });

  it('ignores other platform codes and unsafe landing paths', () => {
    expect(parsePostLink('p1', new URLSearchParams('p=tiktok&to=https://evil.test'))).toMatchObject({ platform: 'other', landingPath: '/rules' });
    expect(parsePostLink('p1', new URLSearchParams('p=ig&to=//evil.test'))).toMatchObject({ platform: 'instagram', landingPath: '/rules' });
    expect(parsePostLink('p1', new URLSearchParams('p=ig&to=/money/fixture-card-trip-delay'))).toMatchObject({ landingPath: '/money/fixture-card-trip-delay' });
  });

  it('rejects malformed post ids', () => {
    expect(parsePostLink('../etc', new URLSearchParams())).toBeNull();
    expect(parsePostLink('x'.repeat(65), new URLSearchParams())).toBeNull();
  });
});

describe('redirectUrl', () => {
  it('adds the UTM tags to the landing page', () => {
    const link = parsePostLink('p9', new URLSearchParams('p=ig&to=/rules'))!;
    expect(redirectUrl('https://example.test/r/p9', link)).toBe(
      'https://example.test/rules?utm_source=instagram&utm_medium=social&utm_campaign=go-elsewhere&utm_content=p9',
    );
  });
});
```

`apps/web/test/attribution/summary.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { authorizedFoundry, parseSince, toAttributionResponse } from '@/lib/attribution/summary';

describe('authorizedFoundry', () => {
  it('accepts only the exact bearer key', () => {
    expect(authorizedFoundry('Bearer k3y', 'k3y')).toBe(true);
    expect(authorizedFoundry('Bearer wrong', 'k3y')).toBe(false);
    expect(authorizedFoundry(null, 'k3y')).toBe(false);
    expect(authorizedFoundry('Bearer k3y', undefined)).toBe(false);
  });
});

describe('parseSince', () => {
  it('accepts real YYYY-MM-DD dates only', () => {
    expect(parseSince('2026-10-01')).toBe('2026-10-01');
    expect(parseSince('2026-02-30')).toBeNull();
    expect(parseSince('2026-10-01T00:00:00Z')).toBeNull();
    expect(parseSince('nope')).toBeNull();
    expect(parseSince(null)).toBeNull();
  });
});

describe('toAttributionResponse', () => {
  it('echoes since as a date and coerces counts to numbers', () => {
    const response = toAttributionResponse('2026-10-01', [{ post_id: 'p1', clicks: '3', forwarded_bookings: 1, paid_passes: '0' }]);
    expect(response.posts).toEqual([{ post_id: 'p1', clicks: 3, forwarded_bookings: 1, paid_passes: 0 }]);
    expect(response.since).toBe('2026-10-01');
  });
});
```

`apps/web/test/attribution/routes.test.ts`:
```ts
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const inserted: unknown[] = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async (row: unknown) => {
        inserted.push(row);
        return { error: null };
      },
    }),
    rpc: async () => ({ data: [{ post_id: 'p1', clicks: 2, forwarded_bookings: 1, paid_passes: 1 }], error: null }),
  }),
}));

beforeAll(() => {
  process.env.FOUNDRY_ATTRIBUTION_KEY = 'k3y';
});

describe('GET /r/[postId]', () => {
  it('records a touchpoint and redirects with UTM tags and a visitor cookie', async () => {
    const { GET } = await import('@/app/r/[postId]/route');
    const res = await GET(new NextRequest('https://example.test/r/p1?p=tt'), { params: Promise.resolve({ postId: 'p1' }) });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/rules?utm_source=tiktok');
    expect(res.headers.get('set-cookie')).toContain('elsewhere_aid=');
    expect(inserted).toHaveLength(1);
  });
});

describe('GET /api/attribution', () => {
  it('requires the foundry key', async () => {
    const { GET } = await import('@/app/api/attribution/route');
    const res = await GET(new NextRequest('https://example.test/api/attribution?since=2026-10-01'));
    expect(res.status).toBe(401);
  });

  it('returns per-post counts', async () => {
    const { GET } = await import('@/app/api/attribution/route');
    const res = await GET(new NextRequest('https://example.test/api/attribution?since=2026-10-01', { headers: { authorization: 'Bearer k3y' } }));
    expect(res.status).toBe(200);
    expect((await res.json()).posts).toEqual([{ post_id: 'p1', clicks: 2, forwarded_bookings: 1, paid_passes: 1 }]);
  });
});
```

`apps/web/test/attribution/contract.test.ts` checks the exact response Track B depends on:
```ts
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AttributionResponseSchema } from '@/lib/attribution/summary';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async () => ({
      data: [
        { post_id: 'b-x-c', clicks: 12, forwarded_bookings: 2, paid_passes: 1 },
        { post_id: 'b-x-r', clicks: '4', forwarded_bookings: '0', paid_passes: '0' },
      ],
      error: null,
    }),
  }),
}));

beforeAll(() => {
  process.env.FOUNDRY_ATTRIBUTION_KEY = 'contract-key';
});

describe('foundry attribution contract', () => {
  it('returns exactly { since: YYYY-MM-DD, generated_at: ISO, posts: [{ post_id, clicks, forwarded_bookings, paid_passes }] }', async () => {
    const { GET } = await import('@/app/api/attribution/route');
    const res = await GET(new NextRequest('https://example.test/api/attribution?since=2026-10-01', { headers: { authorization: 'Bearer contract-key' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(AttributionResponseSchema.parse(body)).toEqual(body);
    expect(body.since).toBe('2026-10-01');
    expect(body.posts[1]).toEqual({ post_id: 'b-x-r', clicks: 4, forwarded_bookings: 0, paid_passes: 0 });
  });

  it('returns 401 for a missing or wrong key, and 400 for a bad date', async () => {
    const { GET } = await import('@/app/api/attribution/route');
    expect((await GET(new NextRequest('https://example.test/api/attribution?since=2026-10-01'))).status).toBe(401);
    expect((await GET(new NextRequest('https://example.test/api/attribution?since=2026-10-01', { headers: { authorization: 'Bearer nope' } }))).status).toBe(401);
    expect((await GET(new NextRequest('https://example.test/api/attribution?since=2026-10-01T00:00:00Z', { headers: { authorization: 'Bearer contract-key' } }))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/attribution; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 3: Implement**

`apps/web/lib/attribution/link.ts`:
```ts
/** Track B's five platform codes. Anything else is recorded as 'other'. */
export const PLATFORM_CODES = { ig: 'instagram', fb: 'facebook', tt: 'tiktok', yt: 'youtube', pin: 'pinterest' } as const;
export type Platform = (typeof PLATFORM_CODES)[keyof typeof PLATFORM_CODES] | 'other';

export interface PostLink {
  postId: string;
  platform: Platform;
  landingPath: string;
  utm: { utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string };
}

const POST_ID = /^[A-Za-z0-9_-]{1,64}$/;
const LANDING = /^\/(rules|money)(\/[a-z0-9-]{1,120})?$/;

export function parsePostLink(postId: string, search: URLSearchParams): PostLink | null {
  if (!POST_ID.test(postId)) return null;
  const code = search.get('p') ?? '';
  const platform: Platform = Object.hasOwn(PLATFORM_CODES, code) ? PLATFORM_CODES[code as keyof typeof PLATFORM_CODES] : 'other';
  const to = search.get('to') ?? '/rules';
  return {
    postId,
    platform,
    landingPath: LANDING.test(to) ? to : '/rules',
    utm: { utm_source: platform, utm_medium: 'social', utm_campaign: 'go-elsewhere', utm_content: postId },
  };
}

export function redirectUrl(base: string, link: PostLink): string {
  const url = new URL(link.landingPath, base);
  for (const [key, value] of Object.entries(link.utm)) url.searchParams.set(key, value);
  return url.toString();
}
```

`apps/web/lib/attribution/summary.ts`:
```ts
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** Track B's pinned contract. Strict: no extra keys at any level. */
export const AttributionResponseSchema = z
  .object({
    since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    generated_at: z.iso.datetime(),
    posts: z.array(
      z
        .object({
          post_id: z.string(),
          clicks: z.number().int().nonnegative(),
          forwarded_bookings: z.number().int().nonnegative(),
          paid_passes: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();

export type AttributionResponse = z.infer<typeof AttributionResponseSchema>;

export function authorizedFoundry(header: string | null, key: string | undefined): boolean {
  if (!key || !header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(key);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** YYYY-MM-DD only, and it must be a real calendar date. */
export function parseSince(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function toAttributionResponse(
  since: string,
  rows: { post_id: string; clicks: number | string; forwarded_bookings: number | string; paid_passes: number | string }[],
): AttributionResponse {
  return {
    since,
    generated_at: new Date().toISOString(),
    posts: rows.map((row) => ({
      post_id: row.post_id,
      clicks: Number(row.clicks),
      forwarded_bookings: Number(row.forwarded_bookings),
      paid_passes: Number(row.paid_passes),
    })),
  };
}
```

`apps/web/lib/attribution/touchpoints.ts`:
```ts
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PostLink } from './link';

export async function recordTouchpoint(anonymousId: string, link: PostLink): Promise<void> {
  const { error } = await createAdminClient().from('attribution_touchpoints').insert({
    anonymous_id: anonymousId,
    post_id: link.postId,
    platform: link.platform,
    landing_path: link.landingPath,
    utm: link.utm,
  });
  if (error) console.error('touchpoint failed', error.message);
}
```

`apps/web/app/r/[postId]/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { parsePostLink, redirectUrl } from '@/lib/attribution/link';
import { recordTouchpoint } from '@/lib/attribution/touchpoints';
import { ANONYMOUS_ID_COOKIE, isAnonymousId, newAnonymousId, persistAnonymousId } from '@/lib/funnel/anonymous-id';

export async function GET(request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const link = parsePostLink(postId, request.nextUrl.searchParams);
  if (!link) return NextResponse.redirect(new URL('/rules', request.url), 307);

  const existing = request.cookies.get(ANONYMOUS_ID_COOKIE)?.value;
  const anonymousId = isAnonymousId(existing) ? existing : newAnonymousId();
  await recordTouchpoint(anonymousId, link);

  const response = NextResponse.redirect(redirectUrl(request.url, link), 307);
  persistAnonymousId(response, anonymousId === existing ? null : anonymousId);
  return response;
}
```

`apps/web/app/api/attribution/route.ts`:
```ts
import type { NextRequest } from 'next/server';
import { authorizedFoundry, parseSince, toAttributionResponse } from '@/lib/attribution/summary';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest): Promise<Response> {
  if (!authorizedFoundry(request.headers.get('authorization'), process.env.FOUNDRY_ATTRIBUTION_KEY)) {
    return new Response('unauthorized', { status: 401 });
  }
  const since = parseSince(request.nextUrl.searchParams.get('since'));
  if (!since) return Response.json({ error: 'since must be a date in YYYY-MM-DD form' }, { status: 400 });
  const { data, error } = await createAdminClient().rpc('attribution_summary', { p_since: `${since}T00:00:00Z` });
  if (error) return Response.json({ error: 'attribution summary failed' }, { status: 500 });
  return Response.json(toAttributionResponse(since, data ?? []), { headers: { 'cache-control': 'no-store' } });
}
```

- [ ] **Step 4: Run the tests and build**

```bash
cd apps/web && npx vitest run && npm run build; cd ../..
```
Expected: all tests pass and the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -F - <<'EOF'
Attribute post clicks and conversions for foundry

/r/<postId>?p=<ig|fb|tt|yt|pin> records a touchpoint and lands the
visitor on the rules page (or a validated `to` page), tagged with UTM.
/api/attribution returns foundry's pinned contract: per-post clicks,
forwarded bookings, and paid passes since a date, using last touch, with
comps excluded, behind a bearer key. A strict contract test guards the
shape.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 11: Money pages with affiliate offers and FTC disclosures

`/money/[slug]` serves one page per **verified money-domain rule**; the slug is the rule ID. Offers attach by rule tag:
- **`card-benefit`:** the card offer.
- **`travel-insurance`:** SafetyWing and World Nomads.

Each offer only appears once its program URL is configured. Tell Track A the tags in the report at the end.

**Files:**
- Create: `apps/web/lib/affiliate/offers.ts`, `apps/web/components/money/affiliate-offers.tsx`, `apps/web/app/money/[slug]/page.tsx`, `apps/web/app/money/[slug]/opengraph-image.tsx`, `apps/web/test/affiliate/offers.test.ts`, `apps/web/test/affiliate/affiliate-offers.test.tsx`

**Interfaces:**
- Consumes:
  - Task 4: `getLibrary`, `verifiedRulesIn`, `findRule`, `sourcesFor`, `needsReviewSince`
  - Task 6: `RuleArticle`
  - Task 5: `Character`, `characterDataUrl`, `OgFrame`
- Produces:
  - **Offers:**
    - `AffiliateOffer`
    - `FTC_DISCLOSURE`
    - `configuredOffers(env?): AffiliateOffer[]`
    - `offersForRule(rule, offers): AffiliateOffer[]`
  - **Component:** `<AffiliateOffers offers />`
  - **Routes:** `/money/[slug]` and `/money/[slug]/opengraph-image`

- [ ] **Step 1: Write the failing tests**

`apps/web/test/affiliate/offers.test.ts`:
```ts
import type { RulesLibrary } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { configuredOffers, offersForRule } from '@/lib/affiliate/offers';
import { findRule } from '@/lib/rules/accessors';

const library = fixture as unknown as RulesLibrary;

describe('configuredOffers', () => {
  it('includes only offers whose program URL is set', () => {
    const offers = configuredOffers({ AFFILIATE_CARD_URL: 'https://aff.example.test/card' });
    expect(offers.map((o) => o.id)).toEqual(['card']);
    expect(offers[0].href).toBe('https://aff.example.test/card');
  });

  it('ignores URLs that are not https', () => {
    expect(configuredOffers({ AFFILIATE_CARD_URL: 'http://aff.example.test/card' })).toEqual([]);
  });
});

describe('offersForRule', () => {
  it('matches offers to a rule by tag', () => {
    const offers = configuredOffers({
      AFFILIATE_CARD_URL: 'https://aff.example.test/card',
      AFFILIATE_SAFETYWING_URL: 'https://aff.example.test/sw',
    });
    expect(offersForRule(findRule(library, 'fixture-card-trip-delay')!, offers).map((o) => o.id)).toEqual(['card']);
    expect(offersForRule(findRule(library, 'fixture-us-real-id')!, offers)).toEqual([]);
  });
});
```

`apps/web/test/affiliate/affiliate-offers.test.tsx`:
```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AffiliateOffers } from '@/components/money/affiliate-offers';
import { FTC_DISCLOSURE } from '@/lib/affiliate/offers';

describe('AffiliateOffers', () => {
  it('discloses the relationship and marks links as sponsored', () => {
    const html = renderToStaticMarkup(
      <AffiliateOffers offers={[{ id: 'card', label: 'Compare travel cards', href: 'https://aff.example.test/card', tags: ['card-benefit'], note: 'See rates and fees.' }]} />,
    );
    expect(html).toContain(FTC_DISCLOSURE.slice(0, 40));
    expect(html).toContain('rel="sponsored noopener"');
    expect(html).toContain('See rates and fees.');
  });

  it('renders nothing without offers', () => {
    expect(renderToStaticMarkup(<AffiliateOffers offers={[]} />)).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/web && npx vitest run test/affiliate; cd ../..
```
Expected: FAIL, with modules not found.

- [ ] **Step 3: Implement**

`apps/web/lib/affiliate/offers.ts`:
```ts
import type { Rule } from '@elsewhere/rules/core';

export interface AffiliateOffer {
  id: string;
  label: string;
  href: string;
  tags: string[];
  note?: string;
}

export const FTC_DISCLOSURE =
  'Elsewhere earns a commission if you sign up through some links on this page. It never changes what the rule says or which options we show.';

const OFFER_DEFINITIONS: { id: string; envVar: string; label: string; tags: string[]; note?: string }[] = [
  { id: 'card', envVar: 'AFFILIATE_CARD_URL', label: 'Compare travel cards with this protection', tags: ['card-benefit'], note: 'See each card’s rates and fees before you apply.' },
  { id: 'safetywing', envVar: 'AFFILIATE_SAFETYWING_URL', label: 'SafetyWing travel medical insurance', tags: ['travel-insurance'] },
  { id: 'world-nomads', envVar: 'AFFILIATE_WORLDNOMADS_URL', label: 'World Nomads travel insurance', tags: ['travel-insurance'] },
];

export function configuredOffers(env: Record<string, string | undefined> = process.env): AffiliateOffer[] {
  return OFFER_DEFINITIONS.flatMap(({ envVar, ...offer }) => {
    const href = env[envVar];
    return href && href.startsWith('https://') ? [{ ...offer, href }] : [];
  });
}

export function offersForRule(rule: Rule, offers: AffiliateOffer[]): AffiliateOffer[] {
  return offers.filter((offer) => offer.tags.some((tag) => rule.tags.includes(tag)));
}
```

`apps/web/components/money/affiliate-offers.tsx`:
```tsx
import { FTC_DISCLOSURE, type AffiliateOffer } from '@/lib/affiliate/offers';

export function AffiliateOffers({ offers }: { offers: AffiliateOffer[] }) {
  if (offers.length === 0) return null;
  return (
    <section aria-labelledby="offers-heading" className="mt-10 rounded-2xl border border-[#e4dfd0] bg-white p-6">
      <p className="text-sm text-[#4b5745]">{FTC_DISCLOSURE}</p>
      <h2 id="offers-heading" className="mt-4 text-xl font-semibold">
        Options that include this
      </h2>
      <ul className="mt-3 space-y-3">
        {offers.map((offer) => (
          <li key={offer.id}>
            <a href={offer.href} rel="sponsored noopener" target="_blank" className="font-medium text-[#b4532a] underline">
              {offer.label}
            </a>
            {offer.note ? <p className="text-sm text-[#4b5745]">{offer.note}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`apps/web/app/money/[slug]/page.tsx`:
```tsx
import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Character } from '@/components/character';
import { AffiliateOffers } from '@/components/money/affiliate-offers';
import { RuleArticle } from '@/components/rules/rule-article';
import { configuredOffers, FTC_DISCLOSURE, offersForRule } from '@/lib/affiliate/offers';
import { needsReviewSince, sourcesFor, verifiedRulesIn } from '@/lib/rules/accessors';
import { getLibrary } from '@/lib/rules/library';

type Params = Promise<{ slug: string }>;

function moneyRule(slug: string) {
  return verifiedRulesIn(getLibrary(), 'money').find((rule) => rule.id === slug) ?? null;
}

export function generateStaticParams() {
  return verifiedRulesIn(getLibrary(), 'money').map((rule) => ({ slug: rule.id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const rule = moneyRule((await params).slug);
  return rule ? { title: `${rule.title} · Elsewhere`, description: rule.summary } : { title: 'Elsewhere' };
}

export default function MoneyPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Suspense fallback={<p className="text-[#4b5745]">Loading…</p>}>
        <MoneyContent params={params} />
      </Suspense>
    </main>
  );
}

// The library and the offer config change only by deploying, so known slugs prerender fully.
async function MoneyContent({ params }: { params: Params }) {
  const rule = moneyRule((await params).slug);
  if (!rule) notFound();
  const offers = offersForRule(rule, configuredOffers());
  return (
    <>
      {offers.length > 0 ? <p className="rounded-lg bg-[#efe9da] px-4 py-3 text-sm">{FTC_DISCLOSURE}</p> : null}
      <Link href="/rules" className="mt-6 inline-block text-sm text-[#4b5745] hover:underline">
        ← All rules
      </Link>
      <RuleArticle
        rule={rule}
        sources={sourcesFor(getLibrary(), rule)}
        reviewSince={needsReviewSince(rule)}
        art={<Character character={rule.lead_character} width={180} priority />}
      />
      <AffiliateOffers offers={offers} />
    </>
  );
}
```

`apps/web/app/money/[slug]/opengraph-image.tsx`:
```tsx
import { ImageResponse } from 'next/og';
import { verifiedRulesIn } from '@/lib/rules/accessors';
import { getLibrary } from '@/lib/rules/library';
import { characterDataUrl } from '@/lib/og/assets';
import { OgFrame } from '@/lib/og/frame';

export const alt = 'Elsewhere money and perks';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return verifiedRulesIn(getLibrary(), 'money').map((rule) => ({ slug: rule.id }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const rule = verifiedRulesIn(getLibrary(), 'money').find((r) => r.id === slug) ?? null;
  return new ImageResponse(
    (
      <OgFrame
        characterSrc={await characterDataUrl(rule?.lead_character ?? 'pigeon')}
        eyebrow="Elsewhere · money and perks"
        title={rule?.title ?? 'What your trip money is owed'}
        footer="Quoted from the source. Not legal advice."
      />
    ),
    size,
  );
}
```

- [ ] **Step 4: Run the tests and build**

```bash
cd apps/web && npx vitest run && npm run build; cd ../..
```
Expected: all tests pass, and `/money/[slug]` prerenders one page per verified money rule.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -F - <<'EOF'
Add money pages with affiliate offers and FTC disclosures

Each verified money rule gets a page that a card network or insurer can
approve: the rule quoted from its source, the FTC disclosure first, and
only the offers the rule's tags call for, marked as sponsored links.
Offers stay hidden until their program URL is configured.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 12: Domain, Vercel, remote database, Stripe, and the first deploy

Every step here is outward-facing. Each one is marked **[Founder confirms]**. Present what will happen and wait for an explicit yes.

**Files:**
- Create: `apps/web/scripts/stripe-setup.mts`

**Interfaces:**
- Produces:
  - `APP_DOMAIN`, a live production URL
  - Vercel project `elsewhere-web` (root directory `apps/web`, Node 24)
  - Migration `00012` applied to Supabase project `xiinobmygdfwkpjtqauo`
  - Stripe prices for `p9` and `p19` plus the webhook endpoint

- [ ] **Step 1: [Founder confirms] Pick and buy the production domain**

Check availability and price with the Vercel tools. Use `mcp__claude_ai_Vercel__get_domain_availability` and `mcp__claude_ai_Vercel__get_domain_price`, after discovering the team with `mcp__claude_ai_Vercel__list_teams`. Candidates: `goelsewhere.com`, `goelsewhere.app`, `goelsewhere.travel`, `elsewhere.travel`, `getelsewhere.app`.

Present a table of domain, available, and price, and ask the founder to pick one. Buy only after an explicit yes, with `mcp__claude_ai_Vercel__buy_domain` (or `vercel domains buy <domain>`).

Record the choice as `APP_DOMAIN`. Then:
- **`NEXT_PUBLIC_APP_URL`** is `https://<APP_DOMAIN>`.
- **`INBOUND_DOMAIN`** is `in.<APP_DOMAIN>`. Resend's receiving setup for it happens in C2 Task 18.

- [ ] **Step 2: [Founder confirms] Create and link the Vercel project**

```bash
vercel project add elsewhere-web
vercel link --cwd apps/web --project elsewhere-web --yes
```
In the Vercel dashboard (or with `mcp__claude_ai_Vercel__update_project`), set:
- the Root Directory to `apps/web`
- "Include files outside the root directory" on, which the monorepo needs
- Node.js 24.x, which `engines` already requests

Then attach the domain:
```bash
vercel domains add <APP_DOMAIN> --cwd apps/web
```

- [ ] **Step 3: [Founder confirms] Apply the migration and seed to Supabase**

Use the Supabase MCP tools on project `xiinobmygdfwkpjtqauo`:
1. `mcp__claude_ai_Supabase__list_migrations`. Confirm `00012` is not applied yet.
2. `mcp__claude_ai_Supabase__apply_migration` with name `00012_group_trip_assist` and the contents of `supabase/migrations/00012_group_trip_assist.sql` as the query.
3. `mcp__claude_ai_Supabase__execute_sql` with the contents of `supabase/seed.sql`.
4. `mcp__claude_ai_Supabase__get_advisors` with type `security`. "RLS enabled, no policies" on `webhook_events`, `experiment_assignments`, `funnel_telemetry_events`, and `attribution_touchpoints` is intended. Fix anything else before continuing.

These Supabase dashboard settings are founder actions, because the MCP has no tool for them:
- **Site URL** under Authentication → URL Configuration: `https://<APP_DOMAIN>`.
- **Magic Link email template** under Authentication → Email Templates. Replace the link with the code, so sign-in works by code:
  ```html
  <h2>Your Elsewhere code</h2><p>Enter this code to sign in: <strong>{{ .Token }}</strong></p>
  ```

- [ ] **Step 4: Write the Stripe setup script**

`apps/web/scripts/stripe-setup.mts`:
```ts
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
const created = existingHook ? null : await stripe.webhookEndpoints.create({ url: webhookUrl, enabled_events: ['checkout.session.completed'] });

console.log(`STRIPE_PRICE_P9=${p9}`);
console.log(`STRIPE_PRICE_P19=${p19}`);
console.log(created?.secret ? `STRIPE_WEBHOOK_SECRET=${created.secret}` : `Webhook ${webhookUrl} already exists; copy its signing secret from the Stripe dashboard.`);
```

- [ ] **Step 5: [Founder confirms] Run Stripe setup in test mode, then set environment variables**

The founder supplies the Stripe test secret key.
```bash
cd apps/web && STRIPE_SECRET_KEY=<sk_test_...> NEXT_PUBLIC_APP_URL=https://<APP_DOMAIN> npx tsx scripts/stripe-setup.mts; cd ../..
```
Set every variable for Production and Preview (`vercel env add <NAME> production` and `vercel env add <NAME> preview`, pasting each value):
- **Site:** `NEXT_PUBLIC_APP_URL`, `INBOUND_DOMAIN`
- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from `mcp__claude_ai_Supabase__get_project_url` and `get_publishable_keys`), plus `SUPABASE_SERVICE_ROLE_KEY` (the founder copies it from the dashboard)
- **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_P9`, `STRIPE_PRICE_P19`
- **Foundry:** `FOUNDRY_ATTRIBUTION_KEY` (generate it with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and share it with foundry's operator)
- **Flags:** `ELSEWHERE_ENABLE_FUNNEL_TELEMETRY=true`, `TRIPS_OPEN=false`

Leave the affiliate URLs unset until each program approves.

Live keys replace test keys only when the founder says the payment test should take real money. When that happens, rerun the script with the live key.

- [ ] **Step 6: [Founder confirms] Deploy a preview, smoke it, then promote to production**

```bash
vercel deploy --cwd apps/web
```
Smoke the preview URL (`PREVIEW`):
```bash
PREVIEW=<preview url>
for p in / /rules /opengraph-image /start; do curl -s -o /dev/null -w "$p %{http_code} %{content_type}\n" "$PREVIEW$p"; done
curl -s -o /dev/null -w "/r %{http_code} %{redirect_url}\n" "$PREVIEW/r/smoke-1?p=tt"
curl -s -o /dev/null -w "/api/attribution %{http_code}\n" "$PREVIEW/api/attribution?since=2026-10-01"
curl -s -o /dev/null -w "/api/webhooks/stripe %{http_code}\n" -X POST -d '{}' "$PREVIEW/api/webhooks/stripe"
```
Expected:
- `/`, `/rules`, and `/start` return `200 text/html`.
- `/opengraph-image` returns `200 image/png`.
- `/r` returns `307`, with a redirect URL containing `/rules?utm_source=tiktok`.
- `/api/attribution` returns `401`.
- `/api/webhooks/stripe` returns `400`.

If a protected preview returns 401 on every path, use the `vercel:access-protected-vercel-deployment` skill to get a bypass for curl.

After the founder confirms:
```bash
vercel deploy --cwd apps/web --prod
```
Repeat the smoke commands against `https://<APP_DOMAIN>`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/scripts/stripe-setup.mts
git commit -F - <<'EOF'
Add an idempotent Stripe setup script for the trip pass

Creates the product, the $9 and $19 prices by lookup key, and the
checkout webhook endpoint, and prints the environment values to set.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 13: Swap the interim art for foundry's cast-bible exports

Run this whenever foundry's cast bible exports exist. It does not block Task 14. If they don't exist yet, leave this task unchecked and come back.

**Files:**
- Modify: `apps/web/public/characters/*.png`

- [ ] **Step 1: Check for the exports**

```bash
ls ~/Github/foundry/accounts/go-elsewhere/sheets/{capybara,owl,raccoon,pigeon}.png
```
Expected: four files. If any are missing, stop here. Track B's cast-bible task produces them: one full-body PNG per character on a flat or transparent background.

- [ ] **Step 2: Cut the new assets and check them by eye**

```bash
cd apps/web && python3 scripts/cut-characters.py portraits ~/Github/foundry/accounts/go-elsewhere/sheets; cd ../..
```
Use the Read tool on each new `public/characters/<name>.png` and `<name>-avatar.png`. Each should show one character, a transparent background, and a head-and-shoulders avatar. If foundry also exports a gate scene at `~/Github/foundry/accounts/go-elsewhere/scenes/raccoon-gate.png`, copy it to `public/characters/scenes/raccoon-gate.png`, then fix the landing page `height` to match its size.

- [ ] **Step 3: Rebuild, view the landing OG image, and commit**

```bash
cd apps/web && npx vitest run test/characters.test.ts && npm run build && (npx next start -p 3100 & sleep 4; curl -s -o /tmp/og-landing.png http://localhost:3100/opengraph-image; kill %1); cd ../..
```
Use the Read tool on `/tmp/og-landing.png`. Then commit:
```bash
git add apps/web/public/characters
git commit -F - <<'EOF'
Replace the interim cast art with foundry's cast-bible exports

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

### Task 14: [Founder confirms] Merge the restart branch to `main`

Track A's scheduled GitHub workflows only run from `main`, and Vercel production should track `main`. This is the last C1 task.

- [ ] **Step 1: Confirm the branch is green**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
cd apps/web && npx vitest run && npm run typecheck && npm run build; cd ../..
git status --short && git log --oneline main..HEAD | head -40
```
Expected: tests pass, typecheck is clean, the build succeeds, the working tree is clean, and the commit list shows the restart commits.

- [ ] **Step 2: [Founder confirms] Push and open the pull request**

```bash
git push -u origin HEAD
gh pr create --base main --title "Restart Elsewhere as group-trip Assist: foundation and public funnel" --body-file - <<'EOF'
Collapses the monorepo into one Next.js 16 app, restructures the Supabase schema for group-trip Assist, and ships the public funnel: rule pages with the cast, the $9/$19 trip-pass payment test, post attribution for foundry, and money pages.

Specs: docs/superpowers/specs/2026-10-01-elsewhere-restart-program.md and 2026-10-01-group-trip-web-app-design.md.
Plan: docs/superpowers/plans/2026-10-01-track-c1-foundation-and-funnel.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

- [ ] **Step 3: [Founder confirms] Merge**

After the founder approves the PR:
```bash
gh pr merge --merge --delete-branch=false
```
Then, in the Vercel project settings, set the Production Branch to `main`. Future production deploys come from `main`.

---

## Self-Review Notes (C1 against the spec)

| Spec requirement | Task |
|---|---|
| Merge apps/web and apps/api; delete apps/mobile after the archive tag; fold packages/shared; keep packages/rules a package | 1, 4 |
| One migration `00012` with every C1+C2 table, `is_trip_member`/`is_trip_planner`, RLS, and minimal document data | 2 |
| Rule pages prerendered from `dist/rules.json`, needs_review banner, sources and quotes, lead character art, offer at the end | 4, 5, 6, 7 |
| `$9`/`$19` variants by `anonymous_id` cookie, funnel events, Stripe Checkout and webhook, passes, comps excluded | 3, 7, 9 |
| `/r/[postId]` and `/api/attribution` for foundry | 10 |
| `/money/[slug]` affiliate pages with FTC disclosure | 11 |
| Production domain (founder confirms), Vercel deploy | 12 |
| Cast in the app: assets, `Character`, OG images for landing, rules, and money | 5, 6, 11, 13 |
| Travel admin repurposed: official route plus optional affiliate fallback per document kind | 2 (schema and seed); C2 Task 8 uses it |
| Merge to `main` so Track A's workflows run | 14 |

Left to C2 by design:
- phone OTP and join
- intake
- document checks
- monitoring
- incidents and playbooks
- notifications
- votes
- who-owes-what
- `/admin`
- e2e
- the join-link OG image
- the in-app character slots beyond the trips empty state

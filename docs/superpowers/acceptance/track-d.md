# Track D acceptance and distribution log

## Deploy (Task 12)
- Migration 00020 applied: 2026-10-05 via the Supabase Management API (`database/migrations`), version `20261005204443`, together with 00012 and 00013 on the then-empty production project. Security advisors show only intended items (RLS on with no policies for service-role tables; trip functions executable by `authenticated`).
- Firewall: the project is on Vercel Hobby, which allows one rate-limit rule. Live: `rules-api-mcp per IP`, path starts with `/api/rules` OR path equals `/api/mcp`, 60 requests / 60 s per IP, fixed window, action 429.
  - The planned `@vercel/firewall` SDK rules (`rules-api-anon`, `rules-mcp-anon`, `rules-partner`) are not configured. A rule keyed on the SDK's rate-limit ID counted the IP that calls the check (the function's egress IP), not the visitor's, so it never limited a visitor and could throttle unrelated visitors sharing an egress IP. The edge path rule counts the real client IP.
  - With no matching SDK rule, `enforceRateLimit` gets `not-found` and fails open with a warning, as designed. Partner keys (none issued yet) have no separate limit until a paid plan.
- Rate-limit check (production): 80 parallel requests to `/api/rules/facts` → 60 × 200, 20 × 429. Rule pages under `/rules` are unaffected.
- Production deployment: https://go-elsewhere.vercel.app · library_version `2026-10-05.5c34fa5` · 21 verified rules.

## Agent acceptance (Task 13)
Tool-level check over HTTP on 2026-10-05 (not yet in the founder's ChatGPT or Claude accounts): `search_rules` "cancelled flight refund" returns `us-dot-refund-cancelled-flight`; `get_rule` quotes 14 CFR 260 word for word, links the rule page with `utm_source=mcp`, and says "Not legal advice." `rules_api_events` recorded each call.

| Client | Date | Tools called | Citation quoted | utm_source=mcp link | Not-legal-advice line | Pass |
|---|---|---|---|---|---|---|
| ChatGPT developer mode | | | | | | |
| Claude custom connector | | | | | | |

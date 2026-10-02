# Track D — Rules API and MCP Server

**Date:** 2026-10-01
**Status:** Approved in brainstorming, pending written-spec review
**Program:** [`2026-10-01-elsewhere-restart-program.md`](2026-10-01-elsewhere-restart-program.md)
**Depends on:** [`2026-10-01-rules-library-design.md`](2026-10-01-rules-library-design.md) (track A)

## Goal

Expose the verified rules library to AI agents and partners. AI agents are a channel,
not only competitors. When someone asks ChatGPT, a Dot, or Claude "my flight was
cancelled, what am I owed?", the answer should come from Elsewhere's verified rules,
cite the primary source, and link to the Elsewhere rule page. That page carries the paid
offer, so agent traffic feeds the same funnel as social traffic.

Success: the MCP server is connected and answering correctly in ChatGPT developer mode
and as a Claude custom connector, listed in the official MCP registry, and showing
agent-referred visits on rule pages.

## Non-goals

- User data. Track D serves only public rule data, so v1 needs no user accounts and no
  OAuth.
- Write tools. Every tool is read-only.
- Draft rules. They are never returned on any surface.
- Legal advice. Responses say what the rule says and link the source.

## Where it lives

Inside the track C Next.js app on Vercel, importing `@elsewhere/rules` directly:

```
app/api/rules.json/route.ts          # full artifact
app/api/rules/route.ts               # search
app/api/rules/[id]/route.ts          # one rule
app/api/rules/match/route.ts         # situation → rules
app/api/rules/changes/route.ts       # recent changes
app/api/mcp/route.ts                 # MCP server (mcp-handler)
app/(public)/rules/terms/page.tsx    # API and MCP terms of use
```

**MCP hosting:** `mcp-handler` 2.2.0 (Vercel's adapter, checked on npm 2026-10-01). It is
built on MCP SDK v2 (`@modelcontextprotocol/server` 2.2.0, with `zod@^4`). It serves the
2026-07-28 MCP specification statelessly, falls back to 2025-era Streamable HTTP from the
same handler, and needs no Redis. `withMcpAuth` provides bearer-token checks for the
partner tier.

## Public read API

| Endpoint | Returns |
|---|---|
| `GET /api/rules.json` | The full artifact: every non-draft rule with its status. This is the file foundry reads with `RULES_SOURCE=url:` |
| `GET /api/rules?q=&domain=&jurisdiction=&status=` | A search over title, summary, and tags, filtered by domain, jurisdiction, and status |
| `GET /api/rules/:id` | One rule. Drafts and unknown IDs both return 404 |
| `POST /api/rules/match` | Takes a situation as `{ "facts": { "event.type": "cancellation", ... } }` and returns three groups: `applies`, `may_apply` (each with its `missing_facts`), and a `does_not_apply` count |
| `GET /api/rules/changes?since=<date>` | Rule versions added, changed, moved to `needs_review`, or retired since the date |
| `GET /api/rules/facts` | The facts vocabulary, with each fact's type, allowed values, and description |

`match` validates every fact name and value type against `facts.ts`. It then runs the same
`match()` function track A tests, so the API and Assist can never disagree.

### Response envelope

```json
{
  "schema_version": 1,
  "library_version": "2026-10-06.a1b2c3d",
  "data": { },
  "attribution": {
    "text": "Rules verified by Elsewhere from primary sources. Not legal advice.",
    "required": true
  }
}
```

### Public rule projection

Every surface returns the same shape:

- **Identity and status:** `id`, `version`, `status`, `domain`, `jurisdiction`.
- **The rule itself:** `title`, `summary`, `entitlement`, `how_to_claim.steps`,
  `exceptions`.
- **Citations:** a list of `{ url, kind, quote }` taken from `sources` and `sources.yaml`.
- **Freshness:** `last_verified` and `review_by`.
- **Funnel link:** `page_url`.

`needs_review` rules carry `notice: "Being re-checked since <date> after a source
change."` Retired rules carry `replaced_by` when one exists. Internal fields such as
`lead_character`, `verified_by`, and `templates` are not exposed.

## MCP server

**Server instructions** (sent at initialization, so every client reads them):
- Answer from these tools.
- Quote at least one citation.
- Include the rule's `page_url`.
- Describe `needs_review` rules as being re-checked.
- Say that this is information, not legal advice.

| Tool | Input | Output |
|---|---|---|
| `search_rules` | `query`, optional `domain`, `jurisdiction` | Up to 10 rule summaries with status and `page_url` |
| `get_rule` | `id` | The full public projection |
| `match_situation` | `facts` (validated against the vocabulary) | Rules that apply, rules that may apply plus the facts still needed, and citations |
| `list_facts` | none | The vocabulary, so an agent can build a valid `match_situation` call |
| `list_recent_changes` | `since` | Version changes, with the affected rule IDs |

Every tool:
- is annotated `readOnlyHint: true`;
- returns structured content plus a short text block ending in the source link and the
  rule page link;
- never returns a draft.

Read-only matters for ChatGPT. Plus and Pro users can install a custom connector and
call read-only tools, while write-shaped tools are disabled there. Track D's whole
surface fits that limit.

### Attribution and the funnel

- **Tagged links.** Every `page_url` carries `utm_source=mcp` and
  `utm_medium=<client name from MCP clientInfo>`. The API uses `utm_source=api` and the
  key's partner ID.
- **Required attribution.** The terms require agents and partners to show the
  attribution text and link when they use a rule.
- **The page.** The rule page (track C) carries the "forward your group's bookings"
  offer.
- **Tracking.** Agent-referred visits, forwards, and payments are tracked as their own
  funnel segment. They show whether AI agents are a real channel.

## Distribution

| Channel | How | When |
|---|---|---|
| ChatGPT (including Dots) | Connect the public HTTPS `/api/mcp` URL in developer mode on the founder's Pro account (Streamable HTTP, no auth) and test end-to-end. Then submit to the ChatGPT app directory, whose review continues for later tool updates | Connect in v1. Submit once 30 rules are verified |
| Claude | Add as a custom connector by its remote MCP URL. Submit to Anthropic's connector directory | Same as ChatGPT |
| Official MCP registry | Publish a `server.json` to `registry.modelcontextprotocol.io` through the registry CLI. The namespace starts as `io.github.ifaemuh/elsewhere-rules`, proven by GitHub login, and moves to the product domain's reverse-DNS namespace once the domain is set. Downstream directories ingest the registry automatically | v1 |
| Any MCP client | The same URL works for Cursor, agent frameworks, and other MCP clients | v1 |

## Auth, limits, and abuse

- **Anonymous tier:** no key, per-IP limits.
  - Limits: 60 API requests per minute, and 30 MCP tool calls per minute.
  - Enforcement: `@vercel/firewall` `checkRateLimit` against rate-limit rules configured
    in Vercel Firewall. Over the limit returns 429 with `Retry-After`.
- **Partner tier:** an `Authorization: Bearer <key>` header.
  - Keys are stored hashed in a Supabase table, `api_keys`: partner, tier, per-minute
    limit, created, revoked.
  - On MCP, `withMcpAuth` verifies the key, so anonymous and keyed clients share the
    same endpoint.
  - Partners get higher limits now, and bulk export and change webhooks in v2.
- **Abuse:** Vercel Firewall handles bots and DDoS. A client that repeatedly hits limits
  across many IPs gets a custom WAF rule, not code changes.

## Caching and versioning

- **`library_version`:** the build date plus a short content hash of `dist/rules.json`.
  It appears in every response and doubles as the `ETag`. `If-None-Match` returns 304.
- **When rules change:** only by merging to `main`, which triggers a deploy. Read
  endpoints are therefore cached with
  `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`, and a new
  deployment serves the new library. No manual invalidation is needed.
- **`match`:** a pure, fast function over an in-memory library, computed per request and
  not cached.
- **`schema_version`:** bumps only on a breaking change to the projection or envelope.
  Foundry pins to it, and a bump fails its contract test until it updates.

## Terms of use

`/rules/terms` states:
- Rules are informational, not legal advice, and users should check the cited source.
- Attribution and a link are required.
- AI agents may answer users from the data with attribution.
- Bulk redistribution or resale needs a partner key.
- No warranty. Rules marked `needs_review` may be out of date.

The short disclaimer travels in every envelope and every MCP text block, so it survives
being quoted out of context.

## Analytics

Each API call and tool call writes one row to the Supabase table `rules_api_events`:

| Field | Notes |
|---|---|
| Surface | API or MCP, plus the endpoint or tool name |
| Client | MCP `clientInfo` name and version, or the user agent |
| Tier and key | Tier, and partner key ID if any |
| Rules | Rule IDs returned |
| Facts | Fact names provided, plus `event.type`. No other fact values are stored |
| Search query | Truncated to 200 characters, with email and phone patterns removed |
| Result | Result count |
| Version and timing | `library_version` and latency |

IP addresses are used only for rate limiting and never stored.

A weekly report shows:
- the most-queried rules, which drive content topic selection in foundry;
- searches with zero results, which become track A backlog items and post ideas;
- the most common `missing_facts`, which point to gaps in the facts vocabulary;
- agent-referred funnel conversions.

## Error handling

| Case | Response |
|---|---|
| Unknown fact name or wrong value type | 400 listing the offending facts and pointing to `list_facts` |
| Draft or nonexistent rule ID | 404, with no difference between the two |
| Retired rule | 200 with `status: retired` and `replaced_by` |
| `needs_review` rule | 200 with its `notice` |
| Rate limited | 429 with `Retry-After` |
| Revoked or invalid partner key | 401 |
| MCP tool failure | `isError: true` with a plain message and no stack trace |
| Library failed to load | 503. The build fails first if `rules:build` fails, so this means a bad deploy |

## Testing

- **MCP contract tests:** an in-process MCP SDK client calls every tool through the
  handler. It asserts the output schema, that citations and `page_url` are present, that
  no draft is ever returned, and that `readOnlyHint` is set.
- **Shared golden match cases:** situations and their expected classifications live in
  `packages/rules/test/fixtures/match/`. Track A's matcher tests and track D's
  `POST /api/rules/match` tests run the same fixtures, so the API can't drift from the
  matcher.
- **Artifact contract:** `rules.json` is validated against its published schema at
  `schema_version`. Foundry runs the same check from its side.
- **Rate limits:** a short load run against a preview deployment confirms 429 behavior.
- **Manual acceptance:** in ChatGPT developer mode and in a Claude custom connector, ask
  "My American flight from JFK was cancelled and I don't want the new flight — what am I
  owed?" Confirm the answer cites a primary source and links the rule page.

## Dependencies on track A

Track A's `rules:build` must:
- emit `schema_version` and `library_version` in `dist/rules.json`;
- emit a changes list derived from rule `version` bumps and git history;
- export the facts vocabulary with descriptions.

The golden match fixtures live in `packages/rules/test/fixtures/match/`.

## Phasing

**v1** ships with the first 10 verified rules:
- the read API and the MCP server, anonymous tier;
- the ChatGPT developer-mode and Claude custom-connector acceptance tests;
- an official MCP registry listing;
- analytics.

Directory submissions to ChatGPT and Anthropic wait for all 30 rules, so reviewers see
a complete product.

**v2:** partner keys in use, bulk export, and change webhooks that POST to a partner when
a rule they track changes.

**Paid partner tier.** Target partners are OTAs, travel insurers, travel agents, and
builders of AI travel agents. Charging starts only when all four gates hold:
1. **Coverage:** at least 100 verified rules across all four domains, including
   per-airline commitments for the top US carriers.
2. **Reliability:** the refresh loop has run 60 days with no missed source change, as
   measured by the nightly quote-check backstop.
3. **Demand:** at least three partners have asked for keys or exceeded free limits.
4. **Liability:** a lawyer has reviewed the terms. Charging invites reliance, so the
   no-warranty and attribution terms must hold up before money changes hands.

## Deliverables

1. The read API endpoints and envelope, with caching and ETags.
2. The MCP server at `/api/mcp` with five read-only tools and server instructions.
3. Rate limits through Vercel Firewall, and the partner-key table and auth path.
4. The terms page, analytics events, and the weekly report.
5. Passing contract, golden-match, and artifact tests.
6. Live in ChatGPT developer mode, as a Claude custom connector, and in the MCP registry.

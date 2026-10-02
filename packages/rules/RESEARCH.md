# Researching a rule

How a rule gets from the backlog into `data/`. Every step is required. The quote check and
the data-case test enforce most of it. The rest is on the researcher.

## 1. Pick the item and its sources

- Take the next backlog item (track A spec, "Initial backlog"), or a rule named in a
  staleness, backstop, or refresh PR.
- List the primary sources that state the rule: the regulation, the government agency,
  the EU or UK authority, the airline's own contract of carriage or customer service
  plan, or the card issuer's benefit guide. Blogs, news, forums, and OTAs are never
  sources.
- Every source must be a key in `sources.yaml`. If one is missing, add it in the same PR,
  plus an `ota-overrides.yaml` entry if the page needs a narrower `select` or client
  scripts.

  **A new source and a rule that cites it go in two PRs.** CI checks every new quote
  against the tracked text, and a source's text does not exist until the tracker has run,
  so one PR with both can never go green. First open a PR with the source only, merge it,
  and dispatch the tracker (`gh workflow run sources-track.yml --repo ifaemuh/elsewhere`).
  When `elsewhere-sources-versions` has the file (step 2), open the rule PR.

## 2. Quote the tracked text, not the live page

The quote check reads `elsewhere-sources-versions`, so copy quotes from there:

```bash
git clone https://github.com/ifaemuh/elsewhere-sources-versions /tmp/sources-versions \
  || git -C /tmp/sources-versions pull
```

| Detector | File |
|---|---|
| `ota` | `<service>/<terms_type>.md` |
| `ecfr` | `eCFR/title-<title>-part-<part>.md` |

## 3. Write the rule file

Create `data/<domain>/<id>.yaml`. Field by field:

| Field | Rule |
|---|---|
| `id` | kebab-case, prefixed by its family (`us-dot-`, `eu261-`, `uk261-`, `dl-`, `chase-`). Never changes |
| `version`, `status` | `1`, `draft` |
| `last_verified`, `verified_by`, `review_by` | `null` |
| `history` | one entry: `- { version: 1, status: draft, date: <today> }` |
| `title` | ≤ 120 characters. The traveler's question, answered: "Cancelled flight? You're owed cash, not a voucher" |
| `summary` | ≤ 400 characters. What the rule gives and when. No hedging the source doesn't use |
| `applies_when` | Only facts from `src/facts.ts`. Mirror the source's scope and thresholds exactly. For exceptions the airline has to prove (extraordinary circumstances), use `event.cause in [controllable, unknown]`: an unknown cause still applies, and an absent cause makes the rule `may_apply` so Assist asks |
| `entitlement` | `kind`, then `amount` and `timing` exactly as the source states them |
| `how_to_claim.steps` | What the traveler does, in order, imperative mood |
| `how_to_claim.templates` | snake_case names of message templates track C renders, e.g. `airline_refund_request`, `eu261_claim_letter` |
| `exceptions` | Every limitation the source states |
| `sources[].quotes` | See below |
| `lead_character` | See below |
| `tags` | Lowercase topic words |

If a condition needs a fact that doesn't exist, stop. First amend
`docs/superpowers/plans/2026-10-01-rules-package-interface.md` and `src/facts.ts` in their
own commit, then write the rule.

**Quotes**
- Copy contiguous text from the tracked file. Never paraphrase, fix a typo, or join two
  sentences.
- A quote must not cross markdown formatting in the tracked file (link brackets, `**`,
  `_`, list markers, headings). If a sentence contains a link or emphasis, quote the part
  before or after it, or use two quotes.
- `supports` lists every rule field the quote backs: `summary`, `applies_when`,
  `entitlement.amount`, `exceptions`, `how_to_claim.steps.0`. Both `summary` and
  `entitlement` must be backed.

**Lead character**

| Topic | Character |
|---|---|
| It already went wrong: bumping, tarmac delays, missed connections, lost bags | `raccoon` |
| Rules and deadlines: the 24-hour rule, passport validity, entry permits | `owl` |
| Money owed and perks: refunds, compensation, card coverage | `pigeon` |
| The calm fix: right to care, what happens next | `capybara` |

## 4. Write the cases

Create `test/data-cases/<id>.yaml` with at least one `applies`, one `may_apply`, and one
`does_not_apply` case. Put cases on both sides of every threshold (179 and 180 minutes).

```yaml
rule: us-dot-refund-cancelled-flight
cases:
  - name: declined the rebooking
    situation: { event.type: cancellation, flight.touches_us: true, passenger.accepted_alternative: false }
    outcome: applies
  - name: has not decided yet
    situation: { event.type: cancellation, flight.touches_us: true }
    outcome: may_apply
    missing_facts: [passenger.accepted_alternative]
  - name: took the voucher
    situation: { event.type: cancellation, flight.touches_us: true, passenger.accepted_alternative: true }
    outcome: does_not_apply
```

## 5. Check locally

```bash
npm test -w @elsewhere/rules
npm run rules:build -w @elsewhere/rules
npm run rules:check-quotes -w @elsewhere/rules -- --versions /tmp/sources-versions
```

All three must pass before the PR.

## 6. Open the PR (the founder confirms before it is opened)

Branch `rules/add-<short-name>`, title `Rules: add <ids>`. Body, once per rule:

```markdown
### <id> — <title>
**Says:** <summary>
**Applies when:** <the conditions in plain words>
**Sources:** <key> — <section or heading the quotes come from>
**Quotes:**
> <quote 1>
> <quote 2>
**Unsure about:** <anything a reviewer should look at first, or "nothing">
```

## 7. Approval

The founder reviews, at about two minutes per rule, and merges. Then, from a fresh branch
off `main` (main is protected; nothing is pushed to it directly):

```bash
git switch main && git pull && git switch -c rules/verify-<date>
npm run rules:verify -w @elsewhere/rules -- <id> [<id> ...] --by ifaemuh
git commit -am "Verify rules: <ids>"
git push -u origin HEAD && gh pr create --base main --fill
```

`rules:verify` sets `status: verified`, `last_verified`, `verified_by`, and `review_by`
(+90 days), and appends the verified history entry. Merge that PR once Rules CI is green.

## Changing a verified rule

- **What the rule says changes:** `version` + 1, `status: needs_review`, and append
  `- { version: <new>, status: needs_review, date: <today>, note: "<one line: what changed>" }`.
  Same PR flow. After approval, `rules:verify` appends the verified entry.
- **A quote's wording moved but the meaning didn't:** update the quote `text` only. No
  version, status, or history change.
- **Retiring:** `status: retired`, append a retired history entry with a note, and set
  `replaced_by` if another rule supersedes it.
- **Never** edit or delete past history entries.

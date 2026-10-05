# Muse with and without Elsewhere

Meta's Muse agent (US launch 2026-09-08) can act: draft and send emails, file claims, rebook through Duffel. It has no verified rules library. This test measures what the Elsewhere MCP connector adds when the same traveler questions go to Muse twice:

- **Run A:** Muse with no Elsewhere connector.
- **Run B:** Muse with the Elsewhere custom connector enabled (Task 13, Step 3).

Each run starts a new Muse chat per scenario. Paste the prompt exactly.

## Before you run

- Run B needs the production `/api/mcp` (Task 12) and the rules below at `status: verified` on the deployed library. The matcher ignores drafts, so a draft rule returns nothing in Run B.
- These situations are made up. Muse asks for approval before sending any email. **Decline every send.** Never let it contact a real airline about a test scenario.
- Run A first for all scenarios, then Run B, so Run A isn't influenced by the connector being on.

## Scoring

Score each run per scenario:

| Column | Pass when |
|---|---|
| Outcome | Says correctly whether something is owed |
| Amount and form | Right amount (or care owed) and form: cash or original payment, not a voucher, where the rule says so |
| Source | Names the primary source: the CFR section or EU Regulation 261/2004 |
| Trap | Avoids the trap listed for the scenario |
| Link (Run B only) | Includes the Elsewhere rule page link with `utm_source=mcp` |
| Tools (Run B only) | Called `match_situation` or `search_rules`/`get_rule` |

## US scenarios (14 CFR Parts 250, 259 and 260)

### 1. Voucher instead of a refund
> American cancelled my flight from JFK to Chicago. They offered me a $300 travel credit, and my fare was $420. I don't want to fly anymore. Should I take the credit?

- **Rule:** `us-dot-refund-cancelled-flight`
- **Correct:** if they decline the rebooking and the credit, they are owed a full $420 refund including taxes and fees, to the original form of payment. That's within 7 business days for a credit card, or 20 calendar days for other payment. Taking the credit gives up the refund.
- **Trap:** treating the credit as a fair offer, or suggesting they take it.

### 2. Credit added without asking
> United cancelled my flight and just put a travel credit in my account. I never agreed to it. Am I stuck with the credit?

- **Rule:** `us-dot-refund-cancelled-flight`
- **Correct:** no. An airline can't treat the traveler as having accepted a credit unless they affirmatively agreed. A full refund is still owed.
- **Trap:** "the credit has been issued, so the refund option is gone."

### 3. Domestic delay, not flying
> My Denver to Austin flight is delayed. The new arrival time is 3 and a half hours later than planned. I don't want to go anymore. Do I get anything back?

- **Rule:** `us-dot-refund-significant-change`
- **Correct:** yes. A domestic itinerary arriving 3 or more hours late counts as significantly changed. If they decline it and any rebooking or voucher, they're owed a full refund.
- **Trap:** "US airlines don't owe anything for delays." That's true for compensation but wrong for a refund when you don't travel.

### 4. International delay under the threshold
> My American flight from Chicago to Mexico City is delayed 4 hours. I'd rather not go. Am I owed a refund?

- **Rule:** `us-dot-refund-significant-change` (should not match)
- **Correct:** the arrival-time trigger for international itineraries is 6 hours, so a 4-hour delay alone doesn't qualify. A different airport, more connections or a downgrade would.
- **Trap:** promising a refund.

### 5. Paid seat not provided
> I paid $45 for an extra-legroom seat on United from Newark to Denver. They swapped the plane and put me in a regular seat. Can I get the $45 back?

- **Rule:** `us-dot-refund-service-not-provided`
- **Correct:** yes. They're owed a refund of the $45 fee to the original form of payment. Telling the operating airline the service wasn't provided counts as the refund request.
- **Trap:** offering miles or a voucher as the remedy.

### 6. Delayed bag
> I flew Delta from Atlanta to Boston. My checked bag showed up 14 hours after I landed. I filed a report at the baggage desk. I paid $35 to check it. Do I get that back?

- **Rule:** `us-dot-bag-fee-refund-delayed-bag`
- **Correct:** yes. On a domestic itinerary, more than 12 hours is significantly delayed, and they filed a Mishandled Baggage Report, so the $35 fee is refunded.
- **Trap:** only talking about interim expenses, or saying bag fees are never refunded.

### 7. 24-hour cancellation, booked direct
> I booked a United flight on united.com 20 hours ago. The flight is next month. Can I cancel for free?

- **Rule:** `us-dot-24-hour-cancellation`
- **Correct:** yes, if they cancel within 24 hours of booking (about 4 hours left). The trip was booked at least a week ahead, so the airline must offer either a 24-hour hold at the quoted fare or a penalty-free cancellation. If it took payment, they get a full refund.
- **Trap:** the wrong clock (24 hours before departure), or missing that the time is nearly up.

### 8. 24-hour cancellation, booked through Expedia
> I booked a flight on Expedia 20 hours ago. The flight is next month. Does the airline's 24-hour free cancellation rule cover me?

- **Rule:** `us-dot-24-hour-cancellation` (should not match)
- **Correct:** the rule covers bookings made directly with the airline. For an Expedia booking, the agency's own cancellation policy applies.
- **Trap:** saying the federal 24-hour rule covers all bookings.

### 9. Bumped, rebooked 1.5 hours later
> I got bumped from an oversold American flight from Dallas to Phoenix. I didn't volunteer. My one-way fare was $250. They rebooked me on a flight landing an hour and a half after my original. What am I owed?

- **Rule:** `us-dot-bumping-compensation`
- **Correct:** 200% of the one-way fare, which is $500 (cap $1,075), in cash or an immediately negotiable check.
- **Trap:** accepting a gate voucher as the only option, or applying volunteer terms.

### 10. Bumped, rebooked 3 hours later
> Same as before: bumped involuntarily from an oversold American flight from Dallas to Phoenix, $250 fare. But the new flight lands 3 hours after my original. What am I owed?

- **Rule:** `us-dot-bumping-compensation`
- **Correct:** 400% of the fare, which is $1,000 (cap $2,150), in cash or check.
- **Trap:** using the 200% tier.

### 11. Tarmac delay
> We've been sitting on the plane at O'Hare for 2 hours and 15 minutes on our American flight to Miami. No water, no updates. What do they have to do?

- **Rule:** `us-dot-tarmac-delay-limits`
- **Correct:** status updates once the delay passes 30 minutes. Food and drinking water no later than 2 hours in, so it's overdue. A chance to get off before 3 hours (domestic, US airline). Working lavatories. Safety, security or air traffic control exceptions can apply.
- **Trap:** saying nothing is owed until 3 hours.

## EU scenarios (Regulation (EC) No 261/2004)

### 12. Leaving Paris on a US airline, 5 hours late
> My Delta flight from Paris CDG to New York JFK arrived 5 hours late. The airline didn't give a reason. Am I owed anything?

- **Rule:** `eu261-delay-compensation`
- **Correct:** yes. A flight leaving the EU is covered whatever the airline. CDG to JFK is over 3,500 km, so it's EUR 600, unless the airline proves extraordinary circumstances.
- **Trap:** saying EU rules don't apply because Delta is a US airline.

### 13. Flying into Paris on a US airline, 5 hours late
> My Delta flight from New York JFK to Paris CDG arrived 5 hours late. Am I owed EU261 compensation?

- **Rule:** `eu261-delay-compensation` (should not match)
- **Correct:** no. A flight arriving in the EU from outside it is covered only when the operating airline is an EU airline, and Delta isn't one.
- **Trap:** promising EUR 600. This is the most common mistake general assistants make.

### 14. Cancelled with 10 days' notice
> Iberia cancelled my flight from Rome to Madrid 10 days before departure. They rebooked me on a flight that landed 5 hours after my original arrival. Do I get compensation?

- **Rule:** `eu261-cancellation-compensation`
- **Correct:** yes. With 7 to 13 days' notice, compensation is owed unless the rerouting arrived less than 4 hours late, and this one was 5. Rome to Madrid is about 1,330 km, which is the EUR 250 band. Accepting the rerouting doesn't cost them this.
- **Trap:** "you were notified, so nothing is owed," or the wrong distance band.

### 15. Two-and-a-half-hour departure delay
> My flight from Paris to Rome is now leaving 2 and a half hours late. What does the airline owe me while I wait?

- **Rule:** `eu261-right-to-care`
- **Correct:** for flights of 1,500 km or less, after 2 hours the airline must provide meals and refreshments in proportion to the wait and two calls or emails, free of charge, plus a hotel and transport if an overnight stay becomes necessary. No cash compensation unless they reach the final destination 3 or more hours late.
- **Trap:** promising cash compensation.

### 16. Missed connection on separate tickets
> I flew TAP from Lisbon to Amsterdam, then had a separate KLM ticket on to Singapore. The first flight was 2 hours late and I missed the second. Is KLM or TAP responsible?

- **Rule:** `eu261-delay-compensation` (should not match)
- **Correct:** EU261 protects missed connections only when the flights are on a single reservation, so this miss isn't covered. The first flight was under 3 hours late, so it earns no compensation on its own.
- **Trap:** treating separate tickets like one booking.

## Acting on it (Run B only)

Muse's strength is acting. For scenarios 1, 9 and 12, follow up in the same chat:

> Draft the claim to the airline for me.

Pass if the draft:
- asks for the right amount in the right form (cash refund, cash or check, EUR 600),
- cites the rule's primary source,
- includes no facts the traveler didn't give,
- and Muse stops for approval before sending. Decline the send.

## Results

| # | Run A outcome | A amount | A source | A trap | Run B outcome | B amount | B source | B trap | B link | B tools |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | |
| 2 | | | | | | | | | | |
| 3 | | | | | | | | | | |
| 4 | | | | | | | | | | |
| 5 | | | | | | | | | | |
| 6 | | | | | | | | | | |
| 7 | | | | | | | | | | |
| 8 | | | | | | | | | | |
| 9 | | | | | | | | | | |
| 10 | | | | | | | | | | |
| 11 | | | | | | | | | | |
| 12 | | | | | | | | | | |
| 13 | | | | | | | | | | |
| 14 | | | | | | | | | | |
| 15 | | | | | | | | | | |
| 16 | | | | | | | | | | |

Claim drafts (scenarios 1, 9, 12): amount and form · source cited · no invented facts · stopped for approval.

A failing Run B row where Run A also failed is a library or tool-wording problem: fix it with a TDD change in `lib/mcp/` and re-run that scenario. A Run A failure that Run B fixes is a test result Foundry can use for content.

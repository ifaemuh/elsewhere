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
  REFUND_RULE,
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
    await page.goto(`/rules/${REFUND_RULE}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Cancelled flight\?/);
    await page.getByRole('region', { name: /Forward your group’s bookings/ }).getByRole('link', { name: 'Start a trip' }).click();
    await page.waitForURL((url) => url.pathname === '/start' && url.searchParams.get('rule') === REFUND_RULE);
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
    await expect(page.getByText('TAP Air Portugal').first()).toBeVisible();
    await expect(page.getByText(/TP 204 · EWR → LIS/)).toBeVisible();
    await page.getByRole('button', { name: /Confirm/ }).click();
    // The confirmBookingsWorkflow looks the flight up; the segment gains its schedule and countries.
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
    // Fetched by path, so the check holds whatever origin the metadata names.
    const image = await request.get(new URL(ogImage!, joinUrl).pathname);
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

    // A member puts only themselves on a booking: toggleAssignment calls claim_booking_seat for them.
    await memberPage.goto(`/trips/${tripId}/bookings`);
    await memberPage.getByRole('button', { name: 'Mo Member', exact: true }).click();
    const { data: me } = await db().from('trip_members').select('id').eq('trip_id', tripId!).eq('user_id', member.id).single();
    const seats = await pollRow(
      () => db().from('booking_members').select('member_id, self_claimed').eq('trip_id', tripId!),
      (rows) => rows.length === 2 && rows.some((row) => row.member_id === me!.id),
    );
    // The member's own row is a self-claim; the planner's match from intake is not. A self-claim does not show the
    // member the confirmation code until the planner confirms them, so the code is deliberately not asserted here.
    expect(seats.find((row) => row.member_id === me!.id)?.self_claimed).toBe(true);
    expect(seats.filter((row) => row.self_claimed)).toHaveLength(1);
  });

  await test.step('a paid pass starts watching the flight', async () => {
    const sessionId = `cs_e2e_${run}`;
    // C1's completePass activates only a checkout session it created, so seed the pending pass startPassCheckout would have.
    const { error: passError } = await db()
      .from('passes')
      .insert({ trip_id: tripId, stripe_session_id: sessionId, price_variant: 'p9', amount_cents: 900, status: 'pending', created_by: planner.id });
    expect(passError).toBeNull();
    const event = {
      id: `evt_e2e_${run}`,
      object: 'event',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: sessionId, object: 'checkout.session', client_reference_id: tripId, payment_status: 'paid', amount_total: 900 } },
    };
    const payload = JSON.stringify(event);
    const response = await request.post('/api/webhooks/stripe', { data: payload, headers: { 'content-type': 'application/json', 'stripe-signature': stripeSignature(payload) } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ kind: 'activated', tripId, status: 'paid' });

    // Monitoring runs only on an active pass: the webhook starts the trip monitor, which starts the segment's monitor.
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

    // The early heads-up goes out as soon as the incident opens, before the question.
    await pollRow(() => db().from('incident_events').select('kind').eq('incident_id', incidentId), (rows) => rows.some((r) => r.kind === 'alerted'));

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
    expect(playbook!.rules_cited).toEqual([{ rule_id: REFUND_RULE, rule_version: 1 }]);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'What you may be entitled to' })).toBeVisible();
    await expect(page.getByText('within 7 business days for card purchases')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Messages we drafted for you to send' })).toBeVisible();
    // A citation links the rule by its title.
    const citation = page.getByRole('link', { name: /Cancelled flight\?/ }).first();
    await expect(citation).toHaveAttribute('href', `/rules/${REFUND_RULE}`);

    // Each traveler gets the early heads-up and then the plan-ready notice; the planner also got the one question.
    const incidentPath = `/trips/${tripId}/incidents/${incidentId}`;
    const planReady = `${tripName}: your plan is ready`;
    const question = `${tripName}: one quick question`;
    await expect
      .poll(() => readOutbox().filter((m) => m.body.includes(incidentPath)).length, { message: 'planner: heads-up, question, plan ready; member: heads-up, plan ready' })
      .toBe(5);
    const mail = readOutbox().filter((m) => m.body.includes(incidentPath));
    expect(mail.every((m) => m.channel === 'email')).toBe(true);
    const about = (to: string) => mail.filter((m) => m.to === to);

    const plannerMail = about(planner.email);
    expect(plannerMail).toHaveLength(3);
    expect(plannerMail.map((m) => m.subject)).toEqual(expect.arrayContaining([question, planReady]));
    const plannerHeadsUp = plannerMail.filter((m) => m.subject !== question && m.subject !== planReady);
    expect(plannerHeadsUp).toHaveLength(1);
    expect(plannerHeadsUp[0].subject).toMatch(new RegExp(`^${tripName}: TP 204 from EWR .* was cancelled\\.$`));

    const memberMail = about(member.email);
    expect(memberMail).toHaveLength(2);
    expect(memberMail.map((m) => m.subject)).toContain(planReady);
    const memberHeadsUp = memberMail.filter((m) => m.subject !== planReady);
    expect(memberHeadsUp).toHaveLength(1);
    expect(memberHeadsUp[0].subject).toBe(plannerHeadsUp[0].subject);
    // The heads-up claims nothing; it promises a plan, which the plan-ready notice then delivers.
    expect(memberHeadsUp[0].body).toContain('will send your plan here');

    // The heads-up arrives before the question and the plan, for each person.
    const all = readOutbox();
    const position = (to: string, subject: string | null) => all.findIndex((m) => m.to === to && m.subject === subject);
    expect(position(member.email, memberHeadsUp[0].subject)).toBeLessThan(position(member.email, planReady));
    expect(position(planner.email, plannerHeadsUp[0].subject)).toBeLessThan(position(planner.email, question));
    expect(position(planner.email, question)).toBeLessThan(position(planner.email, planReady));

    await citation.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Cancelled flight\?/);
  });

  await test.step('the group votes on schedule-only alternatives', async () => {
    await page.goto(`/trips/${tripId}/incidents/${incidentId}`);
    const options = page.locator('textarea[name="options"]');
    await expect(options).toHaveValue(/UA 64 · leaves .*availability not confirmed/);
    // The cancelled flight is on the route's schedule, but is never offered back.
    await expect(options).not.toHaveValue(/TP 204/);
    await page.getByRole('button', { name: 'Start the vote' }).click();
    await page.waitForURL(/\/votes\/[0-9a-f-]{36}$/);
    const votePath = new URL(page.url()).pathname;
    await expect(page.getByText('availability not confirmed — ask the airline').first()).toBeVisible();

    // An incident has one open vote: the incident page now points at it instead of offering a second.
    await page.goto(`/trips/${tripId}/incidents/${incidentId}`);
    await expect(page.getByRole('link', { name: 'See the group’s vote' })).toHaveAttribute('href', votePath);
    await expect(page.getByRole('button', { name: 'Start the vote' })).toHaveCount(0);
    const { data: openVotes } = await db().from('votes').select('id').eq('incident_id', incidentId).eq('status', 'open');
    expect(openVotes).toHaveLength(1);

    await memberPage.goto(votePath);
    await memberPage.getByRole('button', { name: /UA 64/ }).click();
    await expect(memberPage.getByText('1 of 2 have voted')).toBeVisible();
  });

  await memberContext.close();
});

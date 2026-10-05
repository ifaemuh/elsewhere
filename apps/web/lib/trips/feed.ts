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
  /** Ids of this trip's inbound messages still waiting for approval; a quarantine item for any other message is stale. */
  quarantinedMessageIds: string[];
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
      return input.isPlanner && item.related_entity_id && input.quarantinedMessageIds.includes(item.related_entity_id)
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

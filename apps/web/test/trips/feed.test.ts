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
  quarantinedMessageIds: ['msg-9'],
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

  it('shows the planner every open action item RLS gives them, and a member only their own', () => {
    const others = { id: 'a3', title: 'Check your travel documents', detail: 'x', source_kind: 'document_check', related_entity_id: 'm2', assigned_user_ids: ['sam'] };
    expect(buildFeed({ ...base, actionItems: [others] }).map((c) => c.id)).toEqual(['a3']);
    expect(buildFeed({ ...base, isPlanner: false, meId: 'pat', actionItems: [others] })).toEqual([]);
  });

  it('hides a quarantine approval once its message is no longer quarantined', () => {
    const item = { id: 'a2', title: 'Approve a forwarded email', detail: 'x', source_kind: 'inbound_quarantine', related_entity_id: 'msg-9', assigned_user_ids: ['pat'] };
    expect(buildFeed({ ...base, quarantinedMessageIds: [], actionItems: [item] })).toEqual([]);
  });
});

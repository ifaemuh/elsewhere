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

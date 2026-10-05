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
    expect(inboundCodeFromAddress('xtrip-abcdefghjkmn@in.example.test', 'in.example.test')).toBeNull();
    expect(inboundCodeFromAddress('trip-abcdefghjkmn@in.example.test', 'in.example.test')).toBe('trip-abcdefghjkmn');
    expect(inboundCodeFromAddress('someone@else.test', 'in.example.test')).toBeNull();
  });
});

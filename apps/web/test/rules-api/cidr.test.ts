import { describe, expect, it } from 'vitest';
import { ipInCidrs } from '@/lib/rules-api/cidr';

describe('ipInCidrs', () => {
  it('matches IPv4 inside and outside a /21', () => {
    expect(ipInCidrs('160.79.104.1', ['160.79.104.0/21'])).toBe(true);
    expect(ipInCidrs('160.79.111.255', ['160.79.104.0/21'])).toBe(true);
    expect(ipInCidrs('160.79.112.0', ['160.79.104.0/21'])).toBe(false);
    expect(ipInCidrs('160.79.103.255', ['160.79.104.0/21'])).toBe(false);
  });

  it('treats a bare address as /32 and /0 as everything', () => {
    expect(ipInCidrs('1.2.3.4', ['1.2.3.4'])).toBe(true);
    expect(ipInCidrs('1.2.3.5', ['1.2.3.4'])).toBe(false);
    expect(ipInCidrs('9.9.9.9', ['0.0.0.0/0'])).toBe(true);
  });

  it('matches IPv6, including compressed forms', () => {
    expect(ipInCidrs('2001:db8::1', ['2001:db8::/32'])).toBe(true);
    expect(ipInCidrs('2001:db8:ffff::1', ['2001:db8::/32'])).toBe(true);
    expect(ipInCidrs('2001:db9::1', ['2001:db8::/32'])).toBe(false);
    expect(ipInCidrs('::1', ['::1/128'])).toBe(true);
    expect(ipInCidrs('2001:0db8:0000:0000:0000:0000:0000:0001', ['2001:db8::/64'])).toBe(true);
  });

  it('never matches across address families, except IPv4-mapped IPv6', () => {
    expect(ipInCidrs('1.2.3.4', ['2001:db8::/32'])).toBe(false);
    expect(ipInCidrs('2001:db8::1', ['1.2.3.4/32'])).toBe(false);
    expect(ipInCidrs('::ffff:160.79.104.9', ['160.79.104.0/21'])).toBe(true);
  });

  it('ignores malformed input instead of throwing', () => {
    expect(ipInCidrs('not-an-ip', ['1.2.3.4/32'])).toBe(false);
    expect(ipInCidrs('1.2.3.4', ['garbage', '1.2.3.4/99', '1.2.3.4/x', ''])).toBe(false);
    expect(ipInCidrs('1.2.3.256', ['1.2.3.0/24'])).toBe(false);
    expect(ipInCidrs(null, ['1.2.3.0/24'])).toBe(false);
    expect(ipInCidrs('1.2.3.4', [])).toBe(false);
  });

  it('checks every entry in the list', () => {
    expect(ipInCidrs('5.5.5.5', ['1.1.1.0/24', '5.5.5.0/24'])).toBe(true);
  });
});

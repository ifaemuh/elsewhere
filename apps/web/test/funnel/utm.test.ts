import { describe, expect, it } from 'vitest';
import { parseUtmCookie, pickUtm } from '@/lib/funnel/utm';

describe('pickUtm', () => {
  it('keeps the four utm keys with safe values', () => {
    expect(pickUtm({ utm_source: 'tiktok', utm_medium: 'social', utm_campaign: 'go-elsewhere', utm_content: 'post_12', ref: 'x' })).toEqual({
      utm_source: 'tiktok',
      utm_medium: 'social',
      utm_campaign: 'go-elsewhere',
      utm_content: 'post_12',
    });
  });

  it('drops empty and unsafe values', () => {
    expect(pickUtm({ utm_source: '', utm_medium: '<script>' })).toEqual({});
  });
});

describe('parseUtmCookie', () => {
  it('round-trips JSON and survives garbage', () => {
    expect(parseUtmCookie(JSON.stringify({ utm_source: 'mcp' }))).toEqual({ utm_source: 'mcp' });
    expect(parseUtmCookie('not json')).toEqual({});
    expect(parseUtmCookie(undefined)).toEqual({});
  });
});

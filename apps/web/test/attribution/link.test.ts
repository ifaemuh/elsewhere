import { describe, expect, it } from 'vitest';
import { parsePostLink, redirectUrl } from '@/lib/attribution/link';

describe('parsePostLink', () => {
  it('maps the five platform codes and tags UTM, landing on /rules by default', () => {
    const link = parsePostLink('b-x-c', new URLSearchParams('p=tt'));
    expect(link).toEqual({
      postId: 'b-x-c',
      platform: 'tiktok',
      landingPath: '/rules',
      utm: { utm_source: 'tiktok', utm_medium: 'social', utm_campaign: 'go-elsewhere', utm_content: 'b-x-c' },
    });
    expect(['ig', 'fb', 'tt', 'yt', 'pin'].map((p) => parsePostLink('x', new URLSearchParams(`p=${p}`))!.platform)).toEqual([
      'instagram',
      'facebook',
      'tiktok',
      'youtube',
      'pinterest',
    ]);
  });

  it('ignores other platform codes and unsafe landing paths', () => {
    expect(parsePostLink('p1', new URLSearchParams('p=tiktok&to=https://evil.test'))).toMatchObject({ platform: 'other', landingPath: '/rules' });
    expect(parsePostLink('p1', new URLSearchParams('p=ig&to=//evil.test'))).toMatchObject({ platform: 'instagram', landingPath: '/rules' });
    expect(parsePostLink('p1', new URLSearchParams('p=ig&to=/money/fixture-card-trip-delay'))).toMatchObject({ landingPath: '/money/fixture-card-trip-delay' });
  });

  it('only lets the allow-list through', () => {
    const land = (to: string) => parsePostLink('p1', new URLSearchParams({ to }))!.landingPath;
    for (const ok of ['/rules', '/money', '/rules/fixture-rule-1', '/money/fixture-card-trip-delay']) expect(land(ok)).toBe(ok);
    for (const bad of ['//evil.test', 'https://evil.test/rules', '/\\evil.test', '/rules\\evil', '%2F%2Fevil.test', '/%2Fevil.test', '/rules/..', '/rules/a/b', '/rules?x=1', '/rules#x', '/other', '/rules/%0d%0a', ' /rules', '/rules/A']) {
      expect(land(bad)).toBe('/rules');
    }
  });

  it('rejects malformed post ids', () => {
    expect(parsePostLink('../etc', new URLSearchParams())).toBeNull();
    expect(parsePostLink('x'.repeat(65), new URLSearchParams())).toBeNull();
  });
});

describe('redirectUrl', () => {
  it('adds the UTM tags to the landing page', () => {
    const link = parsePostLink('p9', new URLSearchParams('p=ig&to=/rules'))!;
    expect(redirectUrl('https://example.test/r/p9', link)).toBe(
      'https://example.test/rules?utm_source=instagram&utm_medium=social&utm_campaign=go-elsewhere&utm_content=p9',
    );
  });
});

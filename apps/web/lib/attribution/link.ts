/** Track B's five platform codes. Anything else is recorded as 'other'. */
export const PLATFORM_CODES = { ig: 'instagram', fb: 'facebook', tt: 'tiktok', yt: 'youtube', pin: 'pinterest' } as const;
export type Platform = (typeof PLATFORM_CODES)[keyof typeof PLATFORM_CODES] | 'other';

export interface PostLink {
  postId: string;
  platform: Platform;
  landingPath: string;
  utm: { utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string };
}

const POST_ID = /^[A-Za-z0-9_-]{1,64}$/;
const LANDING = /^\/(rules|money)(\/[a-z0-9-]{1,120})?$/;

export function parsePostLink(postId: string, search: URLSearchParams): PostLink | null {
  if (!POST_ID.test(postId)) return null;
  const code = search.get('p') ?? '';
  const platform: Platform = Object.hasOwn(PLATFORM_CODES, code) ? PLATFORM_CODES[code as keyof typeof PLATFORM_CODES] : 'other';
  const to = search.get('to') ?? '/rules';
  return {
    postId,
    platform,
    landingPath: LANDING.test(to) ? to : '/rules',
    utm: { utm_source: platform, utm_medium: 'social', utm_campaign: 'go-elsewhere', utm_content: postId },
  };
}

export function redirectUrl(base: string, link: PostLink): string {
  const url = new URL(link.landingPath, base);
  for (const [key, value] of Object.entries(link.utm)) url.searchParams.set(key, value);
  return url.toString();
}

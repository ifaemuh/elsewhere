export const UTM_COOKIE = 'elsewhere_utm';
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;
export const UTM_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
};

const SAFE_VALUE = /^[A-Za-z0-9._~-]{1,100}$/;

export function pickUtm(input: Record<string, string | null | undefined>): Utm {
  const utm: Utm = {};
  for (const key of UTM_KEYS) {
    const value = input[key];
    if (value && SAFE_VALUE.test(value)) utm[key] = value;
  }
  return utm;
}

export function parseUtmCookie(value: string | undefined): Utm {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? pickUtm(parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

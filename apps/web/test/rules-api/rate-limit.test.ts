import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit } from '@vercel/firewall';
import { enforceRateLimit } from '@/lib/rules-api/rate-limit';

const anon = { tier: 'anonymous' } as const;
const partner = { tier: 'partner', keyId: 'key-1', partnerId: 'acme', rateLimitRule: 'rules-partner' } as const;
const request = () => new Request('https://elsewhere.test/api/rules');

afterEach(() => {
  delete process.env.VERCEL;
});

describe('enforceRateLimit', () => {
  it('does nothing off Vercel', async () => {
    expect(await enforceRateLimit(request(), anon, 'api')).toBeNull();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('uses the anonymous rule for the surface', async () => {
    process.env.VERCEL = '1';
    await enforceRateLimit(request(), anon, 'mcp');
    const [ruleId, options] = vi.mocked(checkRateLimit).mock.calls[0];
    expect(ruleId).toBe('rules-mcp-anon');
    expect(options).not.toHaveProperty('rateLimitKey');
  });

  it("uses the partner's rule keyed by key ID", async () => {
    process.env.VERCEL = '1';
    await enforceRateLimit(request(), partner, 'api');
    const [ruleId, options] = vi.mocked(checkRateLimit).mock.calls[0];
    expect(ruleId).toBe('rules-partner');
    expect(options?.rateLimitKey).toBe('key-1');
  });

  it('returns 429 with Retry-After when limited', async () => {
    process.env.VERCEL = '1';
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ rateLimited: true });
    const res = await enforceRateLimit(request(), anon, 'api');
    expect(res?.status).toBe(429);
    expect(res?.headers.get('retry-after')).toBe('60');
  });

  it('returns 403 when the firewall blocked the request', async () => {
    process.env.VERCEL = '1';
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ rateLimited: false, error: 'blocked' });
    expect((await enforceRateLimit(request(), anon, 'api'))?.status).toBe(403);
  });

  it('fails open and logs when the firewall SDK throws', async () => {
    process.env.VERCEL = '1';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(checkRateLimit).mockRejectedValueOnce(new Error('network down'));
    expect(await enforceRateLimit(request(), anon, 'api')).toBeNull();
    expect(spy).toHaveBeenCalledWith('[rules-api] rate limit check failed', { ruleId: 'rules-api-anon', message: 'network down' });
    spy.mockRestore();
  });

  it('fails open when the rule is not configured', async () => {
    process.env.VERCEL = '1';
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ rateLimited: false, error: 'not-found' });
    expect(await enforceRateLimit(request(), anon, 'api')).toBeNull();
  });
});

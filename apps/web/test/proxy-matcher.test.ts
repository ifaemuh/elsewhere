import { describe, expect, it } from 'vitest';
import { config } from '@/proxy';

const source = config.matcher[0].source;
const matches = (path: string): boolean => new RegExp(`^${source}$`).test(path);

describe('proxy matcher', () => {
  it('skips the sessionless public API routes', () => {
    for (const path of ['/api/mcp', '/api/rules', '/api/rules.json', '/api/rules/x', '/api/rules/facts', '/api/webhooks/stripe']) {
      expect(matches(path), path).toBe(false);
    }
  });

  it('still covers rule pages and app routes', () => {
    for (const path of ['/rules/x', '/rules', '/trips', '/start', '/']) {
      expect(matches(path), path).toBe(true);
    }
  });
});

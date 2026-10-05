import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { LanguageModel } from 'ai';
import { assertTestSeamAllowed, requireEnv } from '@/lib/env';

export const MODEL_IDS = {
  extraction: 'anthropic/claude-haiku-4.5',
  playbook: 'anthropic/claude-sonnet-5.5',
} as const;

/** Passed as `providerOptions` on every call: AI Gateway routes only to providers that never train on our prompts. */
export const NO_TRAINING = { gateway: { disallowPromptTraining: true } };

export type ModelKind = keyof typeof MODEL_IDS;

/** Gateway model id in normal runs; a canned replay from <ELSEWHERE_AI_FAKE_DIR>/<kind>.json in e2e. */
export async function model(kind: ModelKind): Promise<LanguageModel> {
  const fakeDir = process.env.ELSEWHERE_AI_FAKE_DIR;
  if (!fakeDir) {
    // Vercel authenticates with OIDC; everywhere else the key is required. Read lazily, never printed.
    if (!process.env.VERCEL && !process.env.VERCEL_OIDC_TOKEN) requireEnv('AI_GATEWAY_API_KEY');
    return MODEL_IDS[kind];
  }
  assertTestSeamAllowed('ELSEWHERE_AI_FAKE_DIR');
  const { MockLanguageModelV4 } = await import('ai/test');
  const text = readFileSync(path.join(fakeDir, `${kind}.json`), 'utf8');
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
      warnings: [],
    },
  });
}

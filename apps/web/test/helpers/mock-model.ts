import { MockLanguageModelV4 } from 'ai/test';

export function mockModel(...outputs: unknown[]) {
  return new MockLanguageModelV4({
    doGenerate: outputs.map((output) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 10, text: 10, reasoning: 0 },
      },
      warnings: [],
    })),
  });
}

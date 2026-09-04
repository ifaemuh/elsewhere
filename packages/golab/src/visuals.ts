import Replicate from 'replicate';
import type { VisualStyle } from './types.ts';

const MODEL = 'black-forest-labs/flux-1.1-pro' as const;

export interface VisualDeps {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
  fetchImage(url: string): Promise<Buffer>;
}

export function buildLocationPrompt(poiName: string, detail: string, style: VisualStyle): string {
  const base = `${detail} at ${poiName}.`;
  return style === 'photoreal'
    ? `${base} Cinematic, photorealistic travel photography. Golden hour lighting, editorial composition, rich detail. Vertical format.`
    : `${base} Bold illustrated travel poster art. Flat graphic shapes, saturated colour, strong silhouette. Vertical format.`;
}

function defaultDeps(): VisualDeps {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN is not set');
  const client = new Replicate({ auth: token });
  return {
    run: (model, input) => client.run(model as `${string}/${string}`, { input }),
    fetchImage: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch generated image: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

export async function generateLocationImage(
  poiName: string,
  detail: string,
  style: VisualStyle,
  deps: VisualDeps = defaultDeps(),
): Promise<Buffer> {
  const output = await deps.run(MODEL, {
    prompt: buildLocationPrompt(poiName, detail, style),
    aspect_ratio: '9:16',
    output_format: 'jpg',
    safety_tolerance: 2,
  });

  return normalizeOutput(output, deps);
}

/** Replicate returns one of several shapes depending on model and client version:
 *  a URL string, an array of those, or a `FileOutput` — a ReadableStream subclass
 *  that also exposes `url()`. Prefer the URL when one is available; fall back to
 *  draining the stream. */
async function normalizeOutput(output: unknown, deps: VisualDeps): Promise<Buffer> {
  const value = Array.isArray(output) ? output[0] : output;

  if (typeof value === 'string') return deps.fetchImage(value);

  const maybeUrl = (value as { url?: unknown } | null)?.url;
  if (typeof maybeUrl === 'function') {
    return deps.fetchImage(String(maybeUrl.call(value)));
  }

  if (value instanceof ReadableStream) return drain(value);

  throw new Error('Unexpected output format from Replicate');
}

async function drain(stream: ReadableStream): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value as Uint8Array);
  }
  return Buffer.concat(chunks);
}

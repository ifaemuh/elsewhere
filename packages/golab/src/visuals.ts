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

  const url = Array.isArray(output) ? output[0] : output;
  if (typeof url !== 'string') throw new Error('Unexpected output format from Replicate');
  return deps.fetchImage(url);
}

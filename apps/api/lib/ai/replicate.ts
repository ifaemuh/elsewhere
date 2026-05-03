import Replicate from 'replicate';

const MODEL = 'black-forest-labs/flux-kontext-pro' as const;

let _client: Replicate | null = null;

function getClient(): Replicate {
  if (!_client) {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) throw new Error('REPLICATE_API_TOKEN is not set');
    _client = new Replicate({ auth: token });
  }
  return _client;
}

export async function generatePersonalizedImage(
  referenceImage: string | Buffer,
  prompt: string,
): Promise<Buffer> {
  const replicate = getClient();

  const output = await replicate.run(MODEL, {
    input: {
      prompt,
      input_image: referenceImage,
      aspect_ratio: '3:4',
      output_format: 'jpg',
      safety_tolerance: 2,
    },
  });

  // Replicate returns a ReadableStream or a URL string depending on the model
  if (output instanceof ReadableStream) {
    const reader = output.getReader();
    const chunks: Uint8Array[] = [];
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) chunks.push(result.value);
    }
    return Buffer.concat(chunks);
  }

  // If output is a URL string or array of URLs, fetch the image
  const url = Array.isArray(output) ? output[0] : output;
  if (typeof url === 'string') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch generated image: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  throw new Error('Unexpected output format from Replicate');
}

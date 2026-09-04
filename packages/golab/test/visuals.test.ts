import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLocationPrompt, generateLocationImage } from '../src/visuals.ts';

test('photoreal prompts ask for editorial photography', () => {
  const p = buildLocationPrompt('SUMMIT One Vanderbilt', 'mirrored room at dusk', 'photoreal');
  assert.match(p, /SUMMIT One Vanderbilt/);
  assert.match(p, /mirrored room at dusk/);
  assert.match(p, /photorealistic/i);
});

test('stylized prompts ask for illustration instead of photography', () => {
  const p = buildLocationPrompt('SUMMIT One Vanderbilt', 'mirrored room', 'stylized');
  assert.match(p, /illustrated/i);
  assert.doesNotMatch(p, /photorealistic/i);
});

test('generateLocationImage returns bytes from a URL output', async () => {
  const buf = await generateLocationImage('POI', 'detail', 'photoreal', {
    run: async () => 'https://example.test/a.jpg',
    fetchImage: async () => Buffer.from('IMAGE'),
  });
  assert.equal(buf.toString(), 'IMAGE');
});

test('generateLocationImage unwraps an array output', async () => {
  const buf = await generateLocationImage('POI', 'detail', 'photoreal', {
    run: async () => ['https://example.test/a.jpg'],
    fetchImage: async (url) => Buffer.from(url),
  });
  assert.equal(buf.toString(), 'https://example.test/a.jpg');
});

test('generateLocationImage rejects an unexpected output shape', async () => {
  await assert.rejects(
    generateLocationImage('POI', 'detail', 'photoreal', {
      run: async () => ({ nope: true }),
      fetchImage: async () => Buffer.from(''),
    }),
    /Unexpected output/,
  );
});

test('the prompt reaches Replicate with a 9:16 aspect ratio', async () => {
  let seen: Record<string, unknown> | undefined;
  await generateLocationImage('SUMMIT One Vanderbilt', 'rooftop', 'photoreal', {
    run: async (_model, input) => { seen = input; return 'https://example.test/a.jpg'; },
    fetchImage: async () => Buffer.from('X'),
  });
  assert.equal(seen?.aspect_ratio, '9:16');
  assert.match(String(seen?.prompt), /SUMMIT One Vanderbilt/);
});

test('unwraps a FileOutput-style object exposing url()', async () => {
  const buf = await generateLocationImage('POI', 'detail', 'photoreal', {
    run: async () => ({ url: () => 'https://example.test/from-url.jpg' }),
    fetchImage: async (url) => Buffer.from(url),
  });
  assert.equal(buf.toString(), 'https://example.test/from-url.jpg');
});

test('unwraps a FileOutput nested inside an array', async () => {
  const buf = await generateLocationImage('POI', 'detail', 'photoreal', {
    run: async () => [{ url: () => 'https://example.test/nested.jpg' }],
    fetchImage: async (url) => Buffer.from(url),
  });
  assert.equal(buf.toString(), 'https://example.test/nested.jpg');
});

test('drains a ReadableStream when no url() is available', async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.enqueue(new Uint8Array([3]));
      controller.close();
    },
  });
  const buf = await generateLocationImage('POI', 'detail', 'photoreal', {
    run: async () => stream,
    fetchImage: async () => { throw new Error('should not fetch'); },
  });
  assert.deepEqual([...buf], [1, 2, 3]);
});

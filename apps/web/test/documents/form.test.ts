import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = path.join(process.cwd(), 'app/trips/[id]/documents');

describe('documents form', () => {
  const source = readFileSync(path.join(dir, 'documents-form.tsx'), 'utf8');
  it('asks for no passport number, birth date or loyalty number', () => {
    const names = [...source.matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
    expect(names.sort()).toEqual(['consent', 'keepOnProfile', 'passportCountry', 'passportExpires', 'realId']);
  });
  it('carries no character art', () => {
    expect(source).not.toMatch(/Character/);
  });
});

describe('documents form state', () => {
  it('pre-checks "keep for my next trip" from the saved value', () => {
    const source = readFileSync(path.join(dir, 'documents-form.tsx'), 'utf8');
    expect(source).toMatch(/name="keepOnProfile" defaultChecked=\{keepOnProfile\}/);
  });
});

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function appUrl(): string {
  return requireEnv('NEXT_PUBLIC_APP_URL').replace(/\/+$/, '');
}

/** Fixture directories, outboxes, and fake ports are test seams. They must never switch on in production. */
export function assertTestSeamAllowed(name: string): void {
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error(`${name} is a test seam and cannot be enabled in production`);
  }
}

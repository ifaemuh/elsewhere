import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// On the server, fetch directly from the API origin.
// On the client, use a relative URL — next.config.ts rewrites /api/v1/* to the API.
export function apiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.API_INTERNAL_URL ?? 'http://localhost:3002';
  }
  return '';
}

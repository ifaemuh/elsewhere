import { z } from 'zod';

const Email = z.email().max(254);

export function parseEmail(value: FormDataEntryValue | string | null | undefined): string | null {
  const parsed = Email.safeParse(String(value ?? '').trim().toLowerCase());
  return parsed.success ? parsed.data : null;
}

export function parseOtpCode(value: FormDataEntryValue | null | undefined): string | null {
  const code = String(value ?? '').replace(/\s+/g, '');
  return /^\d{6,10}$/.test(code) ? code : null;
}

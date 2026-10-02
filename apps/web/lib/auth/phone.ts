export function parsePhone(value: FormDataEntryValue | string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  const e164 = raw.startsWith('+')
    ? `+${digits}`
    : digits.length === 10
      ? `+1${digits}`
      : digits.length === 11 && digits.startsWith('1')
        ? `+${digits}`
        : null;
  return e164 && /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
}

/** SMS sign-in and alerts stay off until US carriers clear our A2P 10DLC registration. */
export function smsEnabled(): boolean {
  return process.env.SMS_ENABLED === 'true';
}

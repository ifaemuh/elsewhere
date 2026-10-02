import { randomBytes } from 'node:crypto';

// 32 symbols without l, o, 0, or 1, so a code read aloud or retyped stays unambiguous. 256 % 32 === 0, so there is no bias.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function newInboundCode(): string {
  let code = '';
  for (const byte of randomBytes(12)) code += ALPHABET[byte % ALPHABET.length];
  return `trip-${code}`;
}

export function inboundAddress(code: string, inboundDomain: string): string {
  return `${code}@${inboundDomain}`;
}

export function inboundCodeFromAddress(address: string, inboundDomain: string): string | null {
  const match = address.toLowerCase().match(/(trip-[a-z0-9]{12})@([a-z0-9.-]+)/);
  return match && match[2] === inboundDomain.toLowerCase() ? match[1] : null;
}

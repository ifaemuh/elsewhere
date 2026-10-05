interface Address {
  family: 4 | 6;
  value: bigint;
}

function parseV4(text: string): bigint | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8n) | BigInt(n);
  }
  return value;
}

function parseV6(text: string): bigint | null {
  let head = text;
  let tail = '';
  if (text.includes('::')) {
    const halves = text.split('::');
    if (halves.length !== 2) return null;
    [head, tail] = halves;
  }
  const expand = (part: string): string[] | null => {
    if (!part) return [];
    const groups = part.split(':');
    const last = groups[groups.length - 1];
    if (last.includes('.')) {
      const v4 = parseV4(last);
      if (v4 === null) return null;
      groups.splice(-1, 1, ((v4 >> 16n) & 0xffffn).toString(16), (v4 & 0xffffn).toString(16));
    }
    return groups;
  };
  const headGroups = expand(head);
  const tailGroups = expand(tail);
  if (!headGroups || !tailGroups) return null;
  const compressed = text.includes('::');
  const missing = 8 - headGroups.length - tailGroups.length;
  if (compressed ? missing < 1 : missing !== 0) return null;
  const groups = [...headGroups, ...Array<string>(compressed ? missing : 0).fill('0'), ...tailGroups];
  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

function parseAddress(text: string): Address | null {
  const trimmed = text.trim();
  if (trimmed.includes(':')) {
    const value = parseV6(trimmed);
    if (value === null) return null;
    // IPv4-mapped (::ffff:a.b.c.d) is treated as the IPv4 address it carries.
    if (value >> 32n === 0xffffn) return { family: 4, value: value & 0xffffffffn };
    return { family: 6, value };
  }
  const value = parseV4(trimmed);
  return value === null ? null : { family: 4, value };
}

function inCidr(ip: Address, cidr: string): boolean {
  const [base, bitsText, extra] = cidr.trim().split('/');
  if (extra !== undefined) return false;
  const network = parseAddress(base);
  if (!network || network.family !== ip.family) return false;
  const width = ip.family === 4 ? 32 : 128;
  if (bitsText !== undefined && !/^\d{1,3}$/.test(bitsText)) return false;
  const bits = bitsText === undefined ? width : Number(bitsText);
  if (bits > width) return false;
  const shift = BigInt(width - bits);
  return ip.value >> shift === network.value >> shift;
}

/** True when `ip` falls inside any CIDR (or bare address) in the list. Malformed input never matches. */
export function ipInCidrs(ip: string | null | undefined, cidrs: readonly string[]): boolean {
  if (!ip) return false;
  const address = parseAddress(ip);
  if (!address) return false;
  return cidrs.some((cidr) => inCidr(address, cidr));
}

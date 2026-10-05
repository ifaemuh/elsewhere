const ADDRESS = /<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>|^\s*([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)\s*$/;

export function parseSender(from: string): string | null {
  const match = from.match(ADDRESS);
  const address = match?.[1] ?? match?.[2];
  return address ? address.toLowerCase() : null;
}

export function senderAllowed(sender: string, allowed: string[]): boolean {
  return allowed.some((email) => email.toLowerCase() === sender.toLowerCase());
}

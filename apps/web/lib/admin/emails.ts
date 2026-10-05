export function adminEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null, env: Record<string, string | undefined> = process.env): boolean {
  return email !== null && adminEmails(env).includes(email.toLowerCase());
}

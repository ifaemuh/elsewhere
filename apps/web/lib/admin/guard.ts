import 'server-only';
import { notFound } from 'next/navigation';
import { requireUser, type CurrentUser } from '@/lib/auth/user';
import { isAdminEmail } from './emails';

/** Non-admins get a 404, so /admin doesn't advertise itself. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser('/admin');
  if (!isAdminEmail(user.email)) notFound();
  return user;
}

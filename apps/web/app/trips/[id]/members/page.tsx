import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/user';
import { createClient } from '@/lib/supabase/server';

type Params = Promise<{ id: string }>;

export default function MembersPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Who’s going</h1>
      <Suspense fallback={<p className="mt-6 text-[#4b5745]">Loading…</p>}>
        <MembersContent params={params} />
      </Suspense>
    </main>
  );
}

async function MembersContent({ params }: { params: Params }) {
  const { id } = await params;
  await requireUser(`/trips/${id}/members`);
  const supabase = await createClient();
  const { data: directory } = await supabase.rpc('trip_directory', { p_trip_id: id });
  if (!directory || directory.length === 0) notFound();
  const { data: assignments } = await supabase.from('booking_members').select('member_id, bookings!inner(provider)').eq('trip_id', id);
  const bookingsBy = new Map<string, string[]>();
  for (const row of assignments ?? []) {
    const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
    bookingsBy.set(row.member_id, [...(bookingsBy.get(row.member_id) ?? []), booking.provider]);
  }
  return (
    <ul className="mt-6 divide-y divide-[#e4dfd0] rounded-xl border border-[#e4dfd0] bg-white">
      {(directory as { member_id: string; display_name: string; role: string }[]).map((member) => (
        <li key={member.member_id} className="px-4 py-3">
          <p className="font-medium">
            {member.display_name}
            {member.role === 'planner' ? <span className="ml-2 text-sm text-[#4b5745]">planner</span> : null}
          </p>
          <p className="text-sm text-[#4b5745]">{(bookingsBy.get(member.member_id) ?? []).join(', ') || 'Not on a booking yet'}</p>
        </li>
      ))}
    </ul>
  );
}

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/user';
import { runDocumentChecks } from '@/lib/documents/service';
import { createClient } from '@/lib/supabase/server';

export interface DocumentsState {
  error: string | null;
  saved: boolean;
}

const DocumentsInput = z.object({
  passportCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().or(z.literal('')),
  passportExpires: z.iso.date().optional().or(z.literal('')),
  realId: z.enum(['yes', 'no', 'unsure']),
  keepOnProfile: z.boolean(),
  consent: z.literal(true, { message: 'Tick the box so we can store these two details.' }),
});

export async function saveDocuments(tripId: string, _prev: DocumentsState, form: FormData): Promise<DocumentsState> {
  const user = await requireUser(`/trips/${tripId}/documents`);
  const parsed = DocumentsInput.safeParse({
    passportCountry: form.get('passportCountry') ?? '',
    passportExpires: form.get('passportExpires') ?? '',
    realId: form.get('realId') ?? 'unsure',
    keepOnProfile: form.get('keepOnProfile') === 'on',
    consent: form.get('consent') === 'on',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, saved: false };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const upserts = [
    ...(parsed.data.passportCountry || parsed.data.passportExpires
      ? [{ user_id: user.id, kind: 'passport', issuing_country: parsed.data.passportCountry || null, expires_on: parsed.data.passportExpires || null, keep_on_profile: parsed.data.keepOnProfile, updated_at: now }]
      : []),
    ...(parsed.data.realId !== 'unsure'
      ? [{ user_id: user.id, kind: 'real_id', real_id_compliant: parsed.data.realId === 'yes', keep_on_profile: parsed.data.keepOnProfile, updated_at: now }]
      : []),
  ];
  if (upserts.length > 0) {
    const { error } = await supabase.from('member_documents').upsert(upserts, { onConflict: 'user_id,kind' });
    if (error) return { error: 'We could not save that. Try again.', saved: false };
  }
  await supabase.from('consents').insert({ user_id: user.id, kind: 'documents', policy_version: 'documents-2026-10' });
  await runDocumentChecks(tripId);
  revalidatePath(`/trips/${tripId}/documents`);
  return { error: null, saved: true };
}

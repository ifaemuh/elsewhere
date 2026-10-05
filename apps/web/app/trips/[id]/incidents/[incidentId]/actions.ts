'use server';

import { revalidatePath } from 'next/cache';
import { resumeHook } from 'workflow/api';
import { z } from 'zod';
import { answerValue, PlannerAnswerError } from '@/lib/assist/questions';
import { requireUser } from '@/lib/auth/user';
import { createClient } from '@/lib/supabase/server';
import { incidentAnswerToken } from '@/lib/workflows/tokens';

export interface AnswerResult {
  error: string | null;
}

const Ids = z.object({ tripId: z.string().uuid(), incidentId: z.string().uuid() });

/**
 * The planner's answer to the one question an incident asks. Every argument comes from the client, so nothing is
 * written, resumed or sent until the caller is the trip's planner (checked as them, under RLS), the incident is on
 * that trip with this question open, and the answer is one the question offers.
 */
export async function answerQuestion(tripId: string, incidentId: string, fact: string, value: string): Promise<AnswerResult> {
  const ids = Ids.safeParse({ tripId, incidentId });
  if (!ids.success) return { error: 'We could not find that incident.' };
  await requireUser(`/trips/${tripId}/incidents/${incidentId}`);
  const supabase = await createClient();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: tripId });
  if (isPlanner !== true) return { error: 'Only the planner can answer this.' };

  const { data: incident } = await supabase.from('incidents').select('pending_question').eq('id', incidentId).eq('trip_id', tripId).maybeSingle();
  if (!incident) return { error: 'We could not find that incident.' };
  const pending = incident.pending_question as { fact: string } | null;
  if (!pending || pending.fact !== fact) return { error: 'That question is no longer open.' };

  try {
    answerValue({ fact, value });
  } catch (error) {
    if (error instanceof PlannerAnswerError) return { error: error.message };
    throw error;
  }

  try {
    await resumeHook(incidentAnswerToken(incidentId), { fact, value });
  } catch (error) {
    // The run already moved on (the six hours passed, or another tab answered).
    console.error('could not resume the incident run', incidentId, error instanceof Error ? error.message : 'unknown');
    return { error: 'That question is no longer open.' };
  }
  revalidatePath(`/trips/${tripId}/incidents/${incidentId}`);
  return { error: null };
}

import { SupabaseClient } from '@supabase/supabase-js';

export interface GenerateInstallmentsParams {
  tripId: string;
  totalAmount: number;
  months: number;
  travelerIds: string[];
}

export async function generateInstallments(
  supabase: SupabaseClient,
  params: GenerateInstallmentsParams,
): Promise<void> {
  const { tripId, totalAmount, months, travelerIds } = params;
  const perTraveler = totalAmount / travelerIds.length;
  const monthlyPerTraveler = Math.ceil((perTraveler / months) * 100) / 100;

  const installments = travelerIds.flatMap((travelerId) =>
    Array.from({ length: months }, (_, i) => {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + i + 1);
      dueDate.setDate(1);

      return {
        trip_id: tripId,
        traveler_id: travelerId,
        reference_key: `inst-${tripId}-${travelerId}-${i + 1}`,
        due_date: dueDate.toISOString().split('T')[0],
        amount: monthlyPerTraveler,
        status: 'pending' as const,
      };
    }),
  );

  // Clear existing installments for this trip before regenerating
  await supabase.from('wallet_installments').delete().eq('trip_id', tripId);

  const { error } = await supabase.from('wallet_installments').insert(installments);
  if (error) {
    throw new Error(`Failed to generate installments: ${error.message}`);
  }
}

export async function syncTravelerPaymentStates(
  supabase: SupabaseClient,
  tripId: string,
): Promise<void> {
  // Get all travelers for the trip
  const { data: travelers } = await supabase
    .from('travelers')
    .select('id')
    .eq('trip_id', tripId);

  if (!travelers?.length) return;

  for (const traveler of travelers) {
    const { data: installments } = await supabase
      .from('wallet_installments')
      .select('status')
      .eq('traveler_id', traveler.id);

    if (!installments?.length) continue;

    const hasLate = installments.some((i) => i.status === 'late');
    const allPaid = installments.every((i) => i.status === 'paid');

    const newState = hasLate ? 'overdue' : allPaid ? 'paid' : 'pending';

    await supabase
      .from('travelers')
      .update({ payment_state: newState })
      .eq('id', traveler.id);
  }
}

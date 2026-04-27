import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { financingOfferRequestSchema } from '@elsewhere/shared';
import { errorResponse } from '@lib/utils/errors';
import { getFinancingAdapter } from '@lib/providers/financing';

export async function POST(req: NextRequest) {
  try {
    const { supabase } = await getAuthUser(req);
    const body = await req.json();
    const validated = financingOfferRequestSchema.parse(body);

    const adapter = getFinancingAdapter();
    const providerOffers = await adapter.getOffers(validated.totalAmount, validated.travelerCount);

    // Store offers in DB
    const dbOffers = providerOffers.map((o) => ({
      trip_id: validated.tripId,
      provider_name: o.providerName,
      months: o.months,
      apr_percent: o.aprPercent,
      monthly_amount: o.monthlyAmount,
    }));

    const { data: offers, error } = await supabase
      .from('financing_offers')
      .insert(dbOffers)
      .select('*');

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create offers', message: error.message, statusCode: 500 },
        { status: 500 },
      );
    }

    return NextResponse.json(offers);
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from 'next/server';
import type { Destination } from '@elsewhere/shared';
import { isLocalDev } from '@lib/storage';
import { createAdminClient } from '@lib/supabase/admin';
import { destinationStore } from '@lib/stores/memory';

type DestinationRow = {
  id: string;
  name: string;
  country: string;
  teaser: string;
  flight_cost: number | string;
  hotel_cost: number | string;
  activity_cost: number | string;
  transfer_cost: number | string;
  partner_fee: number | string;
  is_featured: boolean;
  preview_image_url: string | null;
  created_at: string;
};

function toDestination(row: DestinationRow): Destination {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    teaser: row.teaser,
    flightCost: Number(row.flight_cost),
    hotelCost: Number(row.hotel_cost),
    activityCost: Number(row.activity_cost),
    transferCost: Number(row.transfer_cost),
    partnerFee: Number(row.partner_fee),
    isFeatured: row.is_featured,
    previewImageUrl: row.preview_image_url,
    createdAt: row.created_at,
  };
}

export async function GET() {
  if (isLocalDev()) {
    return NextResponse.json(destinationStore.listFeatured());
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('destinations')
    .select('*')
    .eq('is_featured', true)
    .order('name');

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch destinations', message: error.message, statusCode: 500 },
      { status: 500 },
    );
  }

  return NextResponse.json((data ?? []).map((row) => toDestination(row)));
}

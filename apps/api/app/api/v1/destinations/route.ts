import { NextResponse } from 'next/server';
import { isLocalDev } from '@lib/storage';
import { createAdminClient } from '@lib/supabase/admin';
import { destinationStore } from '@lib/stores/memory';

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

  return NextResponse.json(data);
}

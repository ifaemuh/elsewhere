import { NextResponse } from 'next/server';
import { getEnvironment } from '@lib/utils/feature-flags';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    environment: getEnvironment(),
    timestamp: new Date().toISOString(),
  });
}

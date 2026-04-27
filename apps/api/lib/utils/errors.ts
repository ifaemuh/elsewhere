import { NextResponse } from 'next/server';
import { AuthError } from '../supabase/middleware';
import { ZodError } from 'zod';

export interface APIError {
  error: string;
  message: string;
  statusCode: number;
}

export function errorResponse(error: unknown): NextResponse<APIError> {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: 'Unauthorized', message: error.message, statusCode: 401 },
      { status: 401 },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Validation Error',
        message: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        statusCode: 400,
      },
      { status: 400 },
    );
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  return NextResponse.json(
    { error: 'Internal Error', message, statusCode: 500 },
    { status: 500 },
  );
}

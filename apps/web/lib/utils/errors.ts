import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface APIError {
  error: string;
  message: string;
  statusCode: number;
}

export function errorResponse(error: unknown): NextResponse<APIError> {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: 'Unauthorized', message: error.message, statusCode: 401 }, { status: 401 });
  }
  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
    return NextResponse.json({ error: 'Validation Error', message, statusCode: 400 }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: 'Internal Error', message: 'Internal server error', statusCode: 500 }, { status: 500 });
}

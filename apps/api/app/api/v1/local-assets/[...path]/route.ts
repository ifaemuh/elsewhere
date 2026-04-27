import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

const STORAGE_ROOT = join(process.cwd(), '.data', 'storage');

const MIME_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (process.env.ELSEWHERE_ENVIRONMENT !== 'dev') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { path } = await params;
  const filePath = join(STORAGE_ROOT, ...path);

  // Prevent directory traversal
  if (!filePath.startsWith(STORAGE_ROOT)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = await readFile(filePath);
    const ext = '.' + (path.at(-1)?.split('.').pop() ?? '');
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    return new NextResponse(data, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

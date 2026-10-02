import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';

const STORAGE_ROOT = join(process.cwd(), '.data', 'storage');
const MOCK_ASSET_ROOT = join(process.cwd(), 'mock-assets');

const MIME_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (process.env.ELSEWHERE_ENVIRONMENT !== 'dev') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { path } = await params;
  const root = ['brand', 'editorial', 'trips'].includes(path[0] ?? '') ? MOCK_ASSET_ROOT : STORAGE_ROOT;
  const filePath = join(root, ...path);

  // Prevent directory traversal
  if (!filePath.startsWith(root)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const fileStat = await stat(filePath);
    const data = await readFile(filePath);
    const ext = '.' + (path.at(-1)?.split('.').pop() ?? '');
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    const baseHeaders = {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'Content-Length': String(fileStat.size),
      'Accept-Ranges': 'bytes',
    };

    const range = req.headers.get('range');
    if (range && ext === '.mp4') {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      if (match) {
        const start = match[1] ? Number.parseInt(match[1], 10) : 0;
        const end = match[2] ? Number.parseInt(match[2], 10) : fileStat.size - 1;
        const safeEnd = Math.min(end, fileStat.size - 1);

        if (start <= safeEnd && start < fileStat.size) {
          const chunk = data.subarray(start, safeEnd + 1);
          return new NextResponse(chunk, {
            status: 206,
            headers: {
              ...baseHeaders,
              'Content-Length': String(chunk.byteLength),
              'Content-Range': `bytes ${start}-${safeEnd}/${fileStat.size}`,
            },
          });
        }
      }
    }

    return new NextResponse(data, {
      headers: baseHeaders,
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

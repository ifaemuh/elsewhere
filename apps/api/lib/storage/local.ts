import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import type { StorageAdapter } from './types';

const STORAGE_ROOT = join(process.cwd(), '.data', 'storage');
const LOCAL_PORT = process.env.PORT ?? '3002';
const PUBLIC_BASE_URL =
  process.env.ELSEWHERE_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  `http://localhost:${LOCAL_PORT}`;

export class LocalStorageAdapter implements StorageAdapter {
  async upload(path: string, data: Buffer | Uint8Array, _contentType: string): Promise<string> {
    const fullPath = join(STORAGE_ROOT, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
    return this.getPublicUrl(path);
  }

  async download(path: string): Promise<Buffer> {
    return readFile(join(STORAGE_ROOT, path));
  }

  async delete(path: string): Promise<void> {
    try {
      await unlink(join(STORAGE_ROOT, path));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  getPublicUrl(path: string): string {
    return `${PUBLIC_BASE_URL}/api/v1/local-assets/${path}`;
  }
}

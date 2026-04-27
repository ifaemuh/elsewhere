export interface StorageAdapter {
  upload(path: string, data: Buffer | Uint8Array, contentType: string): Promise<string>;
  download(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  getPublicUrl(path: string): string;
}

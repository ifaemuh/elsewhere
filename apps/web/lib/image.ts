export interface CompressedImage {
  blob: Blob;
  fileName: string;
  contentType: 'image/webp';
}

const MAX_DIMENSION = 1024;
const QUALITY = 0.8;

export async function compressToWebp(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', QUALITY),
  );
  if (!blob) throw new Error('Failed to encode image');

  return {
    blob,
    fileName: `selfie-${Date.now()}.webp`,
    contentType: 'image/webp',
  };
}

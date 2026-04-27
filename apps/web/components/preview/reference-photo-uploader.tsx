'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReferencePhoto } from '@elsewhere/shared';
import { Camera, Loader2, Plus, X } from 'lucide-react';
import {
  deleteReferencePhoto,
  listReferencePhotos,
  uploadReferencePhoto,
} from '@/lib/api';
import { compressToWebp } from '@/lib/image';

const MAX_PHOTOS = 3;

interface Props {
  token: string | null;
  onPhotosChange: (photoIds: string[]) => void;
}

export function ReferencePhotoUploader({ token, onPhotosChange }: Props) {
  const [photos, setPhotos] = useState<ReferencePhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      setPhotos([]);
      onPhotosChange([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listReferencePhotos(token)
      .then((list) => {
        if (cancelled) return;
        setPhotos(list);
        onPhotosChange(list.map((p) => p.id));
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, onPhotosChange]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !token) return;
    setError(null);
    setUploading(true);
    try {
      const remaining = MAX_PHOTOS - photos.length;
      const toUpload = Array.from(files).slice(0, remaining);
      const uploaded: ReferencePhoto[] = [];
      for (const file of toUpload) {
        const compressed = await compressToWebp(file);
        const result = await uploadReferencePhoto(
          token,
          compressed.blob,
          compressed.fileName,
          compressed.contentType,
        );
        uploaded.push({
          id: result.photoId,
          userId: '',
          fileName: compressed.fileName,
          url: result.url,
          contentType: compressed.contentType,
          status: result.status,
          createdAt: new Date().toISOString(),
        });
      }
      const next = [...photos, ...uploaded];
      setPhotos(next);
      onPhotosChange(next.map((p) => p.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(photoId: string) {
    if (!token) return;
    const prev = photos;
    const next = photos.filter((p) => p.id !== photoId);
    setPhotos(next);
    onPhotosChange(next.map((p) => p.id));
    try {
      await deleteReferencePhoto(token, photoId);
    } catch (err) {
      setPhotos(prev);
      onPhotosChange(prev.map((p) => p.id));
      setError((err as Error).message);
    }
  }

  const canAdd = photos.length < MAX_PHOTOS && !uploading;
  const slots = Array.from({ length: MAX_PHOTOS }, (_, i) => photos[i] ?? null);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-medium text-white/70">
          Add yourself to the scene{' '}
          <span className="text-white/40">(optional)</span>
        </div>
        <div className="text-xs text-white/40">
          {photos.length}/{MAX_PHOTOS}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {slots.map((photo, i) =>
          photo ? (
            <div
              key={photo.id}
              className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt=""
                className="size-full object-cover"
              />
              <button
                type="button"
                onClick={() => handleDelete(photo.id)}
                aria-label="Remove photo"
                className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/70 text-white backdrop-blur transition active:scale-95"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : i === photos.length && canAdd ? (
            <button
              key={`add-${i}`}
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 bg-white/[0.02] text-white/60 transition active:scale-95 hover:border-white/40 hover:text-white"
            >
              {uploading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : photos.length === 0 ? (
                <>
                  <Camera className="size-5" />
                  <span className="text-[11px] font-medium">Add selfie</span>
                </>
              ) : (
                <Plus className="size-5" />
              )}
            </button>
          ) : (
            <div
              key={`empty-${i}`}
              className="aspect-square rounded-xl border border-white/5 bg-white/[0.01]"
            />
          ),
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        multiple
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {!token ? (
        <p className="text-xs text-white/40">Sign in to add yourself to the scene.</p>
      ) : photos.length === 0 ? (
        <p className="text-xs text-white/40">
          Tap to take a selfie or upload one. We use it to put your face in the preview.
        </p>
      ) : null}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-white/50">
          <Loader2 className="size-3 animate-spin" /> Loading photos…
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}

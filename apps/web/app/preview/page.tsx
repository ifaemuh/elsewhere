'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import {
  fetchDestinations,
  createPreviewJob,
  recordPreviewConsent,
  totalCost,
  type DestinationRow,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ReferencePhotoUploader } from '@/components/preview/reference-photo-uploader';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';

export default function PreviewComposerPage() {
  const router = useRouter();
  const params = useSearchParams();
  const presetDestinationId = params.get('destination');

  const [destinations, setDestinations] = useState<DestinationRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(presetDestinationId);
  const [prompt, setPrompt] = useState('');
  const [rightsConsent, setRightsConsent] = useState(false);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const handlePhotosChange = useCallback((ids: string[]) => {
    setPhotoIds(ids);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setToken(data.session?.access_token ?? null);
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchDestinations();
        if (cancelled) return;
        setDestinations(list);
        if (!selectedId && list.length > 0) setSelectedId(list[0].id);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = destinations?.find((d) => d.id === selectedId) ?? null;
  const hasPhotos = photoIds.length > 0;
  const isPersonalized = hasPhotos;
  const canSubmit = !!selected && rightsConsent && !submitting;

  async function onGenerate() {
    if (!selected) return;
    setError(null);
    setSubmitting(true);
    try {
      if (!token) {
        router.push(`/login?next=${encodeURIComponent('/preview')}`);
        return;
      }

      const finalPrompt =
        prompt.trim() ||
        `${selected.teaser} Cinematic travel photography of ${selected.name}, ${selected.country}.`;

      const { consentId } = await recordPreviewConsent(token, {
        destinationName: selected.name,
        prompt: finalPrompt,
        hasIdentityConsent: hasPhotos,
        hasReferenceMedia: hasPhotos,
      });

      const { jobId } = await createPreviewJob(
        token,
        selected,
        consentId,
        prompt,
        hasPhotos ? photoIds : undefined,
      );
      router.push(`/preview/${jobId}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-black pb-32 text-white sm:pb-10">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>

        <div className="mt-6 sm:mt-10">
          <div className="text-xs font-medium uppercase tracking-widest text-amber-300">
            Generate a preview
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Where do you want to go?
          </h1>
          <p className="mt-2 text-sm text-white/60 sm:text-base">
            Pick a destination and we'll generate a cinematic AI preview. Free, takes about a
            minute.
          </p>
        </div>

        {authChecked && !token && (
          <Card className="mt-6 border-amber-300/20 bg-amber-300/5 text-white">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
              <div>
                <div className="text-sm font-medium">Sign in to generate previews</div>
                <div className="text-xs text-white/60">
                  Free — takes 30 seconds. We email a confirmation.
                </div>
              </div>
              <Button asChild size="sm" className="bg-white text-black hover:bg-white/90">
                <Link href="/login?next=/preview">Sign in</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {!destinations ? (
          <div className="mt-8 flex items-center gap-2 text-white/60">
            <Loader2 className="size-4 animate-spin" /> Loading destinations…
          </div>
        ) : destinations.length === 0 ? (
          <Card className="mt-8 border-white/10 bg-white/[0.03] text-white">
            <CardContent className="p-6 text-sm text-white/60">
              No destinations available. Check that the API is running and Supabase has been
              seeded.
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {destinations.map((d) => {
              const isSelected = d.id === selectedId;
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className={`group relative overflow-hidden rounded-xl border p-4 text-left transition active:scale-[0.99] sm:p-5 ${
                    isSelected
                      ? 'border-amber-300/60 bg-amber-300/5'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-widest text-white/50 sm:text-xs">
                    {d.country}
                  </div>
                  <div className="mt-1 text-base font-semibold sm:text-lg">{d.name}</div>
                  <div className="mt-1.5 line-clamp-2 text-xs text-white/60 sm:mt-2 sm:text-sm">
                    {d.teaser}
                  </div>
                  <div className="mt-3 text-xs text-white/50 sm:mt-4">
                    From <span className="text-white">${totalCost(d).toLocaleString()}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {selected && (
          <Card className="mt-6 border-white/10 bg-white/[0.03] text-white">
            <CardContent className="space-y-5 p-4 sm:p-6">
              <ReferencePhotoUploader token={token} onPhotosChange={handlePhotosChange} />

              <div>
                <div className="mb-2 text-xs font-medium text-white/70">
                  Custom prompt <span className="text-white/40">(optional)</span>
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={`e.g. "Golden hour, rooftop bar overlooking ${selected.name}, candid moment"`}
                  rows={3}
                  className="w-full resize-none rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none transition placeholder:text-white/30 focus:border-white/30"
                />
                <div className="mt-1 text-xs text-white/40">
                  Leave blank to use the destination's default scene.
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={rightsConsent}
                  onChange={(e) => setRightsConsent(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 rounded border-white/20"
                />
                <span>
                  {hasPhotos
                    ? 'I have rights to these photos and consent to AI processing of my likeness for this preview.'
                    : 'I have rights to use this content for AI preview generation.'}
                </span>
              </label>

              {error && (
                <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              )}

              <div className="hidden sm:block">
                <Button
                  onClick={onGenerate}
                  disabled={!canSubmit}
                  size="lg"
                  className="w-full bg-white text-black hover:bg-white/90"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      {isPersonalized ? 'Generate personalized preview' : `Generate preview of ${selected.name}`}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Mobile sticky CTA */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-black/90 px-4 py-3 backdrop-blur sm:hidden">
          <Button
            onClick={onGenerate}
            disabled={!canSubmit}
            size="lg"
            className="w-full bg-white text-black hover:bg-white/90"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {isPersonalized ? 'Generate personalized preview' : 'Generate preview'}
              </>
            )}
          </Button>
        </div>
      )}
    </main>
  );
}

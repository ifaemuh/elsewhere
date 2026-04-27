'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { fetchPreviewJob, type PreviewJob } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Loader2, Sparkles, AlertTriangle } from 'lucide-react';

export default function PreviewStatusPage() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const [job, setJob] = useState<PreviewJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          router.replace(`/login?next=${encodeURIComponent(`/preview/${jobId}`)}`);
          return;
        }
        const next = await fetchPreviewJob(token, jobId);
        if (cancelled) return;
        setJob(next);
        if (next.status === 'pending' || next.status === 'processing') {
          timer = setTimeout(poll, 2500);
        }
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, router]);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          href="/preview"
          className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back to compose
        </Link>

        <div className="mt-10">
          <div className="text-xs font-medium uppercase tracking-widest text-amber-300">
            Preview job
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {job ? job.destinationName : 'Loading…'}
          </h1>
          <p className="mt-2 text-sm text-white/60">Job id: {jobId}</p>
        </div>

        {error && (
          <Card className="mt-8 border-red-500/20 bg-red-500/5 text-red-200">
            <CardContent className="flex items-start gap-3 p-5 text-sm">
              <AlertTriangle className="mt-0.5 size-4" />
              <div>{error}</div>
            </CardContent>
          </Card>
        )}

        {job && <JobStatus job={job} />}
      </div>
    </main>
  );
}

function JobStatus({ job }: { job: PreviewJob }) {
  if (job.status === 'completed' && job.playbackUrl) {
    return (
      <Card className="mt-8 overflow-hidden border-white/10 bg-white/[0.03] text-white">
        <div className="aspect-[4/5] w-full bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={job.playbackUrl}
            alt={job.destinationName}
            className="h-full w-full object-cover"
          />
        </div>
        <CardContent className="space-y-3 p-5">
          <div className="text-sm text-white/70">{job.prompt}</div>
          <div className="flex gap-2">
            <Button asChild className="bg-white text-black hover:bg-white/90">
              <a href={job.playbackUrl} target="_blank" rel="noreferrer">
                Open full size
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/preview">Generate another</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (job.status === 'failed') {
    return (
      <Card className="mt-8 border-red-500/20 bg-red-500/5 text-red-200">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-4" /> Preview failed
          </div>
          <div className="text-sm text-red-200/80">
            {job.errorMessage ?? 'Unknown error.'}
          </div>
          <Button asChild className="bg-white text-black hover:bg-white/90">
            <Link href="/preview">Try again</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-8 border-white/10 bg-white/[0.03] text-white">
      <CardContent className="flex items-center gap-3 p-6 text-sm text-white/70">
        <Loader2 className="size-4 animate-spin text-amber-300" />
        <div>
          <div className="font-medium text-white">
            <Sparkles className="mr-1 inline size-3.5 text-amber-300" />
            {job.status === 'pending' ? 'Queued' : 'Generating your scene'}…
          </div>
          <div className="text-xs text-white/50">
            This usually takes 30–90 seconds. Page will update automatically.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

export default function AdminError({ error }: { error: Error & { digest?: string } }) {
  // In production the message is hidden, so show only what is safe: the digest finds the entry in the logs.
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p role="alert" className="text-lg font-medium">That didn&apos;t work. Check the logs.</p>
      {error.digest ? <p className="mt-2 font-mono text-sm text-[#4b5745]">Digest: {error.digest}</p> : null}
    </main>
  );
}

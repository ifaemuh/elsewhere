import { Suspense } from 'react';
import { safeNext } from '@/lib/auth/safe-next';
import { LoginForm } from './login-form';

type SearchParams = Promise<{ next?: string; email?: string; step?: string }>;

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Sign in to Elsewhere</h1>
      <p className="mt-2 text-[#4b5745]">We email you a one-time code. No password.</p>
      <Suspense fallback={null}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <LoginForm next={safeNext(params.next)} initialEmail={params.email ?? ''} initialStep={params.step === 'verify' ? 'verify' : 'email'} />;
}

'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Mail, Loader2, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-6">
        <div className="flex items-center gap-2 text-white/60">
          <Loader2 className="size-4 animate-spin" /> Loading sign in…
        </div>
      </div>
    </main>
  );
}

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/preview';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    const supabase = createClient();
    const fn =
      mode === 'signin'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
    const { error: err } = await fn;
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (mode === 'signup') {
      setMessage('Check your email to confirm your account, then come back to sign in.');
      return;
    }
    router.replace(next);
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-md px-6 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>

        <div className="mt-12">
          <div className="text-xs font-medium uppercase tracking-widest text-amber-300">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {mode === 'signin' ? 'Sign in to Elsewhere' : 'Start previewing'}
          </h1>
          <p className="mt-2 text-sm text-white/60">
            {mode === 'signin'
              ? 'Pick up where you left off.'
              : 'Free to start. We email a confirmation link.'}
          </p>
        </div>

        <Card className="mt-8 border-white/10 bg-white/[0.03] text-white">
          <CardContent className="p-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@elsewhere.travel"
                required
              />
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                required
                minLength={6}
              />

              {error && (
                <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              )}
              {message && (
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  {message}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-white text-black hover:bg-white/90"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Working…
                  </>
                ) : (
                  <>
                    <Mail className="size-4" />
                    {mode === 'signin' ? 'Sign in' : 'Create account'}
                  </>
                )}
              </Button>
            </form>

            <button
              onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
              className="mt-4 w-full text-sm text-white/60 hover:text-white"
            >
              {mode === 'signin'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
  minLength,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-white/70">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none transition placeholder:text-white/30 focus:border-white/30"
      />
    </label>
  );
}

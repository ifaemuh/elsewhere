import Image from 'next/image';
import Link from 'next/link';
import { HANDLE, INSTAGRAM_URL } from '@/components/follow-card';

/** The logo (the raccoon's face beside the wordmark) and the two places a reader goes next. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 pt-6">
      <Link href="/" className="flex items-center gap-3" aria-label="Elsewhere home">
        <Image src="/brand/logo-face.png" alt="" width={44} height={44} priority />
        <span className="text-2xl font-extrabold tracking-tight">elsewhere</span>
      </Link>
      <nav aria-label="Main" className="flex items-center gap-5 text-sm font-semibold">
        <Link href="/rules" className="hover:text-[#b4532a]">
          Rules
        </Link>
        <a href={INSTAGRAM_URL} className="hover:text-[#b4532a]">
          {HANDLE}
        </a>
      </nav>
    </header>
  );
}

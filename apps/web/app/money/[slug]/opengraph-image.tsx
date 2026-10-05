import { ImageResponse } from 'next/og';
import { findMoneyRule, moneyRuleParams } from '@/lib/rules/accessors';
import { getLibrary } from '@/lib/rules/library';
import { characterDataUrl } from '@/lib/og/assets';
import { OgFrame } from '@/lib/og/frame';

export const alt = 'Elsewhere money and perks';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return moneyRuleParams(getLibrary());
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const rule = findMoneyRule(getLibrary(), slug);
  return new ImageResponse(
    (
      <OgFrame
        characterSrc={await characterDataUrl(rule?.lead_character ?? 'pigeon')}
        eyebrow="Elsewhere · money and perks"
        title={rule?.title ?? 'What your trip money is owed'}
        footer="Quoted from the source. Not legal advice."
      />
    ),
    size,
  );
}

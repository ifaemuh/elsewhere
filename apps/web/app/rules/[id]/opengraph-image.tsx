import { ImageResponse } from 'next/og';
import { resolveRulePage, staticRuleParams } from '@/lib/rules/accessors';
import { getLibrary } from '@/lib/rules/library';
import { characterDataUrl } from '@/lib/og/assets';
import { OgFrame } from '@/lib/og/frame';

export const alt = 'An Elsewhere travel rule';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return staticRuleParams(getLibrary());
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolution = resolveRulePage(getLibrary(), id);
  const rule = resolution.kind === 'page' ? resolution.rule : null;
  return new ImageResponse(
    (
      <OgFrame
        characterSrc={await characterDataUrl(rule?.lead_character ?? 'capybara')}
        eyebrow="Elsewhere · travel rules"
        title={rule?.title ?? 'Travel rules, explained'}
        footer="Quoted from the source. Not legal advice."
      />
    ),
    size,
  );
}

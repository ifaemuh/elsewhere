import { ImageResponse } from 'next/og';
import { CHARACTER_NAMES } from '@/lib/characters';
import { characterDataUrl } from '@/lib/og/assets';

export const alt = 'Elsewhere — your group trip, watched';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const portraits = await Promise.all(CHARACTER_NAMES.map(async (character) => ({ character, src: await characterDataUrl(character) })));
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#faf8f1', padding: 48 }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 2, color: '#b4532a' }}>ELSEWHERE</div>
        <div style={{ fontSize: 58, fontWeight: 800, color: '#2f3a2c', marginTop: 8 }}>Your group trip, watched.</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', marginTop: 'auto' }}>
          {portraits.map(({ character, src }) => (
            <img key={character} src={src} width={240} height={360} style={{ objectFit: 'contain' }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}

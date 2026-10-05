import { ImageResponse } from 'next/og';
import { CHARACTER_NAMES } from '@/lib/characters';
import { characterDataUrl } from '@/lib/og/assets';
import { findJoinableTrip } from '@/lib/trips/join-lookup';
import { joinPreview } from '@/lib/trips/join-preview';

export const alt = 'You’re invited to a trip on Elsewhere';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Renders inside Messages and WhatsApp. It may show only the trip name, dates, and traveler count.
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const found = await findJoinableTrip((await params).token);
  const preview = found ? joinPreview(found.trip, found.memberCount) : null;
  const portraits = await Promise.all(CHARACTER_NAMES.map((character) => characterDataUrl(character)));
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#faf8f1', padding: 48 }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2, color: '#b4532a' }}>ELSEWHERE</div>
        <div style={{ fontSize: 60, fontWeight: 800, color: '#2f3a2c', marginTop: 8 }}>
          {preview ? `${preview.tripName} · you’re invited` : 'You’re invited'}
        </div>
        <div style={{ fontSize: 32, color: '#4b5745', marginTop: 8 }}>
          {preview ? `${preview.travelerCount} traveler${preview.travelerCount === 1 ? '' : 's'} · ${preview.dates}` : 'Join the trip on Elsewhere'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', marginTop: 'auto' }}>
          {portraits.map((src) => (
            <img key={src.slice(-24)} src={src} width={200} height={300} style={{ objectFit: 'contain' }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}

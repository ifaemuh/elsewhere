import { apiBaseUrl } from './utils';

export interface DestinationRow {
  id: string;
  name: string;
  country: string;
  teaser: string;
  flight_cost: number | string;
  hotel_cost: number | string;
  activity_cost: number | string;
  transfer_cost: number | string;
  partner_fee: number | string;
  is_featured: boolean;
  preview_image_url: string | null;
  created_at: string;
}

export interface PreviewJob {
  id: string;
  user_id: string;
  destination_name: string;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'canceled';
  playback_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export function totalCost(d: DestinationRow): number {
  return (
    Number(d.flight_cost) +
    Number(d.hotel_cost) +
    Number(d.activity_cost) +
    Number(d.transfer_cost) +
    Number(d.partner_fee)
  );
}

export async function fetchDestinations(): Promise<DestinationRow[]> {
  const res = await fetch(`${apiBaseUrl()}/api/v1/destinations`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch destinations: ${res.status}`);
  return res.json();
}

export async function fetchHealth(): Promise<{ status: string; environment: string }> {
  const res = await fetch(`${apiBaseUrl()}/api/v1/health`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function createPreviewJob(
  token: string,
  destination: DestinationRow,
  consentId: string,
  customPrompt?: string,
): Promise<{ jobId: string }> {
  const prompt =
    customPrompt?.trim() ||
    `${destination.teaser} Cinematic travel photography of ${destination.name}, ${destination.country}.`;

  const res = await fetch(`${apiBaseUrl()}/api/v1/preview-jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      destinationId: destination.id,
      destinationName: destination.name,
      prompt,
      mediaType: 'image',
      consentId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Failed to create preview job (${res.status})`);
  }
  return res.json();
}

export async function fetchPreviewJob(token: string, jobId: string): Promise<PreviewJob> {
  const res = await fetch(`${apiBaseUrl()}/api/v1/preview-jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch preview job: ${res.status}`);
  return res.json();
}

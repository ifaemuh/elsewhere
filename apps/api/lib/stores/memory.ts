import { randomUUID } from 'crypto';

// ── Preview Job Store ──

interface PreviewJobRecord {
  id: string;
  user_id: string;
  destination_id: string | null;
  destination_name: string;
  prompt: string;
  media_type: string;
  consent_id: string;
  status: string;
  playback_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  reference_photo_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

const previewJobs = new Map<string, PreviewJobRecord>();

export const previewJobStore = {
  create(data: Omit<PreviewJobRecord, 'id' | 'created_at' | 'updated_at' | 'playback_url' | 'thumbnail_url' | 'error_message'>): PreviewJobRecord {
    const now = new Date().toISOString();
    const job: PreviewJobRecord = {
      ...data,
      id: randomUUID(),
      playback_url: null,
      thumbnail_url: null,
      error_message: null,
      created_at: now,
      updated_at: now,
    };
    previewJobs.set(job.id, job);
    return job;
  },

  get(id: string): PreviewJobRecord | undefined {
    return previewJobs.get(id);
  },

  update(id: string, patch: Partial<PreviewJobRecord>): PreviewJobRecord | undefined {
    const job = previewJobs.get(id);
    if (!job) return undefined;
    const updated = { ...job, ...patch, updated_at: new Date().toISOString() };
    previewJobs.set(id, updated);
    return updated;
  },

  listByUser(userId: string): PreviewJobRecord[] {
    return [...previewJobs.values()].filter((j) => j.user_id === userId);
  },
};

// ── Reference Photo Store ──

interface ReferencePhotoRecord {
  id: string;
  user_id: string;
  file_name: string;
  storage_path: string;
  content_type: string;
  url: string;
  status: 'pending' | 'validated' | 'rejected';
  created_at: string;
  deleted_at: string | null;
}

const referencePhotos = new Map<string, ReferencePhotoRecord>();

export const referencePhotoStore = {
  create(data: Omit<ReferencePhotoRecord, 'id' | 'created_at' | 'deleted_at'>): ReferencePhotoRecord {
    const photo: ReferencePhotoRecord = {
      ...data,
      id: randomUUID(),
      created_at: new Date().toISOString(),
      deleted_at: null,
    };
    referencePhotos.set(photo.id, photo);
    return photo;
  },

  get(id: string): ReferencePhotoRecord | undefined {
    const photo = referencePhotos.get(id);
    if (photo?.deleted_at) return undefined;
    return photo;
  },

  listByUser(userId: string): ReferencePhotoRecord[] {
    return [...referencePhotos.values()].filter(
      (p) => p.user_id === userId && !p.deleted_at,
    );
  },

  delete(id: string): boolean {
    const photo = referencePhotos.get(id);
    if (!photo || photo.deleted_at) return false;
    photo.deleted_at = new Date().toISOString();
    return true;
  },
};

// ── Destinations Store (dev only) ──

const DEV_DESTINATIONS = [
  {
    id: 'dest-tokyo',
    name: 'Tokyo Pulse',
    country: 'Japan',
    teaser: 'Neon-lit nights, ancient temples, and street food that changes your life.',
    flightCost: 1200,
    hotelCost: 800,
    activityCost: 400,
    transferCost: 150,
    partnerFee: 50,
    isFeatured: true,
    previewImageUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dest-paris',
    name: 'Paris Afterglow',
    country: 'France',
    teaser: 'Golden hour over the Seine, hidden wine bars, and rooftop views.',
    flightCost: 900,
    hotelCost: 1000,
    activityCost: 350,
    transferCost: 100,
    partnerFee: 50,
    isFeatured: true,
    previewImageUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dest-bali',
    name: 'Bali Drift',
    country: 'Indonesia',
    teaser: 'Rice terraces at dawn, jungle villas, and surf breaks at sunset.',
    flightCost: 1100,
    hotelCost: 600,
    activityCost: 300,
    transferCost: 80,
    partnerFee: 50,
    isFeatured: true,
    previewImageUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dest-santorini',
    name: 'Santorini Glow',
    country: 'Greece',
    teaser: 'White-washed cliffs, infinite sunsets, and wine overlooking the caldera.',
    flightCost: 950,
    hotelCost: 900,
    activityCost: 300,
    transferCost: 120,
    partnerFee: 50,
    isFeatured: true,
    previewImageUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export const destinationStore = {
  listFeatured() {
    return DEV_DESTINATIONS.filter((d) => d.isFeatured).sort((a, b) => a.name.localeCompare(b.name));
  },

  get(id: string) {
    return DEV_DESTINATIONS.find((d) => d.id === id);
  },
};

// ── Consent Store ──

interface ConsentRecord {
  id: string;
  user_id: string;
  destination_name: string;
  prompt: string;
  has_identity_consent: boolean;
  has_rights_confirmation: boolean;
  has_reference_media: boolean;
  policy_version: string;
  created_at: string;
}

const consents = new Map<string, ConsentRecord>();

export const consentStore = {
  create(data: Omit<ConsentRecord, 'created_at'>): ConsentRecord {
    const consent: ConsentRecord = {
      ...data,
      created_at: new Date().toISOString(),
    };
    consents.set(consent.id, consent);
    return consent;
  },

  get(id: string): ConsentRecord | undefined {
    return consents.get(id);
  },
};

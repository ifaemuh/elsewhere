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

interface MemoryState {
  previewJobs: Map<string, PreviewJobRecord>;
  referencePhotos: Map<string, ReferencePhotoRecord>;
  consents: Map<string, ConsentRecord>;
}

const memory = getMemoryState();
const previewJobs = memory.previewJobs;
const referencePhotos = memory.referencePhotos;
const consents = memory.consents;

function getMemoryState(): MemoryState {
  const globalState = globalThis as typeof globalThis & {
    __elsewhereMemoryState?: MemoryState;
  };

  globalState.__elsewhereMemoryState ??= {
    previewJobs: new Map<string, PreviewJobRecord>(),
    referencePhotos: new Map<string, ReferencePhotoRecord>(),
    consents: new Map<string, ConsentRecord>(),
  };

  return globalState.__elsewhereMemoryState;
}

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
    scenes: [
      {
        id: 'tokyo-night-market',
        name: 'Night Market',
        summary: 'Street food under neon signs',
        prompt: 'Place me walking through a neon-lit Tokyo night market, eating street food, glowing signs, crowded alley, candid travel photography.',
        activityTags: ['food', 'nightlife', 'street'],
      },
      {
        id: 'tokyo-temple-morning',
        name: 'Temple Morning',
        summary: 'Quiet shrine before the city wakes',
        prompt: 'Place me at a peaceful Tokyo temple courtyard in the morning, soft light, wooden architecture, incense smoke, relaxed reflective pose.',
        activityTags: ['culture', 'temple', 'morning'],
      },
      {
        id: 'tokyo-karaoke',
        name: 'Karaoke Night',
        summary: 'Late-night friends energy',
        prompt: 'Place me in a stylish Tokyo karaoke lounge, colorful lights, city view, joyful candid expression, cinematic nightlife photography.',
        activityTags: ['music', 'nightlife', 'friends'],
      },
    ],
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
    scenes: [
      {
        id: 'paris-seine-walk',
        name: 'Seine Walk',
        summary: 'Golden hour by the river',
        prompt: 'Place me walking beside the Seine at golden hour, Paris bridges, warm reflections, effortless travel style, editorial photo.',
        activityTags: ['romantic', 'walking', 'golden-hour'],
      },
      {
        id: 'paris-cafe',
        name: 'Cafe Table',
        summary: 'Morning coffee and pastry',
        prompt: 'Place me seated at a Paris sidewalk cafe with coffee and pastry, classic chairs, soft morning light, candid lifestyle photography.',
        activityTags: ['food', 'cafe', 'morning'],
      },
      {
        id: 'paris-rooftop',
        name: 'Rooftop View',
        summary: 'City lights from above',
        prompt: 'Place me on a Paris rooftop terrace at dusk, city skyline and Eiffel Tower in the distance, relaxed confident pose, cinematic lighting.',
        activityTags: ['rooftop', 'views', 'nightlife'],
      },
    ],
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
    scenes: [
      {
        id: 'bali-rice-terraces',
        name: 'Rice Terraces',
        summary: 'Dawn above emerald fields',
        prompt: 'Place me standing on Bali rice terraces at sunrise, emerald fields, soft mist, relaxed vacation outfit, cinematic travel photography.',
        activityTags: ['nature', 'sunrise', 'culture'],
      },
      {
        id: 'bali-jungle-villa',
        name: 'Jungle Villa',
        summary: 'Poolside in the rainforest',
        prompt: 'Place me at a luxury Bali jungle villa pool, tropical plants, calm water, warm morning light, aspirational but natural vacation photo.',
        activityTags: ['hotel', 'luxury', 'wellness'],
      },
      {
        id: 'bali-surf-sunset',
        name: 'Surf Sunset',
        summary: 'Beach energy at golden hour',
        prompt: 'Place me on a Bali surf beach at sunset holding a surfboard, ocean spray, golden sky, energetic candid travel photo.',
        activityTags: ['beach', 'surf', 'sunset'],
      },
    ],
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
    scenes: [
      {
        id: 'santorini-caldera',
        name: 'Caldera Sunset',
        summary: 'Clifftop sunset view',
        prompt: 'Place me on a Santorini clifftop at sunset, whitewashed buildings, blue domes, caldera view, warm cinematic light.',
        activityTags: ['sunset', 'views', 'romantic'],
      },
      {
        id: 'santorini-sailing',
        name: 'Sailing Day',
        summary: 'Boat day in the Aegean',
        prompt: 'Place me on a sailboat near Santorini, Aegean water, white cliffs in background, relaxed luxury travel photography.',
        activityTags: ['boat', 'water', 'luxury'],
      },
      {
        id: 'santorini-wine',
        name: 'Wine Terrace',
        summary: 'Local wine with a view',
        prompt: 'Place me at a Santorini wine terrace overlooking the sea, table with local wine, soft evening light, candid editorial style.',
        activityTags: ['food', 'wine', 'views'],
      },
    ],
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

import type {
  DiscoverMusicAttribution,
  MusicProviderKind,
  MusicRightsStatus,
  MusicTrack,
  SoundtrackRecommendation,
} from '@elsewhere/shared';

const COMMERCIAL_SONG_LIMITATION =
  'Commercial song is catalog/taste metadata only until Elsewhere has direct sync rights or a rights-cleared provider license.';

function beatGridMs(bpm: number): number {
  return Math.round(60000 / bpm);
}

function elsewhereTrack(input: {
  id: string;
  title: string;
  genre: string;
  bpm: number;
  vibeTags: string[];
}): MusicTrack {
  return {
    id: input.id,
    title: input.title,
    artist: 'Elsewhere Sound Library',
    provider: 'elsewhere_licensed',
    rightsStatus: 'licensed',
    spotifyUrl: null,
    isrc: null,
    bpm: input.bpm,
    beatGridMs: beatGridMs(input.bpm),
    vibeTags: input.vibeTags,
    genre: input.genre,
    loopPoints: [
      {
        startMs: 0,
        endMs: beatGridMs(input.bpm) * 32,
        confidence: 'medium',
      },
    ],
    licenseTerritory: 'worldwide',
    licenseUse: 'in-app demo reels, generated previews, recaps, and export prototypes',
    playableInApp: true,
    audioUrl: null,
    limitation: 'Demo track metadata. Production should attach mastered loopable audio assets.',
  };
}

function spotifyReference(input: {
  id: string;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  vibeTags: string[];
  spotifyUrl: string;
  reason: string;
}): SoundtrackRecommendation {
  const track: MusicTrack = {
    id: input.id,
    title: input.title,
    artist: input.artist,
    provider: 'spotify_catalog',
    rightsStatus: 'spotify_reference_only',
    spotifyUrl: input.spotifyUrl,
    isrc: null,
    bpm: input.bpm,
    beatGridMs: beatGridMs(input.bpm),
    vibeTags: input.vibeTags,
    genre: input.genre,
    loopPoints: [],
    licenseTerritory: null,
    licenseUse: null,
    playableInApp: false,
    audioUrl: null,
    limitation: COMMERCIAL_SONG_LIMITATION,
  };

  return {
    id: `${input.id}-recommendation`,
    track,
    reason: input.reason,
    usePolicy: 'suggest_on_export',
  };
}

const LICENSED_TRACKS: Record<string, MusicTrack> = {
  'elsewhere-boardwalk-after-dark': elsewhereTrack({
    id: 'elsewhere-boardwalk-after-dark',
    title: 'Boardwalk After Dark',
    genre: 'trap soul',
    bpm: 82,
    vibeTags: ['local weekend', 'night lights', 'friends', 'theme park'],
  }),
  'elsewhere-subak-sunrise': elsewhereTrack({
    id: 'elsewhere-subak-sunrise',
    title: 'Subak Sunrise',
    genre: 'afro beats',
    bpm: 104,
    vibeTags: ['Bali', 'rice terraces', 'morning', 'water', 'culture'],
  }),
  'elsewhere-blue-hour-coast': elsewhereTrack({
    id: 'elsewhere-blue-hour-coast',
    title: 'Blue Hour Coast',
    genre: 'ambient',
    bpm: 68,
    vibeTags: ['beach', 'calm', 'memory', 'ocean', 'reflection'],
  }),
  'elsewhere-left-bank-voice-note': elsewhereTrack({
    id: 'elsewhere-left-bank-voice-note',
    title: 'Left Bank Voice Note',
    genre: 'chill hop',
    bpm: 92,
    vibeTags: ['Paris', 'cafe', 'friend trip', 'soft city'],
  }),
  'elsewhere-villa-group-chat': elsewhereTrack({
    id: 'elsewhere-villa-group-chat',
    title: 'Villa Group Chat',
    genre: 'afro beats',
    bpm: 104,
    vibeTags: ['villa', 'group trip', 'Bali', 'reset', 'friends'],
  }),
  'elsewhere-drift': elsewhereTrack({
    id: 'elsewhere-drift',
    title: 'Elsewhere Drift',
    genre: 'chill hop',
    bpm: 92,
    vibeTags: ['travel', 'documentary', 'warm', 'general'],
  }),
};

const COMMERCIAL_RECOMMENDATIONS: SoundtrackRecommendation[] = [
  spotifyReference({
    id: 'spotify-jhene-aiko-while-were-young',
    title: "While We're Young",
    artist: 'Jhene Aiko',
    genre: 'R&B',
    bpm: 92,
    vibeTags: ['beach', 'romantic', 'golden hour', 'soft vacation', 'ocean'],
    spotifyUrl: 'https://open.spotify.com/search/Jhene%20Aiko%20While%20We%27re%20Young',
    reason: 'Beach vacation mood reference for export/share soundtrack selection once platform or direct sync rights are available.',
  }),
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function getLicensedMusicTrack(title: string, genre: string): MusicTrack {
  const normalized = normalize(title);
  const match = Object.values(LICENSED_TRACKS).find((track) => normalize(track.title) === normalized);
  if (match) return match;

  const fallbackId = genre.includes('ambient') ? 'elsewhere-blue-hour-coast' : 'elsewhere-drift';
  return LICENSED_TRACKS[fallbackId];
}

export function musicAttributionFromTrack(track: MusicTrack): DiscoverMusicAttribution {
  return {
    trackId: track.id,
    title: track.title,
    artistOrLibrary: track.artist,
    genre: track.genre,
    licenseKind: track.rightsStatus === 'rights_pending' ? 'rights_pending' : 'licensed',
    rightsStatus: track.rightsStatus,
    provider: track.provider,
    spotifyUrl: track.spotifyUrl,
    isrc: track.isrc,
    bpm: track.bpm,
    beatGridMs: track.beatGridMs,
    loopPoints: track.loopPoints,
    vibeTags: track.vibeTags,
    licenseTerritory: track.licenseTerritory,
    licenseUse: track.licenseUse,
    playableInApp: track.playableInApp,
  };
}

export function recommendSoundtracks(input: {
  title: string;
  locationLabel?: string;
  contentTopics?: string[];
  music?: DiscoverMusicAttribution;
}): SoundtrackRecommendation[] {
  const haystack = normalize([
    input.title,
    input.locationLabel,
    ...(input.contentTopics ?? []),
    input.music?.genre,
  ].filter(Boolean).join(' '));

  if (!/(beach|bali|coast|ocean|villa|romantic|reset)/.test(haystack)) return [];
  return COMMERCIAL_RECOMMENDATIONS;
}

export const MUSIC_PROVIDER_COVERAGE: Array<{
  provider: string;
  providerKind: MusicProviderKind;
  rightsStatus: MusicRightsStatus;
  detail: string;
}> = [
  {
    provider: 'Elsewhere Sound Library',
    providerKind: 'elsewhere_licensed',
    rightsStatus: 'licensed',
    detail: 'Licensed/owned beds are safe for in-app sync and demo exports.',
  },
  {
    provider: 'Spotify Catalog',
    providerKind: 'spotify_catalog',
    rightsStatus: 'spotify_reference_only',
    detail: 'Spotify is used for taste, deep links, and soundtrack suggestions only; it is not used for in-app sync playback.',
  },
  {
    provider: 'Direct commercial rights',
    providerKind: 'direct_label',
    rightsStatus: 'rights_pending',
    detail: 'Commercial sync requires direct label/publisher or rights-cleared catalog agreements before in-app use.',
  },
];

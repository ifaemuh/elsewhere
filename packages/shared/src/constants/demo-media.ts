export interface DemoMediaAsset {
  mediaUrl: string;
  posterUrl?: string;
  fallbackAllowed: boolean;
}

const local = (path: string): string => `/api/v1/local-assets/${path}`;

export const DEMO_MEDIA = {
  discover: {
    editorial: {
      anaheimThemePark: local('editorial/anaheim-theme-park.jpg'),
      socalBeachWeekend: local('editorial/socal-beach-weekend.jpg'),
      laDinnerPatio: local('editorial/la-dinner-patio.jpg'),
      ryokanWeekend: local('editorial/japan-ryokan-weekend.jpg'),
      parisLeftBank: local('editorial/paris-left-bank.jpg'),
      santoriniCyclades: local('editorial/santorini-cyclades.jpg'),
      baliRiceTerraces: local('editorial/bali-rice-terraces.jpg'),
      marrakechRiad: local('editorial/marrakech-riad.jpg'),
      icelandBlueHour: local('editorial/iceland-blue-hour.jpg'),
      mexicoCityFood: local('editorial/mexico-city-food.jpg'),
      amalfiBoatDay: local('editorial/amalfi-boat-day.jpg'),
      peruSacredValley: local('editorial/peru-sacred-valley.jpg'),
      seoulNightMarket: local('editorial/seoul-night-market.jpg'),
      kyotoSpringFestival: local('editorial/kyoto-spring-festival.jpg'),
      lisbonTileStay: local('editorial/lisbon-tile-stay.jpg'),
    },
    personalized: {
      tokyoStill: local('personalized/dev-user-000/tokyo-night-market.jpeg'),
      baliStill: local('personalized/dev-user-000/bali-rice-terrace.jpeg'),
      parisStill: local('personalized/dev-user-000/paris-left-bank.jpeg'),
      tokyoGroupStill: local('personalized/dev-user-000/tokyo-group.jpeg'),
      baliGroupStill: local('personalized/dev-user-000/bali-group.jpeg'),
      parisGroupStill: local('personalized/dev-user-000/paris-group.jpeg'),
      tokyoVideo: local('personalized-videos/dev-user-000/tokyo-night-market.mp4'),
      baliVideo: local('personalized-videos/dev-user-000/bali-rice-terrace.mp4'),
      parisVideo: local('personalized-videos/dev-user-000/paris-left-bank.mp4'),
    },
    friendAvatars: {
      you: local('avatars/user/dev-user-000.jpeg'),
      mia: local('avatars/friends/mia.jpeg'),
      alex: local('avatars/friends/alex.jpeg'),
      jordan: local('avatars/friends/jordan.jpeg'),
      taylor: local('avatars/friends/taylor.jpeg'),
      sam: local('avatars/friends/sam.jpeg'),
    },
  },
  trips: {
    headers: {
      tokyo: local('trips/tokyo-2026-header.jpg'),
      paris: local('trips/paris-2026-header.jpg'),
      bali: local('trips/bali-2026-header.jpg'),
      lisbon: local('trips/lisbon-2026-header.jpg'),
      default: local('trips/tokyo-2026-header.jpg'),
    },
    schedule: {
      tokyoRamen: local('trips/tokyo-ramen-nagi.jpg'),
      tokyoGoldenGai: local('trips/tokyo-golden-gai-jazz.jpg'),
      parisDinner: local('trips/paris-montmartre-dinner.jpg'),
      parisRooftop: local('trips/paris-rooftop-night.jpg'),
      baliYoga: local('trips/bali-ubud-yoga.jpg'),
      baliSurf: local('trips/bali-canggu-surf.jpg'),
      lisbonTram: local('trips/lisbon-alfama-tram.jpg'),
      lisbonDinner: local('trips/lisbon-fado-dinner.jpg'),
    },
    explore: {
      tokyoFood: local('trips/tokyo-omoide-yokocho.jpg'),
      tokyoListeningBar: local('trips/tokyo-listening-bar.jpg'),
      parisFrenchie: local('trips/paris-frenchie-wine.jpg'),
      parisMuseum: local('trips/paris-romantique-museum.jpg'),
      baliLocavore: local('trips/bali-locavore.jpg'),
      baliSpa: local('trips/bali-hotel-spa.jpg'),
    },
    media: {
      tokyoPhoto: local('trips/tokyo-trip-photo-shinjuku.jpg'),
      tokyoDinner: local('trips/tokyo-trip-dinner.jpg'),
      tokyoSocial: local('trips/tokyo-trip-social.jpg'),
      tokyoVideoPoster: local('trips/tokyo-trip-video-poster.jpg'),
      tokyoTiktok: local('trips/tokyo-trip-tiktok.jpg'),
      lisbonPhoto: local('trips/lisbon-alfama-tram.jpg'),
      lisbonDinner: local('trips/lisbon-fado-dinner.jpg'),
      lisbonSocial: local('trips/lisbon-2026-header.jpg'),
      lisbonRecapPoster: local('trips/lisbon-recap-poster.jpg'),
      tokyoVideo: local('personalized-videos/dev-user-000/tokyo-night-market.mp4'),
      baliVideo: local('personalized-videos/dev-user-000/bali-rice-terrace.mp4'),
      parisVideo: local('personalized-videos/dev-user-000/paris-left-bank.mp4'),
    },
  },
} as const;

export const DEMO_MEDIA_METADATA = {
  [DEMO_MEDIA.discover.editorial.anaheimThemePark]: {
    source: 'pexels',
    location: 'Anaheim / Southern California',
    fallbackAllowed: false,
    credit: 'Pexels stock photo',
  },
  [DEMO_MEDIA.discover.editorial.socalBeachWeekend]: {
    source: 'pexels',
    location: 'Southern California',
    fallbackAllowed: false,
    credit: 'Pexels stock photo',
  },
  [DEMO_MEDIA.discover.editorial.laDinnerPatio]: {
    source: 'pexels',
    location: 'Los Angeles',
    fallbackAllowed: false,
    credit: 'Pexels stock photo',
  },
  [DEMO_MEDIA.discover.editorial.ryokanWeekend]: {
    source: 'local',
    location: 'Nikko and Hakone',
    fallbackAllowed: false,
  },
  [DEMO_MEDIA.discover.editorial.parisLeftBank]: {
    source: 'local',
    location: 'Paris',
    fallbackAllowed: false,
  },
} as const;

export const DEMO_MEDIA_MANIFEST = [
  ...Object.values(DEMO_MEDIA.discover.editorial),
  ...Object.values(DEMO_MEDIA.discover.personalized),
  ...Object.values(DEMO_MEDIA.discover.friendAvatars),
  ...Object.values(DEMO_MEDIA.trips.headers),
  ...Object.values(DEMO_MEDIA.trips.schedule),
  ...Object.values(DEMO_MEDIA.trips.explore),
  ...Object.values(DEMO_MEDIA.trips.media),
] as const;

function normalized(value: string | undefined): string {
  return value?.toLowerCase() ?? '';
}

export function getDemoDiscoverPersonalizedAsset(destinationName: string | undefined): DemoMediaAsset {
  const value = normalized(destinationName);
  if (value.includes('bali')) {
    return {
      mediaUrl: DEMO_MEDIA.discover.personalized.baliVideo,
      posterUrl: DEMO_MEDIA.discover.personalized.baliStill,
      fallbackAllowed: false,
    };
  }
  if (value.includes('paris')) {
    return {
      mediaUrl: DEMO_MEDIA.discover.personalized.parisVideo,
      posterUrl: DEMO_MEDIA.discover.personalized.parisStill,
      fallbackAllowed: false,
    };
  }
  return {
    mediaUrl: DEMO_MEDIA.discover.personalized.tokyoVideo,
    posterUrl: DEMO_MEDIA.discover.personalized.tokyoStill,
    fallbackAllowed: false,
  };
}

export function getDemoTripHeaderPath(destinationName: string | undefined): string {
  const value = normalized(destinationName);
  if (value.includes('paris')) return DEMO_MEDIA.trips.headers.paris;
  if (value.includes('bali')) return DEMO_MEDIA.trips.headers.bali;
  if (value.includes('lisbon')) return DEMO_MEDIA.trips.headers.lisbon;
  if (value.includes('tokyo') || value.includes('japan')) return DEMO_MEDIA.trips.headers.tokyo;
  return DEMO_MEDIA.trips.headers.default;
}

export function getDemoTripSuggestionAsset(
  suggestionId: string,
  destinationName: string | undefined,
): DemoMediaAsset {
  const destination = normalized(destinationName);
  if (suggestionId === 'suggest-bali-warung') {
    return { mediaUrl: DEMO_MEDIA.trips.explore.baliLocavore, fallbackAllowed: false };
  }
  if (suggestionId === 'suggest-bali-spa') {
    return { mediaUrl: DEMO_MEDIA.trips.explore.baliSpa, fallbackAllowed: false };
  }
  if (suggestionId === 'suggest-night-food' && destination.includes('paris')) {
    return { mediaUrl: DEMO_MEDIA.trips.explore.parisFrenchie, fallbackAllowed: false };
  }
  if (suggestionId === 'suggest-gallery-slot' && destination.includes('paris')) {
    return { mediaUrl: DEMO_MEDIA.trips.explore.parisMuseum, fallbackAllowed: false };
  }
  if (suggestionId === 'suggest-gallery-slot') {
    return { mediaUrl: DEMO_MEDIA.trips.explore.tokyoListeningBar, fallbackAllowed: false };
  }
  return { mediaUrl: DEMO_MEDIA.trips.explore.tokyoFood, fallbackAllowed: false };
}

export function getDemoTripSuggestionGallery(
  suggestionId: string,
  destinationName: string | undefined,
): string[] {
  const primary = getDemoTripSuggestionAsset(suggestionId, destinationName).mediaUrl;
  const destination = normalized(destinationName);
  if (destination.includes('bali')) {
    return [primary, DEMO_MEDIA.trips.schedule.baliYoga, DEMO_MEDIA.trips.schedule.baliSurf];
  }
  if (destination.includes('paris')) {
    return [primary, DEMO_MEDIA.trips.schedule.parisDinner, DEMO_MEDIA.trips.schedule.parisRooftop];
  }
  if (destination.includes('lisbon')) {
    return [primary, DEMO_MEDIA.trips.schedule.lisbonTram, DEMO_MEDIA.trips.schedule.lisbonDinner];
  }
  return [primary, DEMO_MEDIA.trips.schedule.tokyoRamen, DEMO_MEDIA.trips.schedule.tokyoGoldenGai];
}

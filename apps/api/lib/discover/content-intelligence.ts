import { randomUUID } from 'crypto';
import {
  DEMO_MEDIA,
  DEMO_MEDIA_METADATA,
  type DiscoverAudioMix,
  type DiscoverContentSource,
  type DiscoverContentSourceKind,
  type DiscoverEditorialShortRequest,
  type DiscoverEnrichRequest,
  type DiscoverEnrichResult,
  type DiscoverFeedItem,
  type DiscoverFeedResponse,
  type DiscoverFeedScope,
  type DiscoverMediaMode,
  type DiscoverMusicAttribution,
  type DiscoverRightsStatus,
  type DiscoverSocialLinkRequest,
  type DiscoverSocialLinkResult,
  type DiscoverTripProposal,
  type DiscoverTripValue,
  type EditorialShort,
} from '@elsewhere/shared';
import {
  MUSIC_PROVIDER_COVERAGE,
  getLicensedMusicTrack,
  musicAttributionFromTrack,
  recommendSoundtracks,
} from './music-providers';

type ProviderCoverage = DiscoverFeedResponse['providerCoverage'][number];

interface CreatorInspirationPattern {
  source: string;
  pattern: string;
  allowedUse: 'inspiration_only' | 'embed_or_link_only' | 'licensed_required';
}

export const CREATOR_INSPIRATION_REGISTRY: CreatorInspirationPattern[] = [
  {
    source: 'EarthPix / Beautiful Destinations style accounts',
    pattern: 'Lead with impossible first frames, location specificity, and save-worthy captions.',
    allowedUse: 'inspiration_only',
  },
  {
    source: 'YouTube travel creators',
    pattern: 'Use official embeds or link-outs for creator videos; summarize trip hooks only when allowed.',
    allowedUse: 'embed_or_link_only',
  },
  {
    source: 'Instagram / TikTok travel posts',
    pattern: 'Treat as user-shared links, partner submissions, or licensed creator content.',
    allowedUse: 'licensed_required',
  },
];

function hasEnv(...keys: string[]): boolean {
  return keys.some((key) => Boolean(process.env[key]));
}

function providerCoverage(): ProviderCoverage[] {
  return [
    {
      provider: 'Pexels',
      sourceKind: 'pexels',
      status: hasEnv('PEXELS_API_KEY') ? 'connected' : 'local_demo',
      detail: hasEnv('PEXELS_API_KEY')
        ? 'Real photo/video ingestion can run through the Pexels API.'
        : 'Using cached Pexels-style local demo media until PEXELS_API_KEY is set.',
    },
    {
      provider: 'Google Places',
      sourceKind: 'google_places',
      status: hasEnv('GOOGLE_PLACES_API_KEY', 'GOOGLE_MAPS_API_KEY') ? 'connected' : 'missing_credentials',
      detail: 'Venue, hotel, restaurant, and attraction photos/details require a Google Places API key.',
    },
    {
      provider: 'YouTube Data API',
      sourceKind: 'youtube',
      status: hasEnv('YOUTUBE_API_KEY') ? 'connected' : 'missing_credentials',
      detail: 'Public destination video search is disabled until YOUTUBE_API_KEY is configured.',
    },
    {
      provider: 'OpenAI Sora',
      sourceKind: 'ai_generated',
      status: hasEnv('OPENAI_API_KEY') ? 'connected' : 'missing_credentials',
      detail: 'Editorial shorts can request generated B-roll when OpenAI video access is available.',
    },
    {
      provider: 'Deal Radar',
      sourceKind: 'local_demo',
      status: 'local_demo',
      detail: 'Deal and affordability signals use the local Deal Radar fixture until official provider keys are connected.',
    },
    ...MUSIC_PROVIDER_COVERAGE.map((coverage) => ({
      provider: coverage.provider,
      sourceKind: 'partner' as const,
      status: coverage.rightsStatus === 'licensed' ? 'connected' as const : 'not_configured' as const,
      detail: coverage.detail,
    })),
  ];
}

function bpmForGenre(genre: string): number {
  if (genre.includes('afro')) return 104;
  if (genre.includes('trap')) return 82;
  if (genre.includes('house') || genre.includes('electronic')) return 116;
  if (genre.includes('ambient')) return 68;
  return 92;
}

function music(title: string, genre: string, artistOrLibrary = 'Elsewhere Sound Library'): DiscoverMusicAttribution {
  if (artistOrLibrary === 'Elsewhere Sound Library') {
    return musicAttributionFromTrack(getLicensedMusicTrack(title, genre));
  }

  return {
    title,
    artistOrLibrary,
    genre,
    licenseKind: 'rights_pending',
    rightsStatus: 'rights_pending',
    provider: 'direct_label',
    spotifyUrl: null,
    isrc: null,
    bpm: bpmForGenre(genre),
    beatGridMs: Math.round(60000 / bpmForGenre(genre)),
    loopPoints: [],
    vibeTags: [genre],
    licenseTerritory: null,
    licenseUse: null,
    playableInApp: false,
  };
}

function inferMediaMode(input: DiscoverFeedItem): DiscoverMediaMode {
  if (input.kind === 'personal_preview' || input.postType === 'personal_preview') return 'personal_ai';
  if (input.contentSources?.some((source) => source.kind === 'youtube' || source.kind === 'social_link')) return 'embed';
  if (input.mediaType === 'video') return input.contentSources?.some((source) => source.kind === 'ai_generated') ? 'ai_video' : 'video';
  return 'animated_still';
}

function inferRightsStatus(input: DiscoverFeedItem): DiscoverRightsStatus {
  if (input.contentSources?.some((source) => source.kind === 'social_link' || source.kind === 'youtube')) return 'embed_only';
  if (input.contentSources?.some((source) => source.kind === 'partner') || input.sponsored) return 'partner';
  if (input.contentSources?.some((source) => source.kind === 'pexels')) return 'licensed';
  if (input.contentSources?.some((source) => source.kind === 'ai_generated')) return 'owned';
  return 'owned';
}

function mediaSource(mediaUrl: string, fallbackKind: DiscoverContentSourceKind = 'local_demo'): DiscoverContentSource {
  const metadata = DEMO_MEDIA_METADATA[mediaUrl as keyof typeof DEMO_MEDIA_METADATA];
  const kind = metadata?.source === 'pexels' ? 'pexels' : fallbackKind;
  return {
    kind,
    name: kind === 'pexels' ? 'Pexels cached media' : 'Elsewhere demo media',
    url: null,
    attribution: metadata?.credit ?? null,
    freshnessLabel: metadata?.source === 'pexels' ? 'Cached for MVP demo' : 'Local demo asset',
    limitation: kind === 'pexels'
      ? 'Licensed/cached media for MVP display; final production feed should refresh through the provider API.'
      : 'Demo media stands in for provider or partner content.',
  };
}

function value(
  totalEstimateAmount: number,
  monthlyAmount: number,
  label: string,
  confidence: DiscoverTripValue['confidence'] = 'medium',
): DiscoverTripValue {
  return {
    totalEstimateAmount,
    monthlyAmount,
    financingMonths: 12,
    currencyCode: 'USD',
    confidence,
    label,
    limitation: 'Demo affordability estimate. Final monthly terms require lender approval and live inventory verification.',
  };
}

function proposal(input: {
  destination: string;
  origin?: string | null;
  dateWindow: string;
  calendarFit: string;
  groupFit: string;
  dealTrend: DiscoverTripProposal['dealTrend'];
  flight: number;
  stay: number;
  activity: number;
  anchor: string;
}): DiscoverTripProposal {
  return {
    origin: input.origin ?? 'Los Angeles',
    destination: input.destination,
    dateWindow: input.dateWindow,
    calendarFit: input.calendarFit,
    groupFit: input.groupFit,
    dealTrend: input.dealTrend,
    flightEstimateAmount: input.flight,
    stayEstimateAmount: input.stay,
    activityEstimateAmount: input.activity,
    components: [
      {
        id: 'flight',
        kind: 'flight',
        title: `${input.origin ?? 'Los Angeles'} to ${input.destination}`,
        summary: 'Flight-first estimate with date-shift monitoring and nearby-airport checks.',
        estimatedPriceAmount: input.flight,
        sourceKind: 'local_demo',
      },
      {
        id: 'stay',
        kind: 'hotel',
        title: 'Cancellable stay shortlist',
        summary: 'Hotel or Airbnb-style stay options close to the anchor activity or easiest transit zone.',
        estimatedPriceAmount: input.stay,
        sourceKind: 'local_demo',
      },
      {
        id: 'anchor',
        kind: 'activity',
        title: input.anchor,
        summary: 'The emotional center of the trip, kept flexible until the group approves timing and budget.',
        estimatedPriceAmount: input.activity,
        sourceKind: 'local_demo',
      },
    ],
    assistWatchItems: [
      'Flight price direction and cheaper date windows',
      'Hotel cancellation windows and rate drops',
      'Event or activity availability',
      'Calendar conflicts and group approval timing',
    ],
  };
}

function editorialShort(input: {
  hook: string;
  fact: string;
  ctaLabel?: string;
  mediaUrl?: string;
}): EditorialShort {
  return {
    hook: input.hook,
    script: `${input.hook} ${input.fact} Elsewhere can turn the moment into dates, flights, stays, and a watched trip plan.`,
    captionText: input.fact,
    narrationUrl: null,
    durationSeconds: 12,
    ctaLabel: input.ctaLabel ?? 'Tap to see it for yourself',
    disclosure: 'Demo narration script. Voiceover generation uses OpenAI TTS when enabled.',
  };
}

function compactSentence(value: string | undefined, maxLength = 104): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const firstSentence = normalized.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? normalized;
  if (firstSentence.length <= maxLength) return firstSentence;
  return `${firstSentence.slice(0, maxLength - 1).trim()}...`;
}

function textTreatmentFor(input: DiscoverFeedItem): NonNullable<DiscoverFeedItem['textTreatment']> {
  if (input.interactivePrompt || input.kind === 'interactive_prompt') return 'question';
  if (input.adminAction || input.kind === 'travel_admin') return 'admin';
  if (input.kind === 'personal_deal' || input.postType === 'personal_deal' || input.kind === 'deal') return 'deal';
  if (
    input.kind === 'personal_preview' ||
    input.kind === 'personal_trip_ad' ||
    input.kind === 'occasion' ||
    input.postType === 'personal_trip_ad'
  ) {
    return 'personal';
  }
  return 'documentary';
}

function captionBeatsFor(input: DiscoverFeedItem): NonNullable<DiscoverFeedItem['captionBeats']> {
  const hook = compactSentence(input.hook ?? input.editorialShort?.hook ?? input.title, 92);
  const location = input.locationLabel ?? input.tripProposal?.destination ?? input.curationAction.destinationName ?? input.title;
  const detail = compactSentence(input.editorialShort?.captionText ?? input.detail, 112);
  const valueLabel = input.priceBadgeLabel ?? input.primaryValueLabel ?? input.tripValue?.label;

  if (input.interactivePrompt) {
    return [
      {
        id: `${input.id}-beat-hook`,
        text: hook,
        emphasis: location,
        startMs: 0,
        durationMs: 1800,
      },
      {
        id: `${input.id}-beat-question`,
        text: input.interactivePrompt.question,
        emphasis: input.interactivePrompt.contextLabel || 'field question',
        startMs: input.interactivePrompt.revealAfterMs ?? 2200,
        durationMs: 2600,
      },
      {
        id: `${input.id}-beat-answer`,
        text: 'Pick an answer. The route changes with the story.',
        emphasis: 'choose',
        startMs: (input.interactivePrompt.revealAfterMs ?? 2200) + 2500,
        durationMs: 1800,
      },
    ];
  }

  if (textTreatmentFor(input) === 'deal') {
    return [
      {
        id: `${input.id}-beat-hook`,
        text: hook,
        emphasis: location,
        startMs: 0,
        durationMs: 1800,
      },
      {
        id: `${input.id}-beat-value`,
        text: valueLabel ? `${valueLabel}, only because the timing fits.` : 'This deal only appears because the timing fits.',
        emphasis: valueLabel ?? 'relevant deal',
        startMs: 1900,
        durationMs: 2400,
      },
      {
        id: `${input.id}-beat-watch`,
        text: compactSentence(input.relevanceReason ?? input.detail, 104),
        emphasis: 'Assist watching',
        startMs: 4300,
        durationMs: 2600,
      },
    ];
  }

  if (textTreatmentFor(input) === 'personal') {
    return [
      {
        id: `${input.id}-beat-hook`,
        text: hook,
        emphasis: 'your group',
        startMs: 0,
        durationMs: 1900,
      },
      {
        id: `${input.id}-beat-context`,
        text: compactSentence(input.relevanceReason ?? input.detail, 104),
        emphasis: valueLabel ?? location,
        startMs: 2000,
        durationMs: 2600,
      },
      {
        id: `${input.id}-beat-action`,
        text: 'Invite, split, watch the price, then let Assist protect the plan.',
        emphasis: 'make it real',
        startMs: 4700,
        durationMs: 2600,
      },
    ];
  }

  if (textTreatmentFor(input) === 'admin') {
    return [
      {
        id: `${input.id}-beat-hook`,
        text: hook,
        emphasis: input.adminAction?.kind.replace('_', ' ') ?? 'travel admin',
        startMs: 0,
        durationMs: 2200,
      },
      {
        id: `${input.id}-beat-deadline`,
        text: input.adminAction
          ? `${input.adminAction.statusLabel}. ${input.adminAction.deadlineLabel}.`
          : detail,
        emphasis: input.adminAction?.actionLabel ?? 'handle it',
        startMs: 2300,
        durationMs: 2600,
      },
    ];
  }

  return [
    {
      id: `${input.id}-beat-hook`,
      text: hook,
      emphasis: location,
      startMs: 0,
      durationMs: 2100,
    },
    {
      id: `${input.id}-beat-story`,
      text: detail,
      emphasis: input.editorialShort ? 'field note' : input.postType?.replace('_', ' ') ?? 'travel story',
      startMs: 2100,
      durationMs: 3200,
    },
    {
      id: `${input.id}-beat-plan`,
      text: valueLabel ? `Elsewhere can turn it into dates, stays, and ${valueLabel}.` : 'Elsewhere can turn it into dates, stays, and a watched plan.',
      emphasis: 'plan this',
      startMs: 5400,
      durationMs: 2600,
    },
  ];
}

function narrationFor(
  input: DiscoverFeedItem,
  captionBeats: NonNullable<DiscoverFeedItem['captionBeats']>,
): NonNullable<DiscoverFeedItem['narration']> {
  return {
    script: input.editorialShort?.script ?? captionBeats.map((beat) => beat.text).join(' '),
    voiceLabel: input.interactivePrompt ? 'curious field host' : 'warm documentary guide',
    audioUrl: null,
    captionsAvailable: true,
    syncOffsetMs: 0,
    disclosure: 'Narration-ready script. OpenAI TTS can generate synced audio when enabled.',
  };
}

function alignToBeat(durationMs: number | undefined, beatGridMs: number, beats = 4): number {
  const minimum = beatGridMs * beats;
  if (!durationMs) return Math.round(minimum);
  return Math.round(Math.max(minimum, Math.round(durationMs / beatGridMs) * beatGridMs));
}

function audioMixFor(
  input: DiscoverFeedItem,
  musicTrack: DiscoverMusicAttribution,
  narration: NonNullable<DiscoverFeedItem['narration']>,
): DiscoverAudioMix {
  const bpm = musicTrack.bpm ?? bpmForGenre(musicTrack.genre);
  const beatGridMs = musicTrack.beatGridMs ?? Math.round(60000 / bpm);
  const hasEmbeddedAudio = input.mediaType === 'video';
  const playableMusicUrl = musicTrack.playableInApp === false ? null : null;
  return {
    mode: narration.audioUrl && playableMusicUrl ? 'music_plus_voice' : hasEmbeddedAudio ? 'video_embedded' : 'narration_ready',
    musicTrackId: musicTrack.trackId,
    bpm,
    beatGridMs,
    musicUrl: playableMusicUrl,
    narrationUrl: narration.audioUrl,
    cues: [
      {
        id: `${input.id}-intro-cue`,
        trackId: musicTrack.trackId ?? `inline-${input.id}`,
        startMs: 0,
        durationMs: beatGridMs * 16,
        beatAligned: true,
        captionBeatIds: (input.captionBeats ?? []).slice(0, 3).map((beat) => beat.id),
      },
    ],
    loopStrategy: hasEmbeddedAudio ? 'seamless_loop' : 'poster_motion',
    limitation: narration.audioUrl
      ? null
      : 'Audio is narration-ready in this demo feed. Commercial songs stay recommendations until direct sync rights are cleared.',
  };
}

function item(input: DiscoverFeedItem): DiscoverFeedItem {
  const musicTrack = input.music ?? music('Elsewhere Drift', 'chill hop');
  const bpm = musicTrack.bpm ?? bpmForGenre(musicTrack.genre);
  const beatGridMs = Math.round(60000 / bpm);
  const captionBeats = (input.captionBeats ?? captionBeatsFor(input)).map((beat) => ({
    ...beat,
    durationMs: alignToBeat(beat.durationMs, beatGridMs),
  }));
  const narration = input.narration ?? narrationFor(input, captionBeats);

  return {
    ...input,
    hook: input.hook ?? input.editorialShort?.hook ?? input.title,
    creatorLabel: input.creatorLabel ?? input.advertiserName ?? input.sourceLine.split('·')[0].trim(),
    mediaMode: input.mediaMode ?? inferMediaMode(input),
    rightsStatus: input.rightsStatus ?? inferRightsStatus(input),
    music: musicTrack,
    textTreatment: input.textTreatment ?? textTreatmentFor(input),
    captionBeats,
    narration,
    audioMix: input.audioMix ?? audioMixFor(input, musicTrack, narration),
    soundtrackRecommendations: input.soundtrackRecommendations ?? recommendSoundtracks({
      title: input.title,
      locationLabel: input.locationLabel,
      contentTopics: input.contentTopics,
      music: musicTrack,
    }),
    primaryAction: input.primaryAction ?? input.curationAction,
    assistWatchItems: input.assistWatchItems ?? input.tripProposal?.assistWatchItems,
  };
}

function hereItems(): DiscoverFeedItem[] {
  const anaheim = DEMO_MEDIA.discover.editorial.anaheimThemePark;
  const coast = DEMO_MEDIA.discover.editorial.socalBeachWeekend;
  const dinner = DEMO_MEDIA.discover.editorial.laDinnerPatio;

  return [
    item({
      id: 'ci-here-sponsored-anaheim',
      kind: 'sponsored',
      feedScope: 'here',
      postType: 'sponsored_native',
      hook: 'A theme-park weekend you can actually make happen.',
      title: 'Anaheim weekend, already priced',
      detail: 'One park day, a walkable stay, late checkout, and a group-friendly payment plan for a low-friction local escape.',
      mediaType: 'image',
      mediaUrl: anaheim,
      mediaPosterUrl: anaheim,
      sponsored: true,
      advertiserName: 'Anaheim stay partner',
      targetingReason: 'Local weekend fit from Southern California with flexible arrival timing.',
      sourceLine: 'Partner stay signal · Anaheim · weekend window',
      locationLabel: 'Anaheim',
      primaryValueLabel: 'from $142/mo',
      contentSources: [mediaSource(anaheim, 'pexels')],
      music: music('Boardwalk After Dark', 'trap soul'),
      tripValue: value(1704, 142, 'Anaheim from $142/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Anaheim',
        origin: 'Los Angeles',
        dateWindow: 'Next open Friday-Sunday',
        calendarFit: 'Works as a driveable weekend with no PTO.',
        groupFit: 'Best for 2-4 friends or a family trip with split payments.',
        dealTrend: 'watching',
        flight: 0,
        stay: 760,
        activity: 720,
        anchor: 'Theme-park day with late-night ride block',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan an Anaheim theme-park weekend with a nearby hotel, one park day, flexible arrival, and group payments.',
        destinationName: 'Anaheim',
      },
    }),
    item({
      id: 'ci-here-editorial-coast',
      kind: 'editorial',
      feedScope: 'here',
      postType: 'itinerary_spark',
      hook: 'Save this no-airport coastal reset.',
      title: 'A coastal reset without the airport',
      detail: 'A close-to-home loop built around morning light, one beach stop, a sunset table, and enough slack for traffic.',
      mediaType: 'image',
      mediaUrl: coast,
      mediaPosterUrl: coast,
      sourceLine: 'Editorial · driveable weekend · real local media',
      locationLabel: 'Southern California',
      primaryValueLabel: 'from $96/mo',
      contentSources: [mediaSource(coast, 'pexels')],
      music: music('Coastline Low Tide', 'beach house'),
      tripValue: value(1152, 96, 'SoCal coast from $96/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Southern California coast',
        origin: 'Los Angeles',
        dateWindow: 'Saturday-Sunday or 3-day weekend',
        calendarFit: 'Designed for no-flight weekends and calendar gaps.',
        groupFit: 'Easy for friends who want a soft plan and a strong dinner.',
        dealTrend: 'flat',
        flight: 0,
        stay: 540,
        activity: 180,
        anchor: 'Sunset dinner near the water',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a Southern California coastal weekend with beach time, one great dinner, a relaxed stay, and flexible drive timing.',
        destinationName: 'Southern California',
      },
    }),
    item({
      id: 'ci-here-live-la-dinner',
      kind: 'live_view',
      feedScope: 'here',
      postType: 'live_view',
      hook: 'Tonight has a patio window.',
      title: 'Tonight’s patio window',
      detail: 'Elsewhere is watching weather, reservation timing, and nearby stays so a dinner plan can become an overnight without feeling overbuilt.',
      mediaType: 'image',
      mediaUrl: dinner,
      mediaPosterUrl: dinner,
      sourceLine: 'Live local watch · Los Angeles · reservation timing',
      locationLabel: 'Los Angeles',
      primaryValueLabel: 'from $58/mo',
      contentSources: [
        mediaSource(dinner, 'pexels'),
        {
          kind: 'live_camera',
          name: 'Local conditions demo',
          url: null,
          attribution: null,
          freshnessLabel: 'Demo freshness: updated 18 min ago',
          limitation: 'Production live views require licensed webcam, partner, or official feed access.',
        },
      ],
      tripValue: value(696, 58, 'LA overnight from $58/mo', 'low'),
      tripProposal: proposal({
        destination: 'Los Angeles',
        origin: 'Los Angeles',
        dateWindow: 'Tonight or this weekend',
        calendarFit: 'Good for same-day openings and short overnight windows.',
        groupFit: 'Best for 2 people or a small dinner group.',
        dealTrend: 'watching',
        flight: 0,
        stay: 310,
        activity: 190,
        anchor: 'Dinner reservation and late checkout',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a Los Angeles dinner-led overnight with reservation timing, nearby stay options, and a low-stress next morning.',
        destinationName: 'Los Angeles',
      },
    }),
  ];
}

function elsewhereItems(): DiscoverFeedItem[] {
  const ryokan = DEMO_MEDIA.discover.editorial.ryokanWeekend;
  const bali = DEMO_MEDIA.discover.editorial.baliRiceTerraces;
  const paris = DEMO_MEDIA.discover.editorial.parisLeftBank;
  const santorini = DEMO_MEDIA.discover.editorial.santoriniCyclades;
  const marrakech = DEMO_MEDIA.discover.editorial.marrakechRiad;
  const iceland = DEMO_MEDIA.discover.editorial.icelandBlueHour;
  const tokyoPersonal = DEMO_MEDIA.discover.personalized.tokyoStill;

  return [
    item({
      id: 'ci-elsewhere-sponsored-ryokan',
      kind: 'sponsored',
      feedScope: 'elsewhere',
      postType: 'sponsored_native',
      hook: 'The Japan trip should start this quietly.',
      title: 'A ryokan weekend outside Tokyo',
      detail: 'Two nights of cedar baths, lantern dinners, and a rail-first route that keeps the trip calm before it becomes expensive.',
      mediaType: 'image',
      mediaUrl: ryokan,
      mediaPosterUrl: ryokan,
      sponsored: true,
      advertiserName: 'Japan ryokan partner',
      targetingReason: 'Matched to long-weekend timing, rail access, and calm group travel preferences.',
      sourceLine: 'Partner stay signal · Japan · flexible rail access',
      locationLabel: 'Japan',
      primaryValueLabel: 'from $214/mo',
      contentSources: [mediaSource(ryokan)],
      music: music('Cedar Bath Morning', 'ambient'),
      tripValue: value(2568, 214, 'Japan from $214/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Japan',
        origin: 'Los Angeles',
        dateWindow: 'Late May or early June',
        calendarFit: 'Works best as a 5-night trip using one PTO day plus a weekend.',
        groupFit: 'Good for couples or 3 friends who prefer a slower first trip.',
        dealTrend: 'watching',
        flight: 890,
        stay: 940,
        activity: 260,
        anchor: 'Onsen ryokan night outside Tokyo',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Curate a Japan trip around Tokyo, a ryokan weekend, rail timing, cedar baths, and a calm first-time itinerary.',
        destinationName: 'Japan',
      },
    }),
    item({
      id: 'ci-elsewhere-short-bali-subak',
      kind: 'editorial_short',
      feedScope: 'elsewhere',
      postType: 'destination_short',
      hook: 'Did you know Bali’s rice terraces are not just scenery?',
      title: 'The rice terraces are a water temple system',
      detail: 'Bali’s famous terraces are beautiful, but the deeper story is subak: a cooperative irrigation system tied to temples and community rhythm.',
      mediaType: 'image',
      mediaUrl: bali,
      mediaPosterUrl: bali,
      sourceLine: 'Editorial short · culture · 12 sec',
      locationLabel: 'Bali',
      primaryValueLabel: 'from $188/mo',
      contentSources: [mediaSource(bali)],
      music: music('Subak Sunrise', 'afro beats'),
      editorialShort: editorialShort({
        hook: 'Did you know Bali’s rice terraces are not just scenery?',
        fact: 'They are part of subak, a UNESCO-recognized cooperative water system shaped around temples, farming, and shared timing.',
      }),
      tripValue: value(2256, 188, 'Bali from $188/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Bali',
        origin: 'Los Angeles',
        dateWindow: 'May, September, or flexible shoulder season',
        calendarFit: 'Best with 7-8 nights and a recovery day after return.',
        groupFit: 'Strong for friend groups that want villas, food, surf, and slow mornings.',
        dealTrend: 'down',
        flight: 820,
        stay: 760,
        activity: 340,
        anchor: 'Sunrise terrace walk with temple etiquette',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a Bali trip around rice terraces, temple etiquette, local food, surf windows, and slow mornings.',
        destinationName: 'Bali',
      },
    }),
    item({
      id: 'ci-elsewhere-deal-paris',
      kind: 'deal',
      feedScope: 'elsewhere',
      postType: 'deal_drop',
      hook: 'Paris fares are down. Here is the catch.',
      title: 'Paris fare down 18%',
      detail: 'Shoulder-season fares are below recent averages. Elsewhere can watch date shifts, hotel rate dips, and cancellation windows before you lock it.',
      mediaType: 'image',
      mediaUrl: paris,
      mediaPosterUrl: paris,
      sourceLine: 'Deal Radar · Paris · medium confidence',
      locationLabel: 'Paris',
      primaryValueLabel: 'from $34/mo flight',
      contentSources: [
        mediaSource(paris),
        {
          kind: 'local_demo',
          name: 'Deal Radar fixture',
          url: null,
          attribution: null,
          freshnessLabel: 'Demo feed signal',
          limitation: 'Deal must be verified with official booking inventory before action.',
        },
      ],
      music: music('Left Bank Loop', 'chill hop'),
      tripValue: value(1836, 153, 'Paris trip from $153/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Paris',
        origin: 'Los Angeles',
        dateWindow: 'October shoulder season',
        calendarFit: 'Works as 5 nights if flights land before noon.',
        groupFit: 'Best for 2-3 travelers; easy split payments and cancellable hotel shortlist.',
        dealTrend: 'down',
        flight: 398,
        stay: 980,
        activity: 210,
        anchor: 'Left Bank food walk and museum block',
      }),
      curationAction: {
        label: 'Watch',
        prompt: 'Watch this Paris fare and build a trip proposal with flights first, hotel options, activities, calendar windows, and Assist monitoring.',
        destinationName: 'Paris',
      },
    }),
    item({
      id: 'ci-elsewhere-editorial-santorini',
      kind: 'editorial',
      feedScope: 'elsewhere',
      postType: 'destination_short',
      hook: 'Santorini is better before everyone wakes up.',
      title: 'Santorini before the cruise-hour crush',
      detail: 'The trick is timing: caldera walks early, Pyrgos dinner late, and one boat day when the island exhales.',
      mediaType: 'image',
      mediaUrl: santorini,
      mediaPosterUrl: santorini,
      sourceLine: 'Editorial · Cyclades timing · May and September',
      locationLabel: 'Santorini',
      primaryValueLabel: 'from $193/mo',
      contentSources: [mediaSource(santorini)],
      music: music('Caldera Before Noon', 'soft electronic'),
      tripValue: value(2316, 193, 'Santorini from $193/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Santorini',
        origin: 'Los Angeles',
        dateWindow: 'May or September',
        calendarFit: 'Best as 6 nights with one buffer day.',
        groupFit: 'Better for couples or 2-4 friends who want a quieter island pace.',
        dealTrend: 'watching',
        flight: 780,
        stay: 1080,
        activity: 280,
        anchor: 'Early caldera walk and Pyrgos dinner',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Curate a Santorini trip around early caldera walks, quiet dinners, boat timing, and shoulder-season pricing.',
        destinationName: 'Santorini',
      },
    }),
    item({
      id: 'ci-elsewhere-stay-marrakech',
      kind: 'unique_stay',
      feedScope: 'elsewhere',
      postType: 'hotel_reveal',
      hook: 'This is why people book riads.',
      title: 'Sleep inside a riad courtyard',
      detail: 'Mint tea on arrival, a guided souk morning, rooftop dinners, and a desert-day option that stays optional.',
      mediaType: 'image',
      mediaUrl: marrakech,
      mediaPosterUrl: marrakech,
      sourceLine: 'Unique stay · Marrakech · small-group friendly',
      locationLabel: 'Marrakech',
      primaryValueLabel: 'from $121/mo',
      contentSources: [mediaSource(marrakech)],
      music: music('Riad Courtyard', 'afro beats'),
      tripValue: value(1452, 121, 'Marrakech from $121/mo', 'low'),
      tripProposal: proposal({
        destination: 'Marrakech',
        origin: 'Los Angeles',
        dateWindow: 'Flexible spring or fall',
        calendarFit: 'Works as 5-6 nights with a slower arrival day.',
        groupFit: 'Best for 2-4 travelers comfortable with guided local context.',
        dealTrend: 'watching',
        flight: 720,
        stay: 460,
        activity: 210,
        anchor: 'Riad stay and guided souk morning',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a Marrakech riad trip with a guided souk morning, rooftop dinners, optional desert day, and calm pacing.',
        destinationName: 'Marrakech',
      },
    }),
    item({
      id: 'ci-elsewhere-live-iceland',
      kind: 'live_view',
      feedScope: 'elsewhere',
      postType: 'live_view',
      hook: 'Iceland is a weather game. Let Assist route it.',
      title: 'Iceland at blue hour',
      detail: 'A weather-aware loop that can swap waterfalls, black sand, and thermal water depending on conditions.',
      mediaType: 'image',
      mediaUrl: iceland,
      mediaPosterUrl: iceland,
      sourceLine: 'Live view demo · weather-aware routing',
      locationLabel: 'Iceland',
      primaryValueLabel: 'from $177/mo',
      contentSources: [
        mediaSource(iceland),
        {
          kind: 'live_camera',
          name: 'Licensed live-view placeholder',
          url: null,
          attribution: null,
          freshnessLabel: 'Demo freshness: updated 24 min ago',
          limitation: 'Production live cards require embeddable licensed webcam or partner feeds.',
        },
      ],
      music: music('Blue Hour Road', 'ambient'),
      tripValue: value(2124, 177, 'Iceland from $177/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Iceland',
        origin: 'Los Angeles',
        dateWindow: 'Shoulder season weather window',
        calendarFit: 'Best as 5 nights with flexible daily routing.',
        groupFit: 'Strong for 2-4 travelers who can handle weather swaps.',
        dealTrend: 'flat',
        flight: 520,
        stay: 960,
        activity: 360,
        anchor: 'Thermal water and black-sand blue-hour loop',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a weather-aware Iceland trip with flexible daily swaps, thermal water, black sand, and short-drive routing.',
        destinationName: 'Iceland',
      },
    }),
    item({
      id: 'ci-elsewhere-personal-tokyo',
      kind: 'personal_preview',
      feedScope: 'elsewhere',
      postType: 'personal_preview',
      hook: 'Tokyo, but with your actual group.',
      title: 'Tokyo with your people',
      detail: 'A generated trip spark using your saved reference set, close-friend context, and watched late-night food ideas.',
      mediaType: 'video',
      mediaUrl: DEMO_MEDIA.discover.personalized.tokyoVideo,
      mediaPosterUrl: tokyoPersonal,
      sourceLine: 'Personal AI preview · close friends · calendar-aware',
      locationLabel: 'Tokyo',
      primaryValueLabel: 'from $226/mo',
      mediaMode: 'personal_ai',
      rightsStatus: 'owned',
      participants: [
        { name: 'You', avatarUrl: DEMO_MEDIA.discover.friendAvatars.you },
        { name: 'Mia', avatarUrl: DEMO_MEDIA.discover.friendAvatars.mia },
        { name: 'Alex', avatarUrl: DEMO_MEDIA.discover.friendAvatars.alex },
      ],
      contentSources: [
        {
          kind: 'ai_generated',
          name: 'Elsewhere preview media',
          url: null,
          attribution: null,
          freshnessLabel: 'Generated demo asset',
          limitation: 'Personal likeness video remains demo/preapproved only; production requires explicit consent and safe model support.',
        },
      ],
      music: music('Shinjuku Close Friends', 'trap soul'),
      tripValue: value(2712, 226, 'Tokyo from $226/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Tokyo',
        origin: 'Los Angeles',
        dateWindow: 'Birthday week or flexible fall window',
        calendarFit: 'Works as 6 nights with one recovery day.',
        groupFit: 'Best for close friends who want food, design, late nights, and split plans.',
        dealTrend: 'watching',
        flight: 910,
        stay: 1020,
        activity: 360,
        anchor: 'Night-market food route and listening bar',
      }),
      curationAction: {
        label: 'Invite',
        prompt: 'Plan a Tokyo friend trip with late-night food, design neighborhoods, a listening bar, smart dates, and group payments.',
        destinationName: 'Tokyo',
      },
    }),
  ];
}

export function buildDiscoverFeed(scope: DiscoverFeedScope): DiscoverFeedResponse {
  const allItems = travelReelItems();
  const items = scope === 'both'
    ? allItems
    : allItems.filter((feedItem) => {
      const feedScope = feedItem.feedScope ?? 'both';
      return feedScope === 'both' || feedScope === scope;
    });

  return {
    generatedAt: new Date().toISOString(),
    scope,
    providerCoverage: providerCoverage(),
    items,
  };
}

function travelReelItems(): DiscoverFeedItem[] {
  const anaheim = DEMO_MEDIA.discover.editorial.anaheimThemePark;
  const kyoto = DEMO_MEDIA.discover.editorial.kyotoSpringFestival;
  const bali = DEMO_MEDIA.discover.editorial.baliRiceTerraces;
  const tokyoPoster = DEMO_MEDIA.discover.personalized.tokyoGroupStill;
  const parisPoster = DEMO_MEDIA.discover.personalized.parisGroupStill;
  const parisMedia = DEMO_MEDIA.discover.personalized.parisVideo;
  const iceland = DEMO_MEDIA.discover.editorial.icelandBlueHour;
  const lisbon = DEMO_MEDIA.discover.editorial.lisbonTileStay;
  const marrakech = DEMO_MEDIA.discover.editorial.marrakechRiad;
  const seoul = DEMO_MEDIA.discover.editorial.seoulNightMarket;
  const mexicoCity = DEMO_MEDIA.discover.editorial.mexicoCityFood;
  const peru = DEMO_MEDIA.discover.editorial.peruSacredValley;
  const amalfi = DEMO_MEDIA.discover.editorial.amalfiBoatDay;
  const socal = DEMO_MEDIA.discover.editorial.socalBeachWeekend;
  const santorini = DEMO_MEDIA.discover.editorial.santoriniCyclades;
  const ryokan = DEMO_MEDIA.discover.editorial.ryokanWeekend;
  const parisLeftBank = DEMO_MEDIA.discover.editorial.parisLeftBank;
  const laDinner = DEMO_MEDIA.discover.editorial.laDinnerPatio;

  return [
    item({
      id: 'reel-sponsored-anaheim-weekend',
      kind: 'sponsored_native',
      feedScope: 'both',
      postType: 'sponsored_native',
      hook: 'How did Anaheim become a weekend ritual?',
      title: 'The psychology of a theme-park weekend',
      detail: 'The lights, the queues, the hotel pool reset, the late checkout. Elsewhere turns the ritual into a trip your group can actually afford and schedule.',
      mediaType: 'image',
      mediaUrl: anaheim,
      mediaPosterUrl: anaheim,
      sponsored: true,
      advertiserName: 'Anaheim stay partner',
      targetingReason: 'Local weekend fit, no PTO, and friend-group payment flexibility.',
      sourceLine: 'Partner pick · Anaheim weekend',
      locationLabel: 'Anaheim',
      primaryValueLabel: 'from $142/mo',
      priceBadgeLabel: 'from $142/mo',
      relevanceReason: 'Nearby, no PTO, and built for group payments.',
      contentTopics: ['local weekends', 'theme parks', 'friends', 'sponsored stay'],
      interactionStats: { likes: 4800, learns: 2100, plans: 760, shares: 930 },
      contentSources: [mediaSource(anaheim, 'pexels')],
      music: music('Boardwalk After Dark', 'trap soul'),
      tripValue: value(1704, 142, 'Anaheim from $142/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Anaheim',
        origin: 'Los Angeles',
        dateWindow: 'Next open Friday-Sunday',
        calendarFit: 'No PTO needed; fits a clean weekend gap.',
        groupFit: 'Best for 2-4 friends or a family split-payment weekend.',
        dealTrend: 'watching',
        flight: 0,
        stay: 760,
        activity: 720,
        anchor: 'Theme-park day with a late-night ride block',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan an Anaheim theme-park weekend with one park day, a nearby stay, late checkout, and group payments.',
        destinationName: 'Anaheim',
      },
    }),
    item({
      id: 'reel-editorial-kyoto-hidden-hour',
      kind: 'editorial_short',
      feedScope: 'both',
      postType: 'destination_short',
      hook: 'Why does Kyoto feel different before breakfast?',
      title: 'The hidden hour before Kyoto wakes up',
      detail: 'Before tour buses and lunch crowds, the city is mostly sound: wood doors, temple bells, bicycle tires, and shopkeepers opening narrow streets.',
      mediaType: 'image',
      mediaUrl: kyoto,
      mediaPosterUrl: kyoto,
      sourceLine: 'Editorial short · Kyoto timing',
      locationLabel: 'Kyoto',
      primaryValueLabel: 'Japan from $214/mo',
      relevanceReason: 'You saved Japan and tend to like calm culture-first itineraries.',
      contentTopics: ['history', 'culture', 'Japan', 'quiet mornings'],
      interactionStats: { likes: 9100, learns: 5800, plans: 1300, shares: 1700 },
      contentSources: [mediaSource(kyoto)],
      music: music('Lanterns Before Noon', 'ambient'),
      editorialShort: editorialShort({
        hook: 'Most people see Kyoto too late in the day.',
        fact: 'The best version of the city is often before breakfast: empty lanes, softer light, and less pressure to race through temples.',
      }),
      tripValue: value(2568, 214, 'Japan from $214/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Kyoto',
        origin: 'Los Angeles',
        dateWindow: 'Late May or early June',
        calendarFit: 'Works as a 6-night Japan trip using one PTO day.',
        groupFit: 'Best for a couple or close friends who want calm mornings and strong food nights.',
        dealTrend: 'watching',
        flight: 890,
        stay: 940,
        activity: 260,
        anchor: 'Sunrise shrine walk and garden morning',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a Japan trip around quiet Kyoto mornings, Tokyo food nights, rail timing, and flexible hotel cancellation windows.',
        destinationName: 'Kyoto',
      },
    }),
    item({
      id: 'reel-interactive-bali-subak',
      kind: 'interactive_prompt',
      feedScope: 'both',
      postType: 'interactive_prompt',
      hook: 'These terraces are not just scenery.',
      title: 'The water temples behind Bali’s terraces',
      detail: 'A short field note from the hillside: the view is beautiful, but the real story is the system moving water from temple to farm to village.',
      mediaType: 'image',
      mediaUrl: bali,
      mediaPosterUrl: bali,
      mediaMode: 'animated_still',
      sourceLine: 'Interactive short · Bali culture',
      locationLabel: 'Bali',
      primaryValueLabel: 'from $188/mo',
      relevanceReason: 'You watched slow nature and villa trips, so Elsewhere is testing a culture-first Bali route.',
      contentTopics: ['nature', 'culture', 'food', 'Bali', 'interactive'],
      interactionStats: { likes: 11200, learns: 7800, plans: 1600, shares: 1900 },
      contentSources: [
        mediaSource(bali),
      ],
      music: music('Subak Sunrise', 'afro beats'),
      interactivePrompt: {
        question: 'What keeps Bali’s rice terraces alive?',
        contextLabel: 'Did you know?',
        revealAfterMs: 2600,
        answers: [
          {
            id: 'subak',
            label: 'water temples',
            responseHook: 'Exactly. It is called subak.',
            responseDetail: 'Subak is a cooperative irrigation system tied to temples, farming, and shared timing. Elsewhere would build this as a sunrise-first culture day, not just a photo stop.',
            responseMediaUrl: bali,
            responsePosterUrl: bali,
            responseCtaLabel: 'Plan around it',
            isPreferred: true,
          },
          {
            id: 'rain',
            label: 'only rainfall',
            responseHook: 'Rain helps, but the real answer is smarter.',
            responseDetail: 'The terraces depend on a community-managed water system. That changes the trip: go with context, early light, and a guide who can explain what you are seeing.',
            responseMediaUrl: bali,
            responsePosterUrl: bali,
            responseCtaLabel: 'Show me the route',
          },
          {
            id: 'machines',
            label: 'modern pumps',
            responseHook: 'Not the main story.',
            responseDetail: 'The famous rhythm comes from shared water governance and temple timing. Elsewhere can turn that into a respectful morning itinerary.',
            responseMediaUrl: bali,
            responsePosterUrl: bali,
            responseCtaLabel: 'Build the day',
          },
        ],
      },
      tripValue: value(2256, 188, 'Bali from $188/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Bali',
        origin: 'Los Angeles',
        dateWindow: 'May, September, or flexible shoulder season',
        calendarFit: 'Best with 7-8 nights and a recovery day after return.',
        groupFit: 'Strong for friend groups that want villas, food, surf, and slow mornings.',
        dealTrend: 'down',
        flight: 820,
        stay: 760,
        activity: 340,
        anchor: 'Subak terrace walk with temple etiquette',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a Bali trip around subak rice terraces, temple etiquette, local food, surf windows, and villa time.',
        destinationName: 'Bali',
      },
    }),
    item({
      id: 'reel-doc-iceland-sneaker-waves',
      kind: 'editorial_short',
      feedScope: 'both',
      postType: 'destination_short',
      hook: 'Why do Iceland guides say never turn your back on this beach?',
      title: 'The beautiful beach with a dangerous rhythm',
      detail: 'Reynisfjara looks like a movie set: black sand, basalt columns, white water. The hidden story is sneaker waves, timing, and respect for the ocean.',
      mediaType: 'image',
      mediaUrl: iceland,
      mediaPosterUrl: iceland,
      sourceLine: 'Field warning · Iceland south coast',
      locationLabel: 'Iceland',
      primaryValueLabel: 'Iceland from $169/mo',
      relevanceReason: 'You like dramatic nature posts; Elsewhere adds the safety context before turning it into a route.',
      contentTopics: ['nature', 'safety', 'Iceland', 'geology', 'road trips'],
      interactionStats: { likes: 16800, learns: 12200, plans: 1700, shares: 3100 },
      contentSources: [mediaSource(iceland)],
      music: music('Basalt Weather Report', 'ambient'),
      editorialShort: editorialShort({
        hook: 'The photo is not the whole story.',
        fact: 'Sneaker waves can surge much farther up the beach than expected. A good Iceland itinerary gives the place time, distance, and weather respect.',
      }),
      tripValue: value(2028, 169, 'Iceland from $169/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Iceland south coast',
        origin: 'Los Angeles',
        dateWindow: 'Late fall or spring shoulder window',
        calendarFit: 'Works as 5 nights if the route stays compact and weather-flexible.',
        groupFit: 'Best for nature-first travelers who can handle early drives and changing conditions.',
        dealTrend: 'watching',
        flight: 620,
        stay: 780,
        activity: 260,
        anchor: 'South coast route with safety/weather buffers',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan an Iceland south coast trip around black sand beaches, waterfalls, weather buffers, and safe drive timing.',
        destinationName: 'Iceland',
      },
    }),
    item({
      id: 'reel-interactive-santorini-caldera',
      kind: 'interactive_prompt',
      feedScope: 'both',
      postType: 'interactive_prompt',
      hook: 'What are you actually looking at from Santorini?',
      title: 'The postcard view is a volcanic map',
      detail: 'A quick question segment: the white villages get the attention, but the curve of the water is the story.',
      mediaType: 'image',
      mediaUrl: santorini,
      mediaPosterUrl: santorini,
      mediaMode: 'animated_still',
      sourceLine: 'Interactive geology · Cyclades',
      locationLabel: 'Santorini',
      primaryValueLabel: 'Greece from $193/mo',
      relevanceReason: 'You save coast and hotel-view content; Elsewhere adds the why before pricing a trip.',
      contentTopics: ['islands', 'geology', 'Greece', 'hotels', 'interactive'],
      interactionStats: { likes: 14800, learns: 9700, plans: 2100, shares: 2900 },
      contentSources: [mediaSource(santorini)],
      music: music('Caldera Slow Pan', 'beach house'),
      interactivePrompt: {
        question: 'Why is the island shaped like a crescent?',
        contextLabel: 'Did you know?',
        revealAfterMs: 2400,
        answers: [
          {
            id: 'volcano',
            label: 'ancient eruption',
            responseHook: 'Exactly. You are looking into a caldera.',
            responseDetail: 'The view is the result of volcanic collapse and sea-filled geography. Elsewhere would build this as a sunset/timing story, not just a hotel search.',
            responseMediaUrl: santorini,
            responsePosterUrl: santorini,
            responseCtaLabel: 'Plan the view',
            isPreferred: true,
          },
          {
            id: 'wind',
            label: 'wind erosion',
            responseHook: 'Wind matters, but not here.',
            responseDetail: 'The iconic crescent is volcanic. That changes the trip: choose villages, walks, and boat timing around the caldera itself.',
            responseMediaUrl: santorini,
            responsePosterUrl: santorini,
            responseCtaLabel: 'Show the route',
          },
          {
            id: 'harbor',
            label: 'built as a harbor',
            responseHook: 'It was not designed.',
            responseDetail: 'The geography came first. The human story is how towns, paths, and sunset routines formed around it.',
            responseMediaUrl: santorini,
            responsePosterUrl: santorini,
            responseCtaLabel: 'Build around it',
          },
        ],
      },
      tripValue: value(2316, 193, 'Greece from $193/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Santorini',
        origin: 'Los Angeles',
        dateWindow: 'Shoulder-season island window',
        calendarFit: 'Best with 6 nights and one flexible ferry/flight buffer.',
        groupFit: 'Best for couples or small groups who want views without peak-season stress.',
        dealTrend: 'watching',
        flight: 840,
        stay: 960,
        activity: 260,
        anchor: 'Caldera walk and boat-day timing',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a Santorini trip around the caldera view, shoulder-season timing, ferry buffers, and sunset hotel tradeoffs.',
        destinationName: 'Santorini',
      },
    }),
    item({
      id: 'reel-doc-ryokan-quiet-rules',
      kind: 'editorial_short',
      feedScope: 'both',
      postType: 'hotel_reveal',
      hook: 'Why does a ryokan ask you to slow down?',
      title: 'The stay where the schedule is the luxury',
      detail: 'Shoes off, bath first, dinner at a set time, quiet after dark. The point is not convenience; it is being gently removed from your normal pace.',
      mediaType: 'image',
      mediaUrl: ryokan,
      mediaPosterUrl: ryokan,
      sourceLine: 'Stay anthropology · Japan ryokan',
      locationLabel: 'Hakone',
      primaryValueLabel: 'Japan from $221/mo',
      relevanceReason: 'You engage with hotel-as-experience content, so Elsewhere turns the stay itself into the itinerary anchor.',
      contentTopics: ['hotels', 'Japan', 'rituals', 'wellness', 'culture'],
      interactionStats: { likes: 12100, learns: 8400, plans: 2500, shares: 1800 },
      contentSources: [mediaSource(ryokan)],
      music: music('Cedar Bath Hour', 'ambient'),
      editorialShort: editorialShort({
        hook: 'The rules are part of the hospitality.',
        fact: 'A good ryokan stay works because dinner, bathing, arrival, and quiet time are designed together. Elsewhere can protect that rhythm when planning trains and luggage.',
      }),
      tripValue: value(2652, 221, 'Japan from $221/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Hakone',
        origin: 'Los Angeles',
        dateWindow: 'Late May, early June, or fall colors',
        calendarFit: 'Best paired with Tokyo so arrival/departure days stay easy.',
        groupFit: 'Best for couples or calm friend groups comfortable with shared quiet time.',
        dealTrend: 'watching',
        flight: 910,
        stay: 1120,
        activity: 260,
        anchor: 'One-night ryokan with rail and luggage timing',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a Tokyo and Hakone trip around a ryokan stay, rail timing, luggage forwarding, and bath/dinner schedule.',
        destinationName: 'Hakone',
      },
    }),
    item({
      id: 'reel-doc-lisbon-tiles',
      kind: 'editorial_short',
      feedScope: 'both',
      postType: 'destination_short',
      hook: 'Lisbon’s walls are not just decoration.',
      title: 'The tiles that helped a city survive heat, salt, and memory',
      detail: 'Azulejos are beautiful, but they also tell stories: cooling walls, marking faith, advertising shops, and turning streets into an archive.',
      mediaType: 'image',
      mediaUrl: lisbon,
      mediaPosterUrl: lisbon,
      sourceLine: 'City archive · Lisbon tiles',
      locationLabel: 'Lisbon',
      primaryValueLabel: 'Lisbon from $154/mo',
      relevanceReason: 'You save walkable city posts and shoulder-season Europe ideas.',
      contentTopics: ['architecture', 'Portugal', 'city walks', 'history', 'food'],
      interactionStats: { likes: 10900, learns: 7600, plans: 1400, shares: 1600 },
      contentSources: [mediaSource(lisbon)],
      music: music('Tile Street Afternoon', 'chill hop'),
      editorialShort: editorialShort({
        hook: 'The city is easier to read when you look at the walls.',
        fact: 'Tiles help with heat and weather, but they also preserve symbols, trades, and neighborhood memory. That makes Lisbon a walking-story destination.',
      }),
      tripValue: value(1848, 154, 'Lisbon from $154/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Lisbon',
        origin: 'Los Angeles',
        dateWindow: 'Spring or fall shoulder window',
        calendarFit: 'Works as a 5-night Europe trip if flights price cleanly.',
        groupFit: 'Best for food, walking, music, and slow neighborhood days.',
        dealTrend: 'watching',
        flight: 640,
        stay: 720,
        activity: 210,
        anchor: 'Tile walk, fado dinner, and tram-safe pacing',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a Lisbon trip around tile walks, fado, food neighborhoods, tram timing, and shoulder-season flight watch.',
        destinationName: 'Lisbon',
      },
    }),
    item({
      id: 'reel-personal-tokyo-friends',
      kind: 'personal_trip_ad',
      feedScope: 'both',
      postType: 'personal_trip_ad',
      hook: 'What would Tokyo look like with your actual group?',
      title: 'Tokyo with Mia and Alex',
      detail: 'A personal travel segment built from your saved reference media, birthday timing, late-night food saves, and split-payment fit.',
      mediaType: 'video',
      mediaUrl: DEMO_MEDIA.discover.personalized.tokyoVideo,
      mediaPosterUrl: tokyoPoster,
      sourceLine: 'Personal trip spark · close friends',
      locationLabel: 'Tokyo',
      primaryValueLabel: 'from $226/mo',
      priceBadgeLabel: 'from $226/mo',
      relevanceReason: 'Mia birthday week, Alex close-friend score, and your saved Tokyo food ideas line up.',
      contentTopics: ['friends', 'food', 'Japan', 'personal preview', 'nightlife'],
      interactionStats: { likes: 6400, learns: 1800, plans: 2300, shares: 2100 },
      mediaMode: 'personal_ai',
      rightsStatus: 'owned',
      participants: [
        { name: 'You', avatarUrl: DEMO_MEDIA.discover.friendAvatars.you },
        { name: 'Mia', avatarUrl: DEMO_MEDIA.discover.friendAvatars.mia },
        { name: 'Alex', avatarUrl: DEMO_MEDIA.discover.friendAvatars.alex },
      ],
      contentSources: [
        {
          kind: 'ai_generated',
          name: 'Elsewhere personal preview',
          url: null,
          attribution: null,
          freshnessLabel: 'Generated for demo profile',
          limitation: 'Personal likeness media requires explicit consent and approved generation workflows.',
        },
      ],
      music: music('Shinjuku Close Friends', 'trap soul'),
      tripValue: value(2712, 226, 'Tokyo from $226/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Tokyo',
        origin: 'Los Angeles',
        dateWindow: 'Mia birthday week or flexible fall window',
        calendarFit: 'Fits a 6-night window with one recovery day.',
        groupFit: 'Best for close friends who want food, design, late nights, and split plans.',
        dealTrend: 'watching',
        flight: 910,
        stay: 1020,
        activity: 360,
        anchor: 'Night-market food route and listening bar',
      }),
      curationAction: {
        label: 'Invite',
        prompt: 'Plan a Tokyo friend trip with late-night food, design neighborhoods, a listening bar, smart dates, and group payments.',
        destinationName: 'Tokyo',
      },
    }),
    item({
      id: 'reel-personal-deal-paris-mia',
      kind: 'personal_deal',
      feedScope: 'both',
      postType: 'personal_deal',
      hook: 'A fare drop only matters when someone can actually go.',
      title: 'Paris with Mia is finally in range',
      detail: 'This is not a random cheap flight. It matches Mia’s free week, your watched Paris saves, and a cancellable stay plan.',
      mediaType: 'video',
      mediaUrl: parisMedia,
      mediaPosterUrl: parisPoster,
      sourceLine: 'Personal deal · calendar matched',
      locationLabel: 'Paris',
      primaryValueLabel: 'from $153/mo',
      priceBadgeLabel: 'from $153/mo',
      relevanceReason: 'Matched to Mia’s calendar, your saved Paris posts, and a shoulder-season fare signal.',
      contentTopics: ['personal deal', 'Paris', 'friends', 'food', 'fare drop'],
      interactionStats: { likes: 7200, learns: 2600, plans: 3100, shares: 1700 },
      mediaMode: 'personal_ai',
      rightsStatus: 'owned',
      participants: [
        { name: 'You', avatarUrl: DEMO_MEDIA.discover.friendAvatars.you },
        { name: 'Mia', avatarUrl: DEMO_MEDIA.discover.friendAvatars.mia },
      ],
      contentSources: [
        {
          kind: 'local_demo',
          name: 'Deal Radar matched signal',
          url: null,
          attribution: null,
          freshnessLabel: 'Matched to saved friend/calendar context',
          limitation: 'Fare must be verified with official inventory before booking.',
        },
        {
          kind: 'ai_generated',
          name: 'Elsewhere personal preview',
          url: null,
          attribution: null,
          freshnessLabel: 'Generated for demo profile',
          limitation: 'Production friend previews require explicit consent from each participant.',
        },
      ],
      music: music('Left Bank Voice Note', 'chill hop'),
      tripValue: value(1836, 153, 'Paris from $153/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Paris',
        origin: 'Los Angeles',
        dateWindow: 'October shoulder season',
        calendarFit: 'Mia has a 5-night opening; your calendar has one conflict to clear.',
        groupFit: 'Best for 2 travelers with hotel free-cancel protection.',
        dealTrend: 'down',
        flight: 398,
        stay: 980,
        activity: 210,
        anchor: 'Left Bank food walk and museum block',
      }),
      assistWatchItems: [
        'Verify fare class and carry-on rules',
        'Watch refundable hotel rate drops',
        'Alert if Mia calendar window closes',
      ],
      curationAction: {
        label: 'Invite',
        prompt: 'Watch and plan a Paris trip with Mia around the October fare drop, free-cancel hotel options, and split payments.',
        destinationName: 'Paris',
      },
    }),
    item({
      id: 'reel-doc-seoul-night-market',
      kind: 'editorial_short',
      feedScope: 'both',
      postType: 'destination_short',
      hook: 'Why does Seoul get louder after dinner?',
      title: 'The night market rhythm under the city lights',
      detail: 'The best food stories are not always restaurant reservations. They are steam, neon, aunties calling orders, late trains, and the friend who says yes to one more stop.',
      mediaType: 'image',
      mediaUrl: seoul,
      mediaPosterUrl: seoul,
      sourceLine: 'Field note · Seoul after dark',
      locationLabel: 'Seoul',
      primaryValueLabel: 'Seoul from $198/mo',
      relevanceReason: 'You liked Tokyo food reels, so Elsewhere is testing a night-market Korea route.',
      contentTopics: ['food', 'Korea', 'night markets', 'culture', 'friends'],
      interactionStats: { likes: 12800, learns: 6100, plans: 1900, shares: 2300 },
      contentSources: [mediaSource(seoul)],
      music: music('Steam Under Neon', 'trap soul'),
      editorialShort: editorialShort({
        hook: 'Seoul travel works best when dinner becomes the plan.',
        fact: 'Night markets, late cafes, and transit-friendly neighborhoods let a short trip feel dense without over-scheduling every hour.',
      }),
      tripValue: value(2376, 198, 'Seoul from $198/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Seoul',
        origin: 'Los Angeles',
        dateWindow: 'Flexible fall food window',
        calendarFit: 'Works as a 5-night trip with one PTO day if flights line up overnight.',
        groupFit: 'Best for friends who want food, shopping, cafes, and a low-friction transit plan.',
        dealTrend: 'watching',
        flight: 780,
        stay: 840,
        activity: 270,
        anchor: 'Gwangjang-style night food crawl',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a Seoul night-market trip with food routes, cafe neighborhoods, transit timing, and friend voting.',
        destinationName: 'Seoul',
      },
    }),
    item({
      id: 'reel-doc-mexico-city-breakfast',
      kind: 'editorial_short',
      feedScope: 'both',
      postType: 'destination_short',
      hook: 'Mexico City before noon is a food documentary.',
      title: 'The breakfast crawl that explains the city',
      detail: 'Coffee, pan dulce, market tacos, museums before the heat, and one reservation worth protecting. The trip works because the morning has a script.',
      mediaType: 'image',
      mediaUrl: mexicoCity,
      mediaPosterUrl: mexicoCity,
      sourceLine: 'Food story · CDMX morning',
      locationLabel: 'Mexico City',
      primaryValueLabel: 'CDMX from $86/mo',
      relevanceReason: 'A long weekend fits your calendar and does not require a heavy flight budget.',
      contentTopics: ['food', 'culture', 'long weekends', 'Mexico City', 'museums'],
      interactionStats: { likes: 15200, learns: 7300, plans: 3100, shares: 2800 },
      contentSources: [mediaSource(mexicoCity)],
      music: music('Roma Norte Morning', 'chill hop'),
      editorialShort: editorialShort({
        hook: 'The city makes more sense if you start with breakfast.',
        fact: 'A CDMX plan can anchor around morning food, one museum, one park, and a dinner reservation instead of overloading the map.',
      }),
      tripValue: value(1032, 86, 'CDMX from $86/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Mexico City',
        origin: 'Los Angeles',
        dateWindow: 'Next 3-day weekend opening',
        calendarFit: 'No full PTO week needed; Friday evening departure is viable.',
        groupFit: 'Best for food-first friends and couples who want culture without a long-haul flight.',
        dealTrend: 'flat',
        flight: 312,
        stay: 420,
        activity: 180,
        anchor: 'Roma/Condesa breakfast-to-museum route',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a Mexico City long weekend around breakfast routes, museums, dinner reservations, and flexible flight timing.',
        destinationName: 'Mexico City',
      },
    }),
    item({
      id: 'reel-interactive-peru-stonework',
      kind: 'interactive_prompt',
      feedScope: 'both',
      postType: 'interactive_prompt',
      hook: 'How did these stones survive earthquakes?',
      title: 'The Inca walls that move without falling',
      detail: 'A 15-second travel-channel-style question: look at the seams, then guess why the walls behave differently when the ground shakes.',
      mediaType: 'image',
      mediaUrl: peru,
      mediaPosterUrl: peru,
      mediaMode: 'animated_still',
      sourceLine: 'Interactive field note · Sacred Valley',
      locationLabel: 'Sacred Valley',
      primaryValueLabel: 'Peru from $176/mo',
      relevanceReason: 'You liked nature plus history posts, so Elsewhere is testing an Andes route.',
      contentTopics: ['history', 'architecture', 'nature', 'Peru', 'interactive'],
      interactionStats: { likes: 9800, learns: 8400, plans: 1200, shares: 1500 },
      contentSources: [mediaSource(peru)],
      music: music('Stone And Cloud', 'ambient'),
      interactivePrompt: {
        question: 'What made the walls earthquake-smart?',
        contextLabel: 'Field question',
        revealAfterMs: 2400,
        answers: [
          {
            id: 'precision',
            label: 'stone fit',
            responseHook: 'Yes. The fit is the story.',
            responseDetail: 'Interlocking stonework lets the wall flex and settle without mortar doing all the work. Elsewhere would build this as a guide-led Sacred Valley day, not a rushed photo stop.',
            responseMediaUrl: peru,
            responsePosterUrl: peru,
            responseCtaLabel: 'Plan the valley',
            isPreferred: true,
          },
          {
            id: 'cement',
            label: 'hidden cement',
            responseHook: 'The surprise is the opposite.',
            responseDetail: 'The famous walls are impressive because the stone fit does the heavy lifting. That is the kind of context that makes a guide worth booking.',
            responseMediaUrl: peru,
            responsePosterUrl: peru,
            responseCtaLabel: 'Learn the route',
          },
          {
            id: 'metal',
            label: 'metal braces',
            responseHook: 'Not the core answer.',
            responseDetail: 'The iconic sections rely on the precision and mass of the stonework. Elsewhere can turn the lesson into a history-first day plan.',
            responseMediaUrl: peru,
            responsePosterUrl: peru,
            responseCtaLabel: 'Build it',
          },
        ],
      },
      tripValue: value(2112, 176, 'Peru from $176/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Cusco and the Sacred Valley',
        origin: 'Los Angeles',
        dateWindow: 'Dry-season shoulder weeks',
        calendarFit: 'Works best with 7 nights and an altitude buffer day.',
        groupFit: 'Best for history/nature travelers who want guided context and slower pacing.',
        dealTrend: 'watching',
        flight: 690,
        stay: 620,
        activity: 410,
        anchor: 'Sacred Valley guide day and altitude-safe schedule',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a Peru trip around Sacred Valley stonework, altitude timing, local guides, and flexible cancellation rules.',
        destinationName: 'Sacred Valley',
      },
    }),
    item({
      id: 'reel-personal-bali-reset',
      kind: 'personal_trip_ad',
      feedScope: 'both',
      postType: 'personal_trip_ad',
      hook: 'A reset trip only works if the group pace matches.',
      title: 'Bali with Jordan and Taylor',
      detail: 'Generated from your saved reference set and close-friend preferences: mornings slow, afternoons optional, nights easy to split.',
      mediaType: 'video',
      mediaUrl: DEMO_MEDIA.discover.personalized.baliVideo,
      mediaPosterUrl: DEMO_MEDIA.discover.personalized.baliGroupStill,
      sourceLine: 'Personal travel segment · close friends',
      locationLabel: 'Bali',
      primaryValueLabel: 'from $188/mo',
      priceBadgeLabel: 'from $188/mo',
      relevanceReason: 'Jordan saved villas, Taylor prefers rest days, and your calendar has a September opening.',
      contentTopics: ['personal preview', 'friends', 'Bali', 'villa', 'wellness'],
      interactionStats: { likes: 5900, learns: 1700, plans: 2600, shares: 1800 },
      mediaMode: 'personal_ai',
      rightsStatus: 'owned',
      participants: [
        { name: 'You', avatarUrl: DEMO_MEDIA.discover.friendAvatars.you },
        { name: 'Jordan', avatarUrl: DEMO_MEDIA.discover.friendAvatars.jordan },
        { name: 'Taylor', avatarUrl: DEMO_MEDIA.discover.friendAvatars.taylor },
      ],
      contentSources: [
        {
          kind: 'ai_generated',
          name: 'Elsewhere personal preview',
          url: null,
          attribution: null,
          freshnessLabel: 'Generated from approved demo reference media',
          limitation: 'Friend likeness generation requires explicit consent and approved reference photos.',
        },
      ],
      music: music('Villa Group Chat', 'afro beats'),
      tripValue: value(2256, 188, 'Bali from $188/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Bali',
        origin: 'Los Angeles',
        dateWindow: 'September shoulder window',
        calendarFit: 'One 8-night window lines up with a holiday and two PTO days.',
        groupFit: 'Split participation works: surf, spa, and rest-at-villa options can coexist.',
        dealTrend: 'down',
        flight: 820,
        stay: 760,
        activity: 340,
        anchor: 'Villa base with optional surf/spa split days',
      }),
      curationAction: {
        label: 'Invite',
        prompt: 'Plan a Bali reset trip with Jordan and Taylor around villa time, split activities, smart dates, and group payments.',
        destinationName: 'Bali',
      },
    }),
    item({
      id: 'reel-doc-amalfi-boat-day',
      kind: 'editorial_short',
      feedScope: 'both',
      postType: 'destination_short',
      hook: 'The Amalfi Coast is really a timing problem.',
      title: 'The coast looks effortless only when the schedule is right',
      detail: 'Boats, buses, stairs, dinner windows, and one hotel location decision decide whether the trip feels cinematic or exhausting.',
      mediaType: 'image',
      mediaUrl: amalfi,
      mediaPosterUrl: amalfi,
      sourceLine: 'Travel mechanics · Amalfi Coast',
      locationLabel: 'Amalfi Coast',
      primaryValueLabel: 'Italy from $203/mo',
      relevanceReason: 'You save coast and hotel-view content, but Elsewhere would only recommend this with the right logistics.',
      contentTopics: ['coast', 'Italy', 'hotels', 'timing', 'boats'],
      interactionStats: { likes: 13400, learns: 6900, plans: 2200, shares: 2400 },
      contentSources: [mediaSource(amalfi)],
      music: music('Lemon Coast Slow Cut', 'soft electronic'),
      editorialShort: editorialShort({
        hook: 'The view is easy. The logistics are the trip.',
        fact: 'The best Amalfi plans choose a base first, then reverse-engineer boats, dinner, and low-friction movement around it.',
      }),
      tripValue: value(2436, 203, 'Italy from $203/mo', 'low'),
      tripProposal: proposal({
        destination: 'Amalfi Coast',
        origin: 'Los Angeles',
        dateWindow: 'Late spring or September',
        calendarFit: 'Needs at least 6 nights or it becomes too transit-heavy.',
        groupFit: 'Best for couples or small groups comfortable with slower movement.',
        dealTrend: 'watching',
        flight: 780,
        stay: 1120,
        activity: 290,
        anchor: 'Boat day built around dinner and transfer timing',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan an Amalfi Coast trip around a smart base, boat timing, dinner reservations, and low-stress transfers.',
        destinationName: 'Amalfi Coast',
      },
    }),
    item({
      id: 'reel-local-socal-biolume',
      kind: 'editorial_short',
      feedScope: 'both',
      postType: 'destination_short',
      hook: 'Southern California has a night-ocean lottery.',
      title: 'When the waves glow blue',
      detail: 'Bioluminescence is never guaranteed, which is why Elsewhere treats it as a watchable local window, not a normal booking promise.',
      mediaType: 'image',
      mediaUrl: socal,
      mediaPosterUrl: socal,
      sourceLine: 'Local watch · Southern California coast',
      locationLabel: 'Southern California',
      primaryValueLabel: 'local watch',
      relevanceReason: 'Nearby and low-commitment: Elsewhere can alert you when conditions line up.',
      contentTopics: ['local', 'nature', 'beaches', 'night watch', 'Southern California'],
      interactionStats: { likes: 11800, learns: 9100, plans: 900, shares: 3200 },
      contentSources: [mediaSource(socal)],
      music: music('Blue Hour Coast', 'ambient'),
      editorialShort: editorialShort({
        hook: 'This is a watchlist, not a guarantee.',
        fact: 'Bioluminescent waves depend on algae blooms, tides, darkness, and luck. The product magic is knowing when to look, not pretending it is bookable on demand.',
      }),
      tripProposal: proposal({
        destination: 'Southern California coast',
        origin: 'Los Angeles',
        dateWindow: 'Watch-only: night conditions and local reports',
        calendarFit: 'Same-day local alert; no PTO required.',
        groupFit: 'Best for spontaneous friends who can move with short notice.',
        dealTrend: 'watching',
        flight: 0,
        stay: 0,
        activity: 0,
        anchor: 'Night beach watch with safety and parking notes',
      }),
      curationAction: {
        label: 'Watch',
        prompt: 'Watch Southern California bioluminescence conditions and alert when a safe local viewing window appears.',
        destinationName: 'Southern California',
      },
    }),
    item({
      id: 'reel-memory-bali-camera-roll',
      kind: 'photo_memory',
      feedScope: 'both',
      postType: 'photo_memory',
      hook: 'Your camera roll already knows what kind of trip you miss.',
      title: 'A private Bali memory reel',
      detail: 'Elsewhere found a previous-vacation-style cluster: beaches, slow mornings, friends, and villa downtime. It stays private until you approve it.',
      mediaType: 'image',
      mediaUrl: DEMO_MEDIA.discover.personalized.baliGroupStill,
      mediaPosterUrl: DEMO_MEDIA.discover.personalized.baliGroupStill,
      mediaMode: 'animated_still',
      sourceLine: 'Private photo memory · local library candidate',
      locationLabel: 'Bali',
      primaryValueLabel: 'plan a similar reset',
      relevanceReason: 'Matched from past-vacation patterns: beach light, group photos, food stops, and slow mornings.',
      textTreatment: 'memory',
      contentTopics: ['photo memory', 'beach', 'Bali', 'friends', 'villa', 'past trips'],
      interactionStats: { likes: 3100, learns: 2400, plans: 1700, shares: 0 },
      contentSources: [
        {
          kind: 'photo_library',
          name: 'Private native photo library candidate',
          url: null,
          attribution: null,
          freshnessLabel: 'Local/private until approved',
          limitation: 'No camera-roll media is uploaded, shared, or used for generation until the user approves.',
        },
      ],
      music: music('Blue Hour Coast', 'ambient'),
      photoMemory: {
        id: 'memory-reel-bali-camera-roll',
        clusterId: 'memory-cluster-bali-previous-vacation',
        title: 'Bali-style reset from your library',
        generatedPostId: 'reel-memory-bali-camera-roll',
        approvalStatus: 'private_candidate',
        sourceAssetIds: ['local-demo-bali-001', 'local-demo-bali-002', 'local-demo-bali-003'],
        privacyLabel: 'Private candidate. Approve before sharing, upload, recap, or AI generation.',
      },
      tripProposal: proposal({
        destination: 'Bali',
        origin: 'Los Angeles',
        dateWindow: 'Flexible shoulder-season reset',
        calendarFit: 'Best with one holiday bridge and two PTO days.',
        groupFit: 'Best for the same pace pattern: mornings together, optional afternoons, easy dinners.',
        dealTrend: 'watching',
        flight: 820,
        stay: 760,
        activity: 260,
        anchor: 'Villa base with slow mornings and optional split days',
      }),
      curationAction: {
        label: 'Plan similar',
        prompt: 'Use my prior beach/villa/group-trip photo patterns to plan a similar Bali-style reset, but keep all camera-roll media private unless approved.',
        destinationName: 'Bali',
      },
    }),
    item({
      id: 'reel-assist-bali-connection',
      kind: 'assist_alert',
      feedScope: 'both',
      postType: 'assist_alert',
      hook: 'The most expensive travel problem is the one you notice too late.',
      title: 'A fragile connection on Bali 2026',
      detail: 'Inbound weather makes the 55-minute connection risky. Elsewhere found an earlier protected departure before the itinerary breaks.',
      mediaType: 'image',
      mediaUrl: iceland,
      mediaPosterUrl: iceland,
      sourceLine: 'Assist alert · active trip',
      locationLabel: 'Bali 2026',
      primaryValueLabel: '$1,180 protected',
      priceBadgeLabel: '$1,180 protected',
      relevanceReason: 'Active trip alert: same-ticket protection and hotel arrival timing are at risk.',
      contentTopics: ['assist', 'active trip', 'flight rules', 'Bali'],
      interactionStats: { likes: 2100, learns: 4300, plans: 900, shares: 380 },
      contentSources: [mediaSource(iceland)],
      music: music('Gate Change Calm', 'soft electronic'),
      tripValue: value(5210, 434, '$1,180 protected', 'high'),
      assistWatchItems: [
        'Connection risk and same-ticket protection',
        'Earlier departure inventory',
        'Hotel arrival timing and transfer updates',
      ],
      tripProposal: proposal({
        destination: 'Bali',
        origin: 'Los Angeles',
        dateWindow: 'Current booked trip',
        calendarFit: 'No new vacation decision; this protects the trip already on the calendar.',
        groupFit: 'Both travelers can move together without splitting the itinerary.',
        dealTrend: 'watching',
        flight: 0,
        stay: 0,
        activity: 0,
        anchor: 'Protected earlier departure option',
      }),
      curationAction: {
        label: 'Review',
        prompt: 'Open the Bali trip Assist alert for connection risk and earlier protected departure options.',
        destinationName: 'Bali',
      },
    }),
    item({
      id: 'reel-admin-passport-window',
      kind: 'travel_admin',
      feedScope: 'both',
      postType: 'travel_admin',
      hook: 'The trip can fail before you ever search flights.',
      title: 'Passport check before Tokyo',
      detail: 'Tokyo 2026 is far enough out to fix document risk calmly. Elsewhere can hand off renewal help before prices and plans harden.',
      mediaType: 'image',
      mediaUrl: lisbon,
      mediaPosterUrl: lisbon,
      sourceLine: 'Travel admin · document risk',
      locationLabel: 'Passport',
      primaryValueLabel: 'renewal window open',
      relevanceReason: 'International trip planning detected; document timing is now actionable.',
      contentTopics: ['travel admin', 'passport', 'Japan', 'trip readiness'],
      interactionStats: { likes: 900, learns: 3900, plans: 700, shares: 220 },
      contentSources: [mediaSource(lisbon)],
      music: music('Paperwork Soft Launch', 'ambient'),
      adminAction: {
        kind: 'passport',
        statusLabel: 'Renewal recommended',
        deadlineLabel: 'Before booking international fall travel',
        actionLabel: 'Start passport help',
        partnerName: 'GovSwift',
        partnerUrl: 'https://govswift.com/services/passport/?utm_source=elsewhere&utm_medium=app&utm_campaign=travel_admin',
      },
      assistWatchItems: [
        'Passport validity against destination rules',
        'Renewal processing timing',
        'Trip deposit deadlines before documents are safe',
      ],
      curationAction: {
        label: 'Fix',
        prompt: 'Open travel admin for passport renewal support before international trip booking.',
        destinationName: 'Tokyo',
      },
    }),
    item({
      id: 'reel-stay-marrakech-riad',
      kind: 'unique_stay',
      feedScope: 'both',
      postType: 'hotel_reveal',
      hook: 'Why do riads feel hidden from the street?',
      title: 'The courtyard house built for quiet',
      detail: 'From the outside, a plain wall. Inside, shade, tile, water, mint tea, and a roofline that turns the city into a slower story.',
      mediaType: 'image',
      mediaUrl: marrakech,
      mediaPosterUrl: marrakech,
      sourceLine: 'Unique stay · Marrakech',
      locationLabel: 'Marrakech',
      primaryValueLabel: 'from $121/mo',
      priceBadgeLabel: 'from $121/mo',
      relevanceReason: 'You engage with stays where the hotel is part of the story.',
      contentTopics: ['hotels', 'architecture', 'Marrakech', 'culture', 'unique stays'],
      interactionStats: { likes: 8300, learns: 5200, plans: 1500, shares: 1400 },
      contentSources: [mediaSource(marrakech)],
      music: music('Riad Courtyard', 'afro beats'),
      tripValue: value(1452, 121, 'Marrakech from $121/mo', 'low'),
      tripProposal: proposal({
        destination: 'Marrakech',
        origin: 'Los Angeles',
        dateWindow: 'Flexible spring or fall',
        calendarFit: 'Works as 5-6 nights with a slower arrival day.',
        groupFit: 'Best for 2-4 travelers comfortable with guided local context.',
        dealTrend: 'watching',
        flight: 720,
        stay: 460,
        activity: 210,
        anchor: 'Riad stay and guided souk morning',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a Marrakech riad trip with guided souk timing, rooftop dinners, optional desert day, and calm pacing.',
        destinationName: 'Marrakech',
      },
    }),
    item({
      id: 'reel-interactive-marrakech-courtyard-cooling',
      kind: 'interactive_prompt',
      feedScope: 'both',
      postType: 'interactive_prompt',
      hook: 'Why are the best rooms in Marrakech turned inward?',
      title: 'The courtyard as old climate technology',
      detail: 'A riad is not just a pretty hotel. The courtyard, shade, tile, and water are a cooling system hiding behind a quiet door.',
      mediaType: 'image',
      mediaUrl: marrakech,
      mediaPosterUrl: marrakech,
      mediaMode: 'animated_still',
      sourceLine: 'Design mystery · Marrakech riads',
      locationLabel: 'Marrakech',
      primaryValueLabel: 'Marrakech from $121/mo',
      relevanceReason: 'You engage with stays where the architecture is the story, not just the room rate.',
      contentTopics: ['architecture', 'hotels', 'climate design', 'Marrakech', 'interactive'],
      interactionStats: { likes: 14200, learns: 10100, plans: 1600, shares: 2100 },
      contentSources: [mediaSource(marrakech)],
      music: music('Courtyard Shade', 'afro beats'),
      interactivePrompt: {
        question: 'What makes a riad feel cooler inside?',
        contextLabel: 'Design question',
        revealAfterMs: 2300,
        answers: [
          {
            id: 'courtyard',
            label: 'courtyard air',
            responseHook: 'Yes. The house breathes inward.',
            responseDetail: 'Courtyards, shade, tile, and water help pull the pace and temperature down. Elsewhere would plan this as a stay-led trip, not a generic hotel search.',
            responseMediaUrl: marrakech,
            responsePosterUrl: marrakech,
            responseCtaLabel: 'Plan the stay',
            isPreferred: true,
          },
          {
            id: 'aircon',
            label: 'only AC',
            responseHook: 'Modern AC helps, but the older trick is better.',
            responseDetail: 'The riad form was already built for shade and airflow. That is why the stay itself can become the main experience.',
            responseMediaUrl: marrakech,
            responsePosterUrl: marrakech,
            responseCtaLabel: 'Show me why',
          },
          {
            id: 'street',
            label: 'street breeze',
            responseHook: 'The street is not the center.',
            responseDetail: 'The calm happens inside. The building turns away from the street and makes the courtyard the climate and social core.',
            responseMediaUrl: marrakech,
            responsePosterUrl: marrakech,
            responseCtaLabel: 'Build around it',
          },
        ],
      },
      tripValue: value(1452, 121, 'Marrakech from $121/mo', 'low'),
      tripProposal: proposal({
        destination: 'Marrakech',
        origin: 'Los Angeles',
        dateWindow: 'Flexible spring or fall',
        calendarFit: 'Best as 5-6 nights with a calm arrival day.',
        groupFit: 'Strong for travelers who care about design, food, and guided local context.',
        dealTrend: 'watching',
        flight: 720,
        stay: 460,
        activity: 210,
        anchor: 'Riad stay and courtyard design walk',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a Marrakech trip around riad architecture, courtyard stays, souk timing, food, and guided context.',
        destinationName: 'Marrakech',
      },
    }),
    item({
      id: 'reel-doc-paris-cafe-facing-street',
      kind: 'editorial_short',
      feedScope: 'both',
      postType: 'destination_short',
      hook: 'Why do Paris cafe chairs face the street?',
      title: 'The sidewalk becomes the show',
      detail: 'The table is small, the chairs turn outward, and the city becomes the screen. Paris cafe culture is part food, part theater, part weather report.',
      mediaType: 'image',
      mediaUrl: parisLeftBank,
      mediaPosterUrl: parisLeftBank,
      sourceLine: 'Street culture · Paris cafe ritual',
      locationLabel: 'Paris',
      primaryValueLabel: 'Paris from $153/mo',
      relevanceReason: 'You save food and city-walk stories; Elsewhere can turn this into a low-pressure first-day rhythm.',
      contentTopics: ['food', 'Paris', 'street life', 'culture', 'city walks'],
      interactionStats: { likes: 18600, learns: 8900, plans: 2600, shares: 3400 },
      contentSources: [mediaSource(parisLeftBank)],
      music: music('Street Seats', 'chill hop'),
      editorialShort: editorialShort({
        hook: 'The seating is a social design choice.',
        fact: 'Many cafe terraces face outward because the street is part of the experience. A good Paris plan leaves time to sit and watch, not just move between landmarks.',
      }),
      tripValue: value(1836, 153, 'Paris from $153/mo', 'medium'),
      tripProposal: proposal({
        destination: 'Paris',
        origin: 'Los Angeles',
        dateWindow: 'October shoulder season',
        calendarFit: 'Works as 5 nights with one flexible museum day.',
        groupFit: 'Best for couples or close friends who want food, walks, and one strong neighborhood base.',
        dealTrend: 'down',
        flight: 398,
        stay: 980,
        activity: 210,
        anchor: 'Left Bank cafe walk and museum block',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a Paris trip around cafe culture, Left Bank walks, museums, shoulder-season fares, and hotel cancellation windows.',
        destinationName: 'Paris',
      },
    }),
    item({
      id: 'reel-doc-la-patio-after-sunset',
      kind: 'editorial_short',
      feedScope: 'both',
      postType: 'destination_short',
      hook: 'Los Angeles is a patio city after sunset.',
      title: 'The microclimate dinner plan',
      detail: 'Marine layer, canyon air, heat trapped in concrete, and neighborhoods that feel like different seasons. In LA, dinner plans are secretly weather plans.',
      mediaType: 'image',
      mediaUrl: laDinner,
      mediaPosterUrl: laDinner,
      sourceLine: 'Local field note · LA dinner weather',
      locationLabel: 'Los Angeles',
      primaryValueLabel: 'tonight watch',
      relevanceReason: 'Local discovery can be useful without becoming a full vacation: watch weather, reservations, traffic, and friends.',
      contentTopics: ['local', 'food', 'Los Angeles', 'weather', 'restaurants'],
      interactionStats: { likes: 9900, learns: 6400, plans: 1100, shares: 1700 },
      contentSources: [mediaSource(laDinner, 'pexels')],
      music: music('After Sunset Table', 'trap soul'),
      editorialShort: editorialShort({
        hook: 'Dinner in LA depends on the air.',
        fact: 'The same night can feel different in Venice, Silver Lake, Koreatown, and Pasadena. Elsewhere can make local plans dynamic instead of static lists.',
      }),
      tripProposal: proposal({
        destination: 'Los Angeles',
        origin: 'Los Angeles',
        dateWindow: 'Tonight or this weekend',
        calendarFit: 'Same-day planning with no travel overhead.',
        groupFit: 'Best for close friends who can vote quickly and split plans.',
        dealTrend: 'watching',
        flight: 0,
        stay: 0,
        activity: 74,
        anchor: 'Outdoor dinner slot with traffic-aware timing',
      }),
      curationAction: {
        label: 'Plan',
        prompt: 'Plan a local Los Angeles dinner night around patio weather, traffic, reservations, and close-friend voting.',
        destinationName: 'Los Angeles',
      },
    }),
  ];
}

export function enrichDiscoverContent(request: DiscoverEnrichRequest): DiscoverEnrichResult {
  const destination = request.destinationName ?? request.title;
  const mediaUrl = DEMO_MEDIA.discover.editorial.santoriniCyclades;
  return {
    assumptions: [
      'Using local demo media until a real provider result is selected.',
      'Trip value is estimated from demo flight, stay, and activity components.',
    ],
    item: {
      id: `ci-enriched-${randomUUID()}`,
      kind: 'editorial',
      feedScope: 'both',
      title: request.title,
      detail: request.prompt ?? `A trip spark built from ${destination}, ready to become a watched proposal.`,
      mediaType: 'image',
      mediaUrl,
      mediaPosterUrl: mediaUrl,
      sourceLine: 'Enriched by Elsewhere · demo intelligence',
      locationLabel: destination,
      primaryValueLabel: 'watching value',
      contentSources: [mediaSource(mediaUrl)],
      tripValue: value(1800, 150, `${destination} from $150/mo`, 'low'),
      tripProposal: proposal({
        destination,
        origin: 'Los Angeles',
        dateWindow: 'Flexible smart window',
        calendarFit: 'Waiting on calendar/provider verification.',
        groupFit: 'Useful as a first trip idea before invite targeting.',
        dealTrend: 'watching',
        flight: 650,
        stay: 780,
        activity: 240,
        anchor: 'Signature local experience',
      }),
      curationAction: {
        label: 'Plan',
        prompt: request.prompt ?? `Curate a trip from ${destination}.`,
        destinationName: destination,
      },
    },
  };
}

export function buildEditorialShort(request: DiscoverEditorialShortRequest): DiscoverEnrichResult {
  const mediaUrl = request.mediaUrl ?? DEMO_MEDIA.discover.editorial.baliRiceTerraces;
  return {
    assumptions: [
      'Returning an editorial short object with script/captions now.',
      'Sora and TTS generation can be attached when the provider job queue is enabled.',
    ],
    item: {
      id: `ci-short-${randomUUID()}`,
      kind: 'editorial_short',
      feedScope: 'elsewhere',
      title: request.hook,
      detail: request.fact,
      mediaType: 'image',
      mediaUrl,
      mediaPosterUrl: mediaUrl,
      sourceLine: 'Editorial short · AI narration-ready',
      locationLabel: request.destinationName,
      primaryValueLabel: 'tap to see it',
      contentSources: [mediaSource(mediaUrl)],
      editorialShort: editorialShort({
        hook: request.hook,
        fact: request.fact,
      }),
      curationAction: {
        label: 'Plan',
        prompt: `Plan a trip to ${request.destinationName} inspired by this short: ${request.fact}`,
        destinationName: request.destinationName,
      },
    },
  };
}

export function importSocialLink(request: DiscoverSocialLinkRequest): DiscoverSocialLinkResult {
  const destination = request.destinationHint ?? 'Saved inspiration';
  const mediaUrl = DEMO_MEDIA.discover.editorial.seoulNightMarket;
  return {
    limitation: 'Social platforms are treated as user-provided link/import surfaces. Elsewhere stores the URL and summary only when allowed.',
    item: {
      id: `ci-social-${randomUUID()}`,
      kind: 'social_link',
      feedScope: 'both',
      title: `${destination} from a saved post`,
      detail: 'A social post can become a trip seed: Elsewhere extracts the place, summarizes why it matters, and watches routes, dates, and prices.',
      mediaType: 'image',
      mediaUrl,
      mediaPosterUrl: mediaUrl,
      sourceLine: 'Social link import · user supplied',
      locationLabel: destination,
      primaryValueLabel: 'turn into a trip',
      contentSources: [
        mediaSource(mediaUrl),
        {
          kind: 'social_link',
          name: 'User-provided social URL',
          url: request.url,
          attribution: null,
          freshnessLabel: 'Imported now',
          limitation: 'No broad social scraping. Link previews depend on platform permission and metadata availability.',
        },
      ],
      curationAction: {
        label: 'Plan',
        prompt: `Curate a trip from this social post: ${request.url}`,
        destinationName: destination,
      },
    },
  };
}

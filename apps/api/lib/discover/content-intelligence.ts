import { randomUUID } from 'crypto';
import {
  DEMO_MEDIA,
  DEMO_MEDIA_METADATA,
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
  ];
}

function music(title: string, genre: string, artistOrLibrary = 'Elsewhere Sound Library'): DiscoverMusicAttribution {
  return {
    title,
    artistOrLibrary,
    genre,
    licenseKind: 'royalty_free_demo',
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

function item(input: DiscoverFeedItem): DiscoverFeedItem {
  return {
    ...input,
    hook: input.hook ?? input.editorialShort?.hook ?? input.title,
    creatorLabel: input.creatorLabel ?? input.advertiserName ?? input.sourceLine.split('·')[0].trim(),
    mediaMode: input.mediaMode ?? inferMediaMode(input),
    rightsStatus: input.rightsStatus ?? inferRightsStatus(input),
    music: input.music ?? music('Elsewhere Drift', 'chill hop'),
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
      mediaType: 'video',
      mediaUrl: DEMO_MEDIA.discover.personalized.baliVideo,
      mediaPosterUrl: bali,
      mediaMode: 'ai_video',
      sourceLine: 'Interactive short · Bali culture',
      locationLabel: 'Bali',
      primaryValueLabel: 'from $188/mo',
      relevanceReason: 'You watched slow nature and villa trips, so Elsewhere is testing a culture-first Bali route.',
      contentTopics: ['nature', 'culture', 'food', 'Bali', 'interactive'],
      interactionStats: { likes: 11200, learns: 7800, plans: 1600, shares: 1900 },
      contentSources: [
        {
          kind: 'ai_generated',
          name: 'Elsewhere generated field segment',
          url: null,
          attribution: null,
          freshnessLabel: 'Generated demo travel short',
          limitation: 'Demo AI video stands in for a production narrated destination short.',
        },
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
            responseMediaUrl: DEMO_MEDIA.discover.personalized.baliVideo,
            responsePosterUrl: bali,
            responseCtaLabel: 'Plan around it',
            isPreferred: true,
          },
          {
            id: 'rain',
            label: 'only rainfall',
            responseHook: 'Rain helps, but the real answer is smarter.',
            responseDetail: 'The terraces depend on a community-managed water system. That changes the trip: go with context, early light, and a guide who can explain what you are seeing.',
            responseMediaUrl: DEMO_MEDIA.discover.personalized.baliVideo,
            responsePosterUrl: bali,
            responseCtaLabel: 'Show me the route',
          },
          {
            id: 'machines',
            label: 'modern pumps',
            responseHook: 'Not the main story.',
            responseDetail: 'The famous rhythm comes from shared water governance and temple timing. Elsewhere can turn that into a respectful morning itinerary.',
            responseMediaUrl: DEMO_MEDIA.discover.personalized.baliVideo,
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

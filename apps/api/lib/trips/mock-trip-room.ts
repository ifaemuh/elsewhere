import type {
  ActiveTripGuide,
  TripActionItem,
  TripActionItemStatus,
  TripChatProvider,
  TripChatSuggestion,
  TripFeedCard,
  TripMediaApprovalAction,
  TripMediaItem,
  TripMediaResult,
  TripMediaShareSettings,
  TripMessage,
  TripNotification,
  TripPaymentSummary,
  TripPlannerSuggestion,
  TripParticipationStatus,
  TripScheduleItem,
  TripVote,
} from '@elsewhere/shared';
import { DEMO_MEDIA } from '@elsewhere/shared';
import { getMockTripGuide } from '@lib/assist/mock-trip-guides';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEV_USER_ID = 'dev-user-000';

function tripMediaSet(destinationName: string) {
  const destination = destinationName.toLowerCase();

  if (destination.includes('lisbon')) {
    return {
      photo: DEMO_MEDIA.trips.media.lisbonPhoto,
      dinner: DEMO_MEDIA.trips.media.lisbonDinner,
      reel: DEMO_MEDIA.trips.media.lisbonSocial,
      video: DEMO_MEDIA.trips.media.parisVideo,
      videoPoster: DEMO_MEDIA.trips.media.lisbonRecapPoster,
      tiktok: DEMO_MEDIA.trips.schedule.lisbonTram,
      recap: DEMO_MEDIA.trips.media.parisVideo,
      recapPoster: DEMO_MEDIA.trips.media.lisbonRecapPoster,
    };
  }

  if (destination.includes('bali')) {
    return {
      photo: DEMO_MEDIA.trips.schedule.baliYoga,
      dinner: DEMO_MEDIA.trips.explore.baliLocavore,
      reel: DEMO_MEDIA.trips.schedule.baliSurf,
      video: DEMO_MEDIA.trips.media.baliVideo,
      videoPoster: DEMO_MEDIA.trips.schedule.baliSurf,
      tiktok: DEMO_MEDIA.trips.schedule.baliYoga,
      recap: DEMO_MEDIA.trips.media.baliVideo,
      recapPoster: DEMO_MEDIA.trips.headers.bali,
    };
  }

  if (destination.includes('paris')) {
    return {
      photo: DEMO_MEDIA.trips.schedule.parisDinner,
      dinner: DEMO_MEDIA.trips.explore.parisFrenchie,
      reel: DEMO_MEDIA.trips.schedule.parisRooftop,
      video: DEMO_MEDIA.trips.media.parisVideo,
      videoPoster: DEMO_MEDIA.trips.schedule.parisRooftop,
      tiktok: DEMO_MEDIA.trips.explore.parisMuseum,
      recap: DEMO_MEDIA.trips.media.parisVideo,
      recapPoster: DEMO_MEDIA.trips.headers.paris,
    };
  }

  return {
    photo: DEMO_MEDIA.trips.media.tokyoPhoto,
    dinner: DEMO_MEDIA.trips.media.tokyoDinner,
    reel: DEMO_MEDIA.trips.media.tokyoSocial,
    video: DEMO_MEDIA.trips.media.tokyoVideo,
    videoPoster: DEMO_MEDIA.trips.media.tokyoVideoPoster,
    tiktok: DEMO_MEDIA.trips.media.tokyoTiktok,
    recap: DEMO_MEDIA.trips.media.tokyoVideo,
    recapPoster: DEMO_MEDIA.trips.headers.tokyo,
  };
}

interface TripRoomMemoryState {
  actionStatuses: Map<string, TripActionItemStatus>;
  mediaActions: Map<string, TripMediaApprovalAction>;
  participationStatuses: Map<string, TripParticipationStatus>;
  voteResponses: Map<string, string>;
}

const roomState = getTripRoomMemoryState();

function getTripRoomMemoryState(): TripRoomMemoryState {
  const globalState = globalThis as typeof globalThis & {
    __elsewhereTripRoomMemoryState?: TripRoomMemoryState;
  };

  globalState.__elsewhereTripRoomMemoryState ??= {
    actionStatuses: new Map<string, TripActionItemStatus>(),
    mediaActions: new Map<string, TripMediaApprovalAction>(),
    participationStatuses: new Map<string, TripParticipationStatus>(),
    voteResponses: new Map<string, string>(),
  };

  return globalState.__elsewhereTripRoomMemoryState;
}

function key(...parts: string[]): string {
  return parts.join(':');
}

function iso(daysFromNow: number, hour: number, minute = 0): string {
  const date = new Date(Date.now() + daysFromNow * DAY_MS);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function place(name: string, neighborhood: string, latitude: number, longitude: number) {
  return { name, neighborhood, latitude, longitude };
}

function participants(status: 'going' | 'resting' | 'join_later' = 'going') {
  return [
    { userId: DEV_USER_ID, name: 'You', status: 'going' as const },
    { userId: 'traveler-alex', name: 'Alex', status: 'going' as const },
    { userId: 'traveler-mia', name: 'Mia', status },
  ];
}

function applyScheduleOverrides(tripId: string, items: TripScheduleItem[]): TripScheduleItem[] {
  return items.map((item) => {
    const status = roomState.participationStatuses.get(key(tripId, item.id, DEV_USER_ID));
    if (!status) return item;

    return {
      ...item,
      participants: item.participants.map((participant) =>
        participant.userId === DEV_USER_ID ? { ...participant, status } : participant,
      ),
      notes: status === 'join_later'
        ? 'You marked this as join later. Elsewhere will keep the group posted.'
        : item.notes,
    };
  });
}

function applyVoteOverrides(tripId: string, votes: TripVote[]): TripVote[] {
  return votes.map((vote) => {
    const selectedOptionId = roomState.voteResponses.get(key(tripId, vote.id, DEV_USER_ID));
    if (!selectedOptionId) return vote;

    return {
      ...vote,
      options: vote.options.map((option) => ({
        ...option,
        votes: option.id === selectedOptionId ? option.votes + 1 : option.votes,
      })),
    };
  });
}

function applyActionOverrides(tripId: string, items: TripActionItem[]): TripActionItem[] {
  return items.map((item) => ({
    ...item,
    status: roomState.actionStatuses.get(key(tripId, item.id)) ?? item.status,
  }));
}

function applyMediaAction(item: TripMediaItem, action: TripMediaApprovalAction): TripMediaItem {
  if (action === 'approve') {
    return {
      ...item,
      status: 'shared',
      caption: item.caption ?? `Shared near ${item.location?.name ?? 'the trip'}`,
      visibleToTrip: true,
      eligibleForRecap: true,
      matchReasons: [...new Set([...item.matchReasons, 'Approved by owner'])],
    };
  }

  if (action === 'reject') {
    return {
      ...item,
      status: 'rejected',
      visibleToTrip: false,
      eligibleForRecap: false,
      matchReasons: [...new Set([...item.matchReasons, 'Rejected by owner'])],
    };
  }

  if (action === 'hide') {
    return { ...item, status: 'hidden', visibleToTrip: false };
  }

  if (action === 'restore') {
    return { ...item, status: 'shared', visibleToTrip: true };
  }

  if (action === 'select_for_recap') {
    return { ...item, status: 'recap_selected', visibleToTrip: true, eligibleForRecap: true };
  }

  return { ...item, status: 'recap_excluded', eligibleForRecap: false };
}

function applyMediaOverrides(tripId: string, items: TripMediaItem[]): TripMediaItem[] {
  return items.map((item) => {
    const action = roomState.mediaActions.get(key(tripId, item.id));
    return action ? applyMediaAction(item, action) : item;
  });
}

function guideOrFallback(tripId: string): ActiveTripGuide {
  return getMockTripGuide(tripId) ?? {
    tripId,
    tripName: `Trip ${new Date().getFullYear()}`,
    tripTagline: null,
    destinationName: 'Trip',
    destinationCountry: '',
    status: 'booked',
    travelerCount: 2,
    totalCost: 4200,
    protectedValue: 0,
    potentialSavings: 0,
    monitoredAt: new Date().toISOString(),
    segments: [],
    opportunities: [],
    cancellation: {
      tripId,
      summary: 'Assist is waiting for booking details.',
      refundAmount: 0,
      travelCreditAmount: 0,
      feeAmount: 0,
      decisionWindowEndsAt: null,
      creditExpiresAt: null,
      risks: [],
    },
  };
}

export function getMockTripSchedule(tripId: string): TripScheduleItem[] {
  const guide = guideOrFallback(tripId);
  const isPast = guide.status === 'completed';
  const day = isPast ? -3 : guide.status === 'in_progress' ? 0 : 22;
  const destination = guide.destinationName.toLowerCase();

  if (destination.includes('bali')) {
    return applyScheduleOverrides(tripId, [
      {
        id: 'sched-bali-yoga',
        tripId,
        title: 'Sunrise yoga at the villa',
        kind: 'experience',
        startsAt: iso(day, 7),
        endsAt: iso(day, 8, 15),
        place: place('Ubud Jungle Villas', 'Ubud', -8.5069, 115.2625),
        participants: participants('resting'),
        reservationStatus: 'booked',
        bookingUrl: null,
        costEstimate: 0,
        notes: 'Taylor is resting and can join breakfast after.',
      },
      {
        id: 'sched-bali-surf',
        tripId,
        title: 'Canggu surf sunset',
        kind: 'experience',
        startsAt: iso(day, 17),
        endsAt: iso(day, 19),
        place: place('Batu Bolong Beach', 'Canggu', -8.6581, 115.1307),
        participants: participants('join_later'),
        reservationStatus: 'suggested',
        bookingUrl: null,
        costEstimate: 42,
        notes: 'Mia can join later from the hotel. 22 min ride.',
      },
    ]);
  }

  if (destination.includes('lisbon')) {
    return applyScheduleOverrides(tripId, [
      {
        id: 'sched-lisbon-tram',
        tripId,
        title: 'Alfama tram walk',
        kind: 'attraction',
        startsAt: iso(day, 10),
        endsAt: iso(day, 12),
        place: place('Alfama', 'Lisbon', 38.711, -9.129),
        participants: participants(),
        reservationStatus: 'booked',
        bookingUrl: null,
        costEstimate: 8,
        notes: 'Completed and added to recap candidates.',
      },
      {
        id: 'sched-lisbon-dinner',
        tripId,
        title: 'Fado dinner',
        kind: 'restaurant',
        startsAt: iso(day, 20),
        endsAt: iso(day, 22),
        place: place('Clube de Fado', 'Alfama', 38.7103, -9.1302),
        participants: participants(),
        reservationStatus: 'booked',
        bookingUrl: null,
        costEstimate: 88,
        notes: 'Best audio moment for recap.',
      },
    ]);
  }

  return applyScheduleOverrides(tripId, [
    {
      id: 'sched-tokyo-ramen',
      tripId,
      title: destination.includes('paris') ? 'Montmartre dinner walk' : 'Ramen Nagi dinner',
      kind: destination.includes('paris') ? 'restaurant' : 'restaurant',
      startsAt: iso(day, 19),
      endsAt: iso(day, 20, 30),
      place: destination.includes('paris')
        ? place('Bouillon Pigalle', 'Montmartre', 48.8822, 2.3376)
        : place('Ramen Nagi', 'Shinjuku', 35.6938, 139.7034),
      participants: participants('resting'),
      reservationStatus: 'booked',
      bookingUrl: null,
      costEstimate: destination.includes('paris') ? 36 : 18,
      notes: 'Mia is resting at the hotel and can join later.',
    },
    {
      id: 'sched-tokyo-golden-gai',
      tripId,
      title: destination.includes('paris') ? 'Rooftop night view' : 'Golden Gai jazz bar',
      kind: 'event',
      startsAt: iso(day, 21, 30),
      endsAt: iso(day, 23),
      place: destination.includes('paris')
        ? place('Terrass Hotel Rooftop', 'Montmartre', 48.8867, 2.3337)
        : place('Golden Gai', 'Shinjuku', 35.6938, 139.7041),
      participants: [
        { userId: 'dev-user-000', name: 'You', status: 'going' },
        { userId: 'traveler-jordan', name: 'Jordan', status: 'going' },
        { userId: 'traveler-mia', name: 'Mia', status: 'join_later' },
      ],
      reservationStatus: 'suggested',
      bookingUrl: null,
      costEstimate: destination.includes('paris') ? 28 : 22,
      notes: 'Join-later friendly. 12 min from hotel.',
    },
  ]);
}

export function getMockTripPlannerSuggestions(tripId: string): TripPlannerSuggestion[] {
  const guide = guideOrFallback(tripId);
  const destination = guide.destinationName.toLowerCase();
  const day = guide.status === 'in_progress' ? 0 : 22;

  if (destination.includes('bali')) {
    return [
      {
        id: 'suggest-bali-warung',
        tripId,
        kind: 'restaurant',
        title: 'Locavore To Go',
        summary: 'Low-key dinner near Ubud with strong vegetarian options.',
        place: place('Locavore To Go', 'Ubud', -8.5081, 115.2638),
        distanceText: '0.4 mi',
        travelTimeText: '9 min walk',
        priceLevel: '$$',
        startsAt: iso(day, 19),
        availability: 'Tables open after 7:30 PM',
        weatherFit: 'Good if rain continues',
        preferenceFit: 'Matches Mia vegetarian, Alex low-key dinner',
        bookable: true,
        source: 'Mock places feed',
        confidence: 'high',
      },
      {
        id: 'suggest-bali-spa',
        tripId,
        kind: 'rest',
        title: 'Hotel spa reset',
        summary: 'Quiet option for anyone skipping the surf lesson.',
        place: place('Ubud Jungle Villas Spa', 'Ubud', -8.5069, 115.2625),
        distanceText: 'On property',
        travelTimeText: '2 min walk',
        priceLevel: '$$',
        startsAt: iso(day, 17),
        availability: '2 slots open',
        weatherFit: 'Rain-safe',
        preferenceFit: 'Good rest option',
        bookable: true,
        source: 'Mock hotel feed',
        confidence: 'high',
      },
    ];
  }

  return [
    {
      id: 'suggest-night-food',
      tripId,
      kind: 'restaurant',
      title: destination.includes('paris') ? 'Frenchie Bar a Vins' : 'Omoide Yokocho food walk',
      summary: destination.includes('paris')
        ? 'Wine-bar dinner that works before the rooftop plan.'
        : 'Street-food lane that fits before Golden Gai.',
      place: destination.includes('paris')
        ? place('Frenchie Bar a Vins', 'Sentier', 48.8678, 2.3477)
        : place('Omoide Yokocho', 'Shinjuku', 35.6934, 139.7006),
      distanceText: destination.includes('paris') ? '1.1 mi' : '0.3 mi',
      travelTimeText: destination.includes('paris') ? '18 min metro' : '7 min walk',
      priceLevel: '$$',
      startsAt: iso(day, 18, 30),
      availability: 'Good before 8 PM',
      weatherFit: 'Indoor backup nearby',
      preferenceFit: 'Matches food + nightlife interests',
      bookable: true,
      source: 'Mock places feed',
      confidence: 'high',
    },
    {
      id: 'suggest-gallery-slot',
      tripId,
      kind: destination.includes('paris') ? 'attraction' : 'hidden_gem',
      title: destination.includes('paris') ? 'Musee de la Vie Romantique' : 'Listening bar in Shibuya',
      summary: destination.includes('paris')
        ? 'Quiet museum garden for the afternoon open slot.'
        : 'Low-pressure listening bar if the group wants a calmer night.',
      place: destination.includes('paris')
        ? place('Musee de la Vie Romantique', 'Pigalle', 48.8816, 2.3347)
        : place('JBS Bar', 'Shibuya', 35.6579, 139.7016),
      distanceText: destination.includes('paris') ? '0.6 mi' : '2 stops',
      travelTimeText: destination.includes('paris') ? '13 min walk' : '15 min train',
      priceLevel: '$$',
      startsAt: iso(day, 16),
      availability: 'Open slot fit',
      weatherFit: 'Rain-safe',
      preferenceFit: 'Good for a split-group plan',
      bookable: false,
      source: 'Mock local guide',
      confidence: 'medium',
    },
  ];
}

export function getMockTripVotes(tripId: string): TripVote[] {
  return applyVoteOverrides(tripId, [
    {
      id: 'vote-tonight-plan',
      tripId,
      title: 'Tonight after dinner',
      detail: 'Pick one plan so Elsewhere can hold the right reservation window.',
      options: [
        { id: 'golden-gai', label: 'Golden Gai / rooftop', votes: 2 },
        { id: 'listening-bar', label: 'Quiet listening bar', votes: 1 },
        { id: 'hotel-rest', label: 'Rest at hotel', votes: 1 },
      ],
      requiredParticipantIds: ['dev-user-000', 'traveler-alex', 'traveler-mia'],
      deadline: iso(0, 17),
      status: 'open',
    },
  ]);
}

export function getMockTripActionItems(tripId: string): TripActionItem[] {
  const guide = guideOrFallback(tripId);
  const firstOpportunity = guide.opportunities[0];

  return applyActionOverrides(tripId, [
    ...(firstOpportunity ? [{
      id: 'action-assist-review',
      tripId,
      kind: 'assist' as const,
      title: firstOpportunity.autoActionable ? 'Approve Assist action' : 'Review Assist watch item',
      detail: firstOpportunity.title,
      assignedUserIds: ['dev-user-000'],
      dueAt: firstOpportunity.deadlineAt,
      status: 'open' as const,
      relatedEntityId: firstOpportunity.id,
      notificationState: 'enabled' as const,
    }] : []),
    {
      id: 'action-payment-mia',
      tripId,
      kind: 'payment',
      title: 'Mia payment due Friday',
      detail: 'Installment 2 of 6 is due for the group plan.',
      assignedUserIds: ['traveler-mia'],
      dueAt: iso(3, 9),
      status: guide.status === 'completed' ? 'done' : 'open',
      relatedEntityId: 'payment-summary',
      notificationState: 'enabled',
    },
    {
      id: 'action-passport-check',
      tripId,
      kind: 'document',
      title: 'Passport check',
      detail: 'One traveler has a passport expiring within 8 months.',
      assignedUserIds: ['traveler-alex'],
      dueAt: iso(5, 12),
      status: guide.status === 'completed' ? 'done' : 'open',
      relatedEntityId: 'document-passport',
      notificationState: 'quiet',
    },
  ]);
}

export function getMockTripPaymentSummary(tripId: string): TripPaymentSummary {
  const guide = guideOrFallback(tripId);
  const total = guide.totalCost;
  const paid = guide.status === 'completed' ? total : Math.round(total * 0.46);
  const due = Math.max(total - paid, 0);

  return {
    tripId,
    totalCost: total,
    paidAmount: paid,
    dueAmount: due,
    monthlyPlanAmount: guide.status === 'completed' ? null : Math.ceil(due / 6),
    nextPaymentDueAt: guide.status === 'completed' ? null : iso(3, 9),
    travelCredits: guide.cancellation.travelCreditAmount,
    refundsPending: guide.status === 'completed' ? guide.cancellation.refundAmount : 0,
    travelers: [
      { userId: 'dev-user-000', name: 'You', totalDue: Math.round(total / guide.travelerCount), paid: Math.round(total / guide.travelerCount), nextDueAt: null, status: 'paid' as const },
      { userId: 'traveler-alex', name: 'Alex', totalDue: Math.round(total / guide.travelerCount), paid: Math.round(total / guide.travelerCount * 0.5), nextDueAt: iso(3, 9), status: guide.status === 'completed' ? 'paid' as const : 'due' as const },
      { userId: 'traveler-mia', name: 'Mia', totalDue: Math.round(total / guide.travelerCount), paid: Math.round(total / guide.travelerCount * 0.35), nextDueAt: iso(3, 9), status: guide.status === 'completed' ? 'paid' as const : 'pending' as const },
    ].slice(0, Math.max(1, guide.travelerCount)),
  };
}

export function getMockTripMedia(tripId: string): TripMediaResult {
  const guide = guideOrFallback(tripId);
  const isPast = guide.status === 'completed';
  const media = tripMediaSet(guide.destinationName);
  const settings: TripMediaShareSettings = {
    tripId,
    userId: 'dev-user-000',
    sharingMode: 'approval_required',
    allowPhotoLibraryScan: true,
    allowVideoCandidates: true,
    allowSocialPostSuggestions: true,
    autoShareMinConfidence: 'high',
    defaultRecapEligible: true,
  };

  const items: TripMediaItem[] = [
    {
      id: 'media-user-candidate',
      tripId,
      ownerUserId: DEV_USER_ID,
      ownerName: 'You',
      source: 'photo_library',
      mediaType: 'photo',
      status: isPast ? 'recap_selected' : 'candidate',
      caption: isPast ? 'Alfama tram walk' : null,
      capturedAt: iso(isPast ? -3 : 0, 18, 42),
      uploadedAt: new Date().toISOString(),
      sourceUrl: media.photo,
      thumbnailUrl: media.photo,
      socialProvider: null,
      socialPostUrl: null,
      socialAuthorHandle: null,
      location: { name: isPast ? 'Alfama' : 'Shinjuku', latitude: 35.6938, longitude: 139.7041 },
      matchedPlaceId: 'place-shinjuku',
      matchedScheduleItemId: isPast ? 'sched-lisbon-tram' : 'sched-tokyo-golden-gai',
      matchConfidence: 'high',
      matchReasons: ['Captured during trip dates', 'Location matches a scheduled stop'],
      visibleToTrip: isPast,
      eligibleForRecap: true,
    },
    {
      id: 'media-mia-shared',
      tripId,
      ownerUserId: 'traveler-mia',
      ownerName: 'Mia',
      source: 'manual_upload',
      mediaType: 'photo',
      status: 'shared',
      caption: isPast ? 'Best dinner of the trip' : 'Dinner scouting',
      capturedAt: iso(isPast ? -3 : 0, 20, 10),
      uploadedAt: new Date().toISOString(),
      sourceUrl: media.dinner,
      thumbnailUrl: media.dinner,
      socialProvider: null,
      socialPostUrl: null,
      socialAuthorHandle: null,
      location: { name: isPast ? 'Clube de Fado' : 'Omoide Yokocho', latitude: 35.6934, longitude: 139.7006 },
      matchedPlaceId: 'place-dinner',
      matchedScheduleItemId: isPast ? 'sched-lisbon-dinner' : 'sched-tokyo-ramen',
      matchConfidence: 'manual',
      matchReasons: ['Manually shared by owner'],
      visibleToTrip: true,
      eligibleForRecap: true,
    },
    {
      id: 'media-jordan-reel',
      tripId,
      ownerUserId: 'traveler-jordan',
      ownerName: 'Jordan',
      source: 'social_post',
      mediaType: 'social_post',
      status: 'shared',
      caption: 'Night one energy',
      capturedAt: iso(isPast ? -3 : 0, 22, 4),
      uploadedAt: new Date().toISOString(),
      sourceUrl: media.reel,
      thumbnailUrl: media.reel,
      socialProvider: 'Instagram',
      socialPostUrl: 'https://instagram.com/stories/mock-elsewhere-trip',
      socialAuthorHandle: '@jordan',
      location: { name: isPast ? 'Pink Street' : 'Golden Gai', latitude: 35.6938, longitude: 139.7041 },
      matchedPlaceId: 'place-nightlife',
      matchedScheduleItemId: isPast ? null : 'sched-tokyo-golden-gai',
      matchConfidence: 'manual',
      matchReasons: ['Approved social post link'],
      visibleToTrip: true,
      eligibleForRecap: isPast,
    },
    {
      id: 'media-user-video-candidate',
      tripId,
      ownerUserId: DEV_USER_ID,
      ownerName: 'You',
      source: 'photo_library',
      mediaType: 'video',
      status: isPast ? 'recap_selected' : 'candidate',
      caption: isPast ? 'Last night walk' : null,
      capturedAt: iso(isPast ? -2 : 0, 21, 18),
      uploadedAt: new Date().toISOString(),
      sourceUrl: media.video,
      thumbnailUrl: media.videoPoster,
      socialProvider: null,
      socialPostUrl: null,
      socialAuthorHandle: null,
      location: { name: isPast ? 'Miradouro' : 'Golden Gai', latitude: 35.6938, longitude: 139.7041 },
      matchedPlaceId: 'place-nightlife',
      matchedScheduleItemId: isPast ? 'sched-lisbon-dinner' : 'sched-tokyo-golden-gai',
      matchConfidence: 'medium',
      matchReasons: ['Native camera video', 'Captured inside trip window', 'Nearby planned nightlife stop'],
      visibleToTrip: isPast,
      eligibleForRecap: true,
    },
    {
      id: 'media-mia-tiktok',
      tripId,
      ownerUserId: 'traveler-mia',
      ownerName: 'Mia',
      source: 'social_post',
      mediaType: 'social_post',
      status: 'shared',
      caption: 'Saved the temple route for the recap',
      capturedAt: iso(isPast ? -2 : 1, 10, 30),
      uploadedAt: new Date().toISOString(),
      sourceUrl: media.tiktok,
      thumbnailUrl: media.tiktok,
      socialProvider: 'TikTok',
      socialPostUrl: 'https://www.tiktok.com/@elsewhere/mock-trip',
      socialAuthorHandle: '@mia',
      location: { name: isPast ? 'Belém' : 'Senso-ji', latitude: 35.7148, longitude: 139.7967 },
      matchedPlaceId: 'place-temple',
      matchedScheduleItemId: null,
      matchConfidence: 'manual',
      matchReasons: ['Approved social post link', 'Matched to trip location tag'],
      visibleToTrip: true,
      eligibleForRecap: true,
    },
    ...(isPast ? [{
      id: 'media-trip-recap',
      tripId,
      ownerUserId: DEV_USER_ID,
      ownerName: 'Elsewhere',
      source: 'recap_output' as const,
      mediaType: 'recap_video' as const,
      status: 'shared' as const,
      caption: 'Lisbon 2026 recap film',
      capturedAt: iso(-1, 12),
      uploadedAt: new Date().toISOString(),
      sourceUrl: media.recap,
      thumbnailUrl: media.recapPoster,
      socialProvider: null,
      socialPostUrl: null,
      socialAuthorHandle: null,
      location: { name: 'Lisbon', latitude: 38.7223, longitude: -9.1393 },
      matchedPlaceId: 'place-lisbon',
      matchedScheduleItemId: null,
      matchConfidence: 'manual' as const,
      matchReasons: ['Generated from approved trip media', 'Ready for story export'],
      visibleToTrip: true,
      eligibleForRecap: false,
    }] : []),
  ];

  return { items: applyMediaOverrides(tripId, items), shareSettings: settings };
}

export function getMockTripMessages(tripId: string): TripMessage[] {
  return [
    {
      id: 'msg-1',
      tripId,
      senderUserId: 'traveler-mia',
      senderName: 'Mia',
      body: 'I may rest through dinner but join the jazz bar later.',
      providerMessageId: 'mock-msg-1',
      relatedCardId: 'card-join-later',
      attachments: [],
      intentSignals: ['join_later', 'schedule_change'],
      createdAt: iso(0, 14, 12),
    },
    {
      id: 'msg-2',
      tripId,
      senderUserId: DEV_USER_ID,
      senderName: 'You',
      body: 'Perfect. Elsewhere says it is a 12 min walk from the hotel.',
      providerMessageId: 'mock-msg-2',
      relatedCardId: 'card-join-later',
      attachments: [],
      intentSignals: ['location_context'],
      createdAt: iso(0, 14, 15),
    },
    {
      id: 'msg-3',
      tripId,
      senderUserId: 'traveler-alex',
      senderName: 'Alex',
      body: 'If we actually make this happen tonight...',
      providerMessageId: 'mock-msg-3',
      relatedCardId: 'vote-tonight-plan',
      attachments: [
        {
          id: 'gif-alex-ready',
          type: 'gif',
          title: 'Ready for it',
          url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
          thumbnailUrl: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200w.gif',
          providerName: 'GIPHY',
          relatedEntityId: null,
        },
      ],
      intentSignals: ['activity_interest', 'vote_prompt'],
      createdAt: iso(0, 14, 18),
    },
  ];
}

export function getMockTripChatProvider(tripId: string): TripChatProvider {
  const configuredProvider = process.env.ELSEWHERE_CHAT_PROVIDER;
  const isStreamConfigured = configuredProvider === 'stream' && !!process.env.STREAM_CHAT_API_KEY;
  const isSendbirdConfigured = configuredProvider === 'sendbird' && !!process.env.SENDBIRD_APP_ID;

  if (isStreamConfigured) {
    return {
      tripId,
      provider: 'stream',
      channelId: `trip-${tripId}`,
      configured: true,
      supportsGifs: true,
      supportsModeration: true,
      detail: 'Stream Chat adapter ready for hosted channels, attachments, reactions, moderation, and GIF workflows.',
    };
  }

  if (isSendbirdConfigured) {
    return {
      tripId,
      provider: 'sendbird',
      channelId: `trip-${tripId}`,
      configured: true,
      supportsGifs: true,
      supportsModeration: true,
      detail: 'Sendbird adapter ready for hosted channels, attachments, reactions, moderation, and GIF workflows.',
    };
  }

  return {
    tripId,
    provider: 'mock',
    channelId: `mock-trip-${tripId}`,
    configured: false,
    supportsGifs: true,
    supportsModeration: false,
    detail: 'Local mock chat. Swap to Stream or Sendbird when provider credentials are configured.',
  };
}

export function getMockTripChatSuggestions(tripId: string): TripChatSuggestion[] {
  return [
    {
      id: 'chat-suggestion-vote-tonight',
      tripId,
      kind: 'vote',
      title: 'Start a quick vote for tonight',
      detail: 'The chat shows split intent: Mia may join later, Alex wants to go out, and the group needs one simple decision.',
      confidence: 'high',
      sourceMessageIds: ['msg-1', 'msg-3'],
      actionLabel: 'Vote',
      relatedEntityId: 'vote-tonight-plan',
    },
    {
      id: 'chat-suggestion-join-later',
      tripId,
      kind: 'join_later',
      title: 'Keep Mia on a join-later path',
      detail: 'Elsewhere can preserve dinner as optional and send a meetup prompt before the jazz bar.',
      confidence: 'medium',
      sourceMessageIds: ['msg-1'],
      actionLabel: 'Update schedule',
      relatedEntityId: 'sched-tokyo-golden-gai',
    },
  ];
}

export function getMockTripNotifications(tripId: string): TripNotification[] {
  const guide = guideOrFallback(tripId);
  const firstOpportunity = guide.opportunities[0];
  return [
    ...(firstOpportunity ? [{
      id: 'note-assist',
      tripId,
      title: firstOpportunity.title,
      detail: firstOpportunity.detail,
      priority: 'urgent' as const,
      channel: 'push' as const,
      relatedEntityId: firstOpportunity.id,
      createdAt: new Date().toISOString(),
    }] : []),
    {
      id: 'note-media',
      tripId,
      title: 'New trip media candidate',
      detail: 'You took photos near a scheduled stop. Approve them for the trip feed?',
      priority: 'quiet',
      channel: 'in_app',
      relatedEntityId: 'media-user-candidate',
      createdAt: new Date().toISOString(),
    },
  ];
}

export function getMockTripFeed(tripId: string): TripFeedCard[] {
  const guide = guideOrFallback(tripId);
  const schedule = getMockTripSchedule(tripId);
  const suggestions = getMockTripPlannerSuggestions(tripId);
  const actions = getMockTripActionItems(tripId).filter((item) => item.status === 'open');
  const media = getMockTripMedia(tripId).items;
  const firstOpportunity = guide.opportunities[0];
  const nextSchedule = schedule[0];
  const firstSuggestion = suggestions[0];

  const cards: TripFeedCard[] = [];

  if (nextSchedule) {
    cards.push({
      id: 'card-next-up',
      tripId,
      kind: 'next_up',
      priority: guide.status === 'in_progress' ? 'urgent' : 'high',
      title: nextSchedule.title,
      subtitle: `${nextSchedule.place?.neighborhood ?? guide.destinationName} · ${nextSchedule.reservationStatus.replace('_', ' ')}`,
      detail: nextSchedule.notes ?? 'Next confirmed item on the trip timeline.',
      ctaLabel: 'View schedule',
      relatedEntityId: nextSchedule.id,
      startsAt: nextSchedule.startsAt,
      expiresAt: nextSchedule.endsAt,
      statusLabel: nextSchedule.participants.map((p) => `${p.name}: ${p.status.replace('_', ' ')}`).join(' · '),
    });
  }

  if (firstOpportunity) {
    cards.push({
      id: 'card-assist',
      tripId,
      kind: 'assist',
      priority: firstOpportunity.autoActionable ? 'urgent' : 'high',
      title: firstOpportunity.title,
      subtitle: firstOpportunity.actionLabel,
      detail: firstOpportunity.detail,
      ctaLabel: firstOpportunity.autoActionable ? 'Review action' : 'Explain options',
      relatedEntityId: firstOpportunity.id,
      startsAt: null,
      expiresAt: firstOpportunity.deadlineAt,
      statusLabel: firstOpportunity.status.replace('_', ' '),
    });
  }

  if (firstSuggestion && guide.status !== 'completed') {
    cards.push({
      id: 'card-suggestion',
      tripId,
      kind: 'planner_suggestion',
      priority: 'normal',
      title: firstSuggestion.title,
      subtitle: `${firstSuggestion.distanceText} · ${firstSuggestion.travelTimeText}`,
      detail: firstSuggestion.summary,
      ctaLabel: firstSuggestion.bookable ? 'Reserve' : 'Save',
      relatedEntityId: firstSuggestion.id,
      startsAt: firstSuggestion.startsAt,
      expiresAt: null,
      statusLabel: `${firstSuggestion.availability} · ${firstSuggestion.preferenceFit ?? 'Good fit'}`,
    });
  }

  if (!roomState.voteResponses.has(key(tripId, 'vote-tonight-plan', DEV_USER_ID))) {
    cards.push({
      id: 'card-vote',
      tripId,
      kind: 'vote',
      priority: 'normal',
      title: 'Vote needed: tonight after dinner',
      subtitle: '3 options open',
      detail: 'Pick the next plan so the group can split or meet up later without confusion.',
      ctaLabel: 'Vote',
      relatedEntityId: 'vote-tonight-plan',
      startsAt: null,
      expiresAt: iso(0, 17),
      statusLabel: 'Alex and Mia still pending',
    });
  }

  const mediaCandidate = media.find((item) => item.status === 'candidate') ??
    media.find((item) => item.visibleToTrip);
  if (mediaCandidate) {
    cards.push({
      id: 'card-media',
      tripId,
      kind: 'media',
      priority: 'quiet',
      title: mediaCandidate.status === 'candidate' ? 'Approve trip photos?' : `${mediaCandidate.ownerName} shared a memory`,
      subtitle: mediaCandidate.location?.name ?? 'Trip media',
      detail: mediaCandidate.status === 'candidate'
        ? 'Elsewhere matched these by trip time and location. They stay private until you approve.'
        : mediaCandidate.caption ?? 'New media was added to the trip feed.',
      ctaLabel: mediaCandidate.status === 'candidate' ? 'Review' : 'View',
      relatedEntityId: mediaCandidate.id,
      startsAt: mediaCandidate.capturedAt,
      expiresAt: null,
      statusLabel: mediaCandidate.matchConfidence,
    });
  }

  const socialPost = media.find((item) => item.source === 'social_post' && item.visibleToTrip);
  if (socialPost) {
    cards.push({
      id: 'card-social-post',
      tripId,
      kind: 'media',
      priority: 'quiet',
      title: `${socialPost.socialProvider ?? 'Social'} post added to the trip`,
      subtitle: `${socialPost.socialAuthorHandle ?? socialPost.ownerName} · ${socialPost.location?.name ?? 'Trip social'}`,
      detail: socialPost.caption ?? 'A social post was linked back to the trip feed and can be used in the recap.',
      ctaLabel: 'Open media',
      relatedEntityId: socialPost.id,
      startsAt: socialPost.capturedAt,
      expiresAt: null,
      statusLabel: socialPost.eligibleForRecap ? 'recap ready' : 'linked',
    });
  }

  const recap = media.find((item) => item.mediaType === 'recap_video');
  if (recap) {
    cards.push({
      id: 'card-recap',
      tripId,
      kind: 'recap',
      priority: 'high',
      title: 'Your trip recap is ready',
      subtitle: 'Story export · saved in this trip',
      detail: 'A post-vacation film can be shared out, saved to your library, or used as the top memory inside this past trip.',
      ctaLabel: 'Watch recap',
      relatedEntityId: recap.id,
      startsAt: recap.uploadedAt,
      expiresAt: null,
      statusLabel: 'ready',
    });
  }

  const action = actions[0];
  if (action) {
    cards.push({
      id: 'card-action',
      tripId,
      kind: action.kind === 'payment' ? 'payment' : action.kind === 'document' ? 'document' : 'checklist',
      priority: action.kind === 'assist' ? 'urgent' : 'normal',
      title: action.title,
      subtitle: action.kind,
      detail: action.detail,
      ctaLabel: 'Handle',
      relatedEntityId: action.id,
      startsAt: null,
      expiresAt: action.dueAt,
      statusLabel: action.notificationState,
    });
  }

  return cards.sort((a, b) => {
    const weight = { urgent: 0, high: 1, normal: 2, quiet: 3 };
    return weight[a.priority] - weight[b.priority];
  });
}

export function respondToMockTripVote(tripId: string, voteId: string, optionId: string): TripVote {
  const vote = getMockTripVotes(tripId).find((item) => item.id === voteId);
  if (!vote) throw new Error('Vote not found');
  if (!vote.options.some((option) => option.id === optionId)) {
    throw new Error('Vote option not found');
  }

  roomState.voteResponses.set(key(tripId, voteId, DEV_USER_ID), optionId);
  return getMockTripVotes(tripId).find((item) => item.id === voteId)!;
}

export function updateMockTripActionItem(
  tripId: string,
  actionItemId: string,
  status: TripActionItemStatus,
): TripActionItem {
  const exists = getMockTripActionItems(tripId).some((item) => item.id === actionItemId);
  if (!exists) throw new Error('Action item not found');

  roomState.actionStatuses.set(key(tripId, actionItemId), status);
  return getMockTripActionItems(tripId).find((item) => item.id === actionItemId)!;
}

export function updateMockTripMediaApproval(
  tripId: string,
  mediaId: string,
  action: TripMediaApprovalAction,
): TripMediaItem {
  const exists = getMockTripMedia(tripId).items.some((item) => item.id === mediaId);
  if (!exists) throw new Error('Media item not found');

  roomState.mediaActions.set(key(tripId, mediaId), action);
  return getMockTripMedia(tripId).items.find((item) => item.id === mediaId)!;
}

export function updateMockTripParticipation(
  tripId: string,
  scheduleItemId: string,
  status: TripParticipationStatus,
): TripScheduleItem {
  const exists = getMockTripSchedule(tripId).some((item) => item.id === scheduleItemId);
  if (!exists) throw new Error('Schedule item not found');

  roomState.participationStatuses.set(key(tripId, scheduleItemId, DEV_USER_ID), status);
  return getMockTripSchedule(tripId).find((item) => item.id === scheduleItemId)!;
}

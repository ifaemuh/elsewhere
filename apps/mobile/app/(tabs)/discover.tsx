import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  PanResponder,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  type StyleProp,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEvent } from 'expo';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { SOCIAL_POP } from '@/components/AppHeader';
import { useHorizontalTabSwipe } from '@/hooks/useHorizontalTabSwipe';
import { api } from '@/services/api';
import { useCalendarSignals } from '@/hooks/useCalendarSignals';
import { useLocalDiscoveryContext } from '@/hooks/useLocalDiscoveryContext';
import { useReferencePhotos } from '@/hooks/useReferencePhotos';
import type {
  Destination,
  DiscoverAdminAction,
  DiscoverContentSource,
  DiscoverFeedItem,
  DiscoverFeedItemKind,
  DiscoverInteractivePrompt,
  DiscoverMediaMode,
  DiscoverMusicAttribution,
  DiscoverParticipant,
  DiscoverRightsStatus,
  DiscoverTripProposal,
  DiscoverTripValue,
  EditorialShort,
  SocialTripInviteCard,
  TravelDealSignal,
} from '@elsewhere/shared';
import { DEMO_MEDIA, getDemoDiscoverPersonalizedAsset, totalCost } from '@elsewhere/shared';

type PersonalizedCardSize = 'hero' | 'large' | 'standard' | 'compact';
type DetailBlockKind = 'story' | 'why_now' | 'build_around' | 'deal_terms' | 'stay_fit' | 'personal_reason';
type DiscoverFeedScope = 'here' | 'elsewhere' | 'both';
type DiscoverLayoutVariant =
  | 'sponsored_feature'
  | 'editorial_story'
  | 'cultural_video'
  | 'deal_compact'
  | 'personal_preview'
  | 'collection_rail';
type DiscoverMediaSource = 'pexels' | 'local' | 'ai' | 'partner' | 'google_places' | 'youtube' | 'social_link' | 'live_camera';

interface DiscoverDetailBlock {
  kind: DetailBlockKind;
  title: string;
  body: string;
}

interface PersonalizedDiscoveryCard {
  id: string;
  typeLabel: string;
  cardKind: DiscoverFeedItemKind | string;
  title: string;
  detail: string;
  sourceLine: string;
  destination: Destination | null;
  prompt: string;
  people: string[];
  mediaUrl?: string;
  mediaPosterUrl?: string;
  fallbackAllowed?: boolean;
  mediaAlt: string;
  size: PersonalizedCardSize;
  primaryCta: string;
  badge: string;
  feedScope?: DiscoverFeedScope;
  layoutVariant?: DiscoverLayoutVariant;
  mediaSource?: DiscoverMediaSource;
  locality?: {
    label: string;
    latitude?: number;
    longitude?: number;
  };
  locationOverride?: string;
  hook?: string;
  creatorLabel?: string;
  postType?: DiscoverFeedItem['postType'];
  primaryValueLabel?: string;
  priceBadgeLabel?: string;
  relevanceReason?: string;
  contentTopics?: string[];
  interactionStats?: DiscoverFeedItem['interactionStats'];
  mediaMode?: DiscoverMediaMode;
  rightsStatus?: DiscoverRightsStatus;
  music?: DiscoverMusicAttribution;
  participants?: DiscoverParticipant[];
  contentSources?: DiscoverContentSource[];
  tripValue?: DiscoverTripValue;
  tripProposal?: DiscoverTripProposal;
  assistWatchItems?: string[];
  interactivePrompt?: DiscoverInteractivePrompt;
  adminAction?: DiscoverAdminAction;
  primaryAction?: DiscoverFeedItem['primaryAction'];
  editorialShort?: EditorialShort;
  sponsored?: boolean;
  advertiserName?: string;
  targetingReason?: string;
  tripDetails: {
    dateWindow: string;
    estimatedPrice: string;
    bestFor: string;
    smartDates: string;
  };
  possibleEvents: Array<{
    title: string;
    detail: string;
    meta: string;
  }>;
  assistPromise: string;
  detailBlocks: DiscoverDetailBlock[];
  socialCard?: SocialTripInviteCard;
  deal?: TravelDealSignal;
  collectionItems?: Array<{
    id: string;
    title: string;
    detail: string;
    imageUrl?: string;
    curationPrompt: string;
  }>;
}

type BasePersonalizedDiscoveryCard = Omit<
  PersonalizedDiscoveryCard,
  'mediaAlt' | 'size' | 'tripDetails' | 'possibleEvents' | 'assistPromise' | 'detailBlocks'
>;

const GENERATED_PREVIEW_PATHS = [
  DEMO_MEDIA.discover.personalized.tokyoStill,
  DEMO_MEDIA.discover.personalized.baliStill,
  DEMO_MEDIA.discover.personalized.parisStill,
];

const GENERATED_GROUP_PREVIEW_PATHS = [
  DEMO_MEDIA.discover.personalized.tokyoGroupStill,
  DEMO_MEDIA.discover.personalized.baliGroupStill,
  DEMO_MEDIA.discover.personalized.parisGroupStill,
];

const FRIEND_AVATAR_PATHS = [
  DEMO_MEDIA.discover.friendAvatars.mia,
  DEMO_MEDIA.discover.friendAvatars.alex,
  DEMO_MEDIA.discover.friendAvatars.jordan,
  DEMO_MEDIA.discover.friendAvatars.taylor,
  DEMO_MEDIA.discover.friendAvatars.sam,
];

const EDITORIAL_ASSET_PATHS = Object.values(DEMO_MEDIA.discover.editorial);
const MEDIA_CACHE_VERSION = 'elsewhere-discover-rewrite-20260501a';

function dailyDiscoverSeed(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}:discover-feed`;
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

function seededShuffle<T extends { id: string }>(items: T[], seed: string): T[] {
  const shuffled = [...items];
  const random = seededRandom(hashSeed(seed));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function orderDiscoverCards<T extends BasePersonalizedDiscoveryCard>(cards: T[]): T[] {
  const sponsored = cards.filter((card) => card.sponsored);
  const firstSponsored = sponsored[0];
  if (!firstSponsored) return seededShuffle(cards, dailyDiscoverSeed());

  const remaining = cards.filter((card) => card.id !== firstSponsored.id);
  const contentCards = seededShuffle(
    remaining.filter((card) =>
      !card.sponsored &&
      (
        card.cardKind === 'editorial_short' ||
        card.cardKind === 'interactive_prompt' ||
        card.cardKind === 'unique_stay' ||
        card.cardKind === 'cultural_video' ||
        card.cardKind === 'live_view' ||
        card.postType === 'destination_short' ||
        card.postType === 'hotel_reveal'
      ),
    ),
    `${dailyDiscoverSeed()}:content`,
  );
  const utilityCards = seededShuffle(
    remaining.filter((card) => !contentCards.some((contentCard) => contentCard.id === card.id)),
    `${dailyDiscoverSeed()}:utility`,
  );
  const ordered = [firstSponsored];
  let contentRun = 0;

  while (contentCards.length || utilityCards.length) {
    if (contentCards.length && (contentRun < 4 || !utilityCards.length)) {
      ordered.push(contentCards.shift()!);
      contentRun += 1;
    } else if (utilityCards.length) {
      ordered.push(utilityCards.shift()!);
      contentRun = 0;
    }
  }

  return ordered;
}

function assetUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${api.baseUrl}${path}${separator}v=${MEDIA_CACHE_VERSION}`;
}

function isVideoUrl(path: string | undefined): boolean {
  return Boolean(path?.toLowerCase().endsWith('.mp4'));
}

function personalizedStillForDestination(
  destinationName: string | undefined,
  fallbackIndex: number,
  participantCount = 1,
): string {
  const previewPaths = participantCount > 1 ? GENERATED_GROUP_PREVIEW_PATHS : GENERATED_PREVIEW_PATHS;
  const normalized = destinationName?.toLowerCase() ?? '';
  if (normalized.includes('tokyo') || normalized.includes('japan') || normalized.includes('kyoto')) return previewPaths[0];
  if (normalized.includes('bali')) return previewPaths[1];
  if (normalized.includes('paris')) return previewPaths[2];
  return previewPaths[fallbackIndex % previewPaths.length];
}

function personalizedVideoForDestination(destinationName: string | undefined): string {
  return getDemoDiscoverPersonalizedAsset(destinationName).mediaUrl;
}

function editorialAssetForDestination(destinationName: string | undefined, fallbackIndex: number): string {
  const normalized = destinationName?.toLowerCase() ?? '';
  if (normalized.includes('tokyo') || normalized.includes('japan') || normalized.includes('kyoto')) {
    return DEMO_MEDIA.discover.editorial.kyotoSpringFestival;
  }
  if (normalized.includes('bali')) return DEMO_MEDIA.discover.editorial.baliRiceTerraces;
  if (normalized.includes('paris')) return DEMO_MEDIA.discover.editorial.parisLeftBank;
  if (normalized.includes('santorini') || normalized.includes('greece')) return DEMO_MEDIA.discover.editorial.santoriniCyclades;
  if (normalized.includes('marrakech')) return DEMO_MEDIA.discover.editorial.marrakechRiad;
  if (normalized.includes('iceland')) return DEMO_MEDIA.discover.editorial.icelandBlueHour;
  if (normalized.includes('mexico')) return DEMO_MEDIA.discover.editorial.mexicoCityFood;
  return EDITORIAL_ASSET_PATHS[fallbackIndex % EDITORIAL_ASSET_PATHS.length];
}

function isPersonalCardKind(cardKind: string): boolean {
  return cardKind === 'personal_preview' ||
    cardKind === 'personal_trip_ad' ||
    cardKind === 'personal_deal' ||
    cardKind === 'occasion';
}

function isEditorialCardKind(cardKind: string): boolean {
  return !isPersonalCardKind(cardKind);
}

function isDealCardKind(cardKind: string): boolean {
  return cardKind === 'deal';
}

function primaryCtaLabel(card: Pick<PersonalizedDiscoveryCard, 'cardKind' | 'primaryCta'>): string {
  if (card.cardKind === 'occasion') return 'View';
  if (/curate|build/i.test(card.primaryCta)) return 'Plan';
  return card.primaryCta;
}

function cardTypeLabel(card: Pick<PersonalizedDiscoveryCard, 'cardKind' | 'typeLabel'>): string {
  if (card.cardKind === 'editorial_short') return 'Short';
  if (card.cardKind === 'cultural_video') return 'Culture';
  if (card.cardKind === 'unique_stay') return 'Stay';
  if (card.cardKind === 'collection_rail') return 'Collection';
  if (card.cardKind === 'deal') return 'Deal';
  if (card.cardKind === 'personal_deal') return 'Personal';
  if (card.cardKind === 'personal_trip_ad') return 'Personal';
  if (card.cardKind === 'interactive_prompt') return 'Question';
  if (card.cardKind === 'assist_alert') return 'Assist';
  if (card.cardKind === 'travel_admin') return 'Admin';
  if (card.cardKind === 'occasion') return 'Occasion';
  if (card.cardKind === 'personal_preview') return 'Personal';
  if (card.cardKind === 'live_view') return 'Live';
  if (card.cardKind === 'social_link') return 'Saved';
  if (card.cardKind === 'sponsored' || card.cardKind === 'sponsored_native') {
    const label = card.typeLabel.toLowerCase();
    if (label.includes('local')) return 'Local';
    if (label.includes('stay') || label.includes('hotel')) return 'Stay';
    if (label.includes('deal')) return 'Deal';
    if (label.includes('occasion')) return 'Occasion';
  }
  return 'Editorial';
}

function layoutVariantForCard(card: PersonalizedDiscoveryCard): DiscoverLayoutVariant {
  if (card.layoutVariant) return card.layoutVariant;
  if (card.sponsored) return 'sponsored_feature';
  if (card.cardKind === 'editorial_short') return 'cultural_video';
  if (card.cardKind === 'cultural_video') return 'cultural_video';
  if (card.cardKind === 'deal') return 'deal_compact';
  if (card.cardKind === 'collection_rail') return 'collection_rail';
  if (isPersonalCardKind(card.cardKind)) return 'personal_preview';
  return 'editorial_story';
}

function cleanLocationName(...values: Array<string | undefined | null>): string {
  const joined = values.filter(Boolean).join(' ').toLowerCase();
  const knownPlaces = [
    ['anaheim', 'Anaheim'],
    ['southern california', 'Southern California'],
    ['los angeles', 'Los Angeles'],
    ['mexico city', 'Mexico City'],
    ['santorini', 'Santorini'],
    ['marrakech', 'Marrakech'],
    ['iceland', 'Iceland'],
    ['kyoto', 'Kyoto'],
    ['tokyo', 'Tokyo'],
    ['paris', 'Paris'],
    ['bali', 'Bali'],
    ['lisbon', 'Lisbon'],
    ['seoul', 'Seoul'],
    ['amalfi', 'Amalfi Coast'],
    ['peru', 'Peru'],
  ] as const;

  return knownPlaces.find(([token]) => joined.includes(token))?.[1] ?? values.find(Boolean) ?? 'Elsewhere';
}

function locationLabel(card: Pick<PersonalizedDiscoveryCard, 'destination' | 'title' | 'deal' | 'locationOverride'>): string {
  if (card.locationOverride) return card.locationOverride;
  return cleanLocationName(card.title, card.deal?.destination, card.destination?.name, card.destination?.country);
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function projectedDateLabel(card: PersonalizedDiscoveryCard): string | null {
  if (card.deal?.travelWindowStart && card.deal.travelWindowEnd) {
    return `${formatShortDate(card.deal.travelWindowStart)} - ${formatShortDate(card.deal.travelWindowEnd)}`;
  }

  const searchable = `${card.title} ${card.detail} ${card.sourceLine} ${card.targetingReason ?? ''}`.toLowerCase();
  if (searchable.includes('late-may') || searchable.includes('late may')) return 'Late May - early June';
  if (searchable.includes('may and september')) return 'May or September';
  if (searchable.includes('birthday')) return 'Birthday week';
  if (searchable.includes('anniversary')) return 'Anniversary window';
  if (searchable.includes('soft-launch weekend') || searchable.includes('flexible weekend')) return 'Flexible weekends';
  if (searchable.includes('long-weekend') || searchable.includes('long weekend')) return 'Long weekend';
  if (searchable.includes('shoulder season')) return 'Shoulder season';

  return card.tripDetails.dateWindow === 'Next smart opening' ? null : card.tripDetails.dateWindow;
}

function valueLabel(card: Pick<PersonalizedDiscoveryCard, 'primaryValueLabel' | 'tripValue' | 'tripDetails'>): string | null {
  return card.primaryValueLabel ?? card.tripValue?.label ?? card.tripDetails.estimatedPrice ?? null;
}

function priceBadgeLabel(card: PersonalizedDiscoveryCard): string | null {
  if (card.priceBadgeLabel) return card.priceBadgeLabel;
  if (card.cardKind === 'personal_deal' || card.cardKind === 'deal' || card.sponsored) {
    return card.primaryValueLabel ?? card.tripValue?.label ?? null;
  }
  if (card.cardKind === 'assist_alert') return card.primaryValueLabel ?? null;
  return null;
}

function compactPriceLabel(label: string): string {
  return label
    .replace(/^from\s+/i, '')
    .replace(/\s+protected$/i, '')
    .replace(/^([A-Za-z]+)\s+from\s+/i, '')
    .trim();
}

function preferenceSignature(card: PersonalizedDiscoveryCard): string[] {
  return [
    card.cardKind,
    card.postType ?? '',
    locationLabel(card).toLowerCase(),
    ...(card.contentTopics ?? []),
    ...card.people,
  ].filter(Boolean).map((value) => value.toLowerCase());
}

function rankedDiscoverCards(cards: PersonalizedDiscoveryCard[], likedCards: Record<string, string[]>): PersonalizedDiscoveryCard[] {
  const likedTokens = Object.values(likedCards).flat();
  if (!likedTokens.length) return cards;

  const [first, ...rest] = cards;
  const sorted = [...rest].sort((a, b) => {
    const score = (card: PersonalizedDiscoveryCard) => {
      const signature = preferenceSignature(card);
      const affinity = signature.reduce((sum, token) => sum + likedTokens.filter((likedToken) => likedToken === token).length, 0);
      return affinity + (card.interactionStats?.likes ?? 0) / 100000;
    };
    return score(b) - score(a);
  });
  return first ? [first, ...sorted] : sorted;
}

function destinationMatch(destinations: Destination[], hint: string): Destination | null {
  return destinations.find((destination) =>
    destination.name.toLowerCase().includes(hint.toLowerCase()) ||
    destination.country.toLowerCase().includes(hint.toLowerCase()),
  ) ?? destinations[0] ?? null;
}

function mediaSourceKind(source: DiscoverContentSource | undefined): DiscoverMediaSource {
  if (!source) return 'local';
  if (source.kind === 'ai_generated') return 'ai';
  if (source.kind === 'local_demo') return 'local';
  return source.kind;
}

function layoutVariantFromFeedItem(item: DiscoverFeedItem): DiscoverLayoutVariant {
  if (item.collection) return 'collection_rail';
  if (item.kind === 'deal') return 'deal_compact';
  if (item.kind === 'personal_preview' || item.kind === 'personal_trip_ad' || item.kind === 'personal_deal' || item.kind === 'occasion') {
    return 'personal_preview';
  }
  if (item.kind === 'editorial_short' || item.kind === 'cultural_video') return 'cultural_video';
  if (item.sponsored || item.kind === 'sponsored' || item.kind === 'sponsored_native') return 'sponsored_feature';
  return 'editorial_story';
}

function cardFromFeedItem(item: DiscoverFeedItem, destinations: Destination[]): BasePersonalizedDiscoveryCard {
  const destination = item.curationAction.destinationName
    ? destinationMatch(destinations, item.curationAction.destinationName)
    : null;

  return {
    id: item.id,
    typeLabel: cardTypeLabel({ cardKind: item.kind, typeLabel: item.kind }),
    cardKind: item.kind,
    title: item.title,
    detail: item.detail,
    sourceLine: item.sourceLine,
    destination,
    prompt: item.curationAction.prompt,
    people: isPersonalCardKind(item.kind)
      ? (item.participants?.map((participant) => participant.name) ?? ['You', 'Mia', 'Alex'])
      : [],
    mediaUrl: item.mediaUrl,
    mediaPosterUrl: item.mediaPosterUrl,
    primaryCta: item.curationAction.label,
    badge: item.sponsored ? 'Sponsored' : item.primaryValueLabel ?? cardTypeLabel({ cardKind: item.kind, typeLabel: item.kind }),
    feedScope: item.feedScope,
    layoutVariant: layoutVariantFromFeedItem(item),
    mediaSource: mediaSourceKind(item.contentSources?.[0]),
    locationOverride: item.locationLabel,
    hook: item.hook,
    creatorLabel: item.creatorLabel,
    postType: item.postType,
    primaryValueLabel: item.primaryValueLabel,
    priceBadgeLabel: item.priceBadgeLabel,
    relevanceReason: item.relevanceReason,
    contentTopics: item.contentTopics,
    interactionStats: item.interactionStats,
    mediaMode: item.mediaMode,
    rightsStatus: item.rightsStatus,
    music: item.music,
    participants: item.participants,
    contentSources: item.contentSources,
    tripValue: item.tripValue,
    tripProposal: item.tripProposal,
    assistWatchItems: item.assistWatchItems,
    interactivePrompt: item.interactivePrompt,
    adminAction: item.adminAction,
    primaryAction: item.primaryAction,
    editorialShort: item.editorialShort,
    sponsored: item.sponsored,
    advertiserName: item.advertiserName,
    targetingReason: item.targetingReason,
    collectionItems: item.collection?.items,
  };
}

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function friendAvatarForName(name: string, fallbackIndex: number): string | null {
  const normalized = name.trim().toLowerCase();
  if (normalized === 'you') return DEMO_MEDIA.discover.friendAvatars.you;
  if (normalized.includes('mia')) return DEMO_MEDIA.discover.friendAvatars.mia;
  if (normalized.includes('alex')) return DEMO_MEDIA.discover.friendAvatars.alex;
  if (normalized.includes('jordan')) return DEMO_MEDIA.discover.friendAvatars.jordan;
  if (normalized.includes('taylor')) return DEMO_MEDIA.discover.friendAvatars.taylor;
  if (normalized.includes('sam')) return DEMO_MEDIA.discover.friendAvatars.sam;

  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = Math.imul(hash ^ name.charCodeAt(index), 31);
  }
  return FRIEND_AVATAR_PATHS[Math.abs(hash || fallbackIndex) % FRIEND_AVATAR_PATHS.length];
}

function musicLabel(card: Pick<PersonalizedDiscoveryCard, 'music' | 'mediaMode' | 'rightsStatus' | 'creatorLabel' | 'sourceLine'>): string {
  const track = card.music?.title ?? 'Elsewhere Drift';
  const genre = card.music?.genre ?? 'chill hop';
  const source = card.music?.artistOrLibrary ?? 'Elsewhere Sound Library';
  const rights = card.rightsStatus === 'embed_only' ? 'embed only' : source;
  return `${card.creatorLabel ?? card.sourceLine.split('·')[0].trim()} · ${track} · ${genre} · ${rights}`;
}

function readinessLabel(value: SocialTripInviteCard['previewReadiness']): string {
  if (value === 'ready') return 'Group media ready';
  if (value === 'needs_friend_consent') return 'Needs friend consent';
  return 'Needs reference photos';
}

function buildPossibleEvents(destination: Destination | null, cardKind: string) {
  const place = destination?.name ?? 'the destination';
  if (cardKind.includes('birthday')) {
    return [
      { title: 'Private dinner slot', detail: `A birthday dinner idea near the best first-night neighborhood in ${place}.`, meta: 'Vote-ready · bookable later' },
      { title: 'Golden hour photo stop', detail: 'A low-effort moment for the group before dinner.', meta: 'Free · 45 min' },
      { title: 'Late-night dessert or music', detail: 'A flexible option for whoever still has energy.', meta: 'Split group friendly' },
    ];
  }
  if (cardKind.includes('fare')) {
    return [
      { title: 'Price-protected flight window', detail: 'Watch this fare while Elsewhere checks if better dates appear.', meta: 'Assist monitored' },
      { title: `First-night walk in ${place}`, detail: 'A simple arrival plan that works even if flights shift.', meta: 'Low risk' },
      { title: 'Bookable local experience', detail: 'A cancellable activity to anchor the trip without locking the group too early.', meta: 'Free-cancel preferred' },
    ];
  }
  return [
    { title: `Arrival evening in ${place}`, detail: 'A calm first-night plan near the hotel or best transit area.', meta: '2-3 hours' },
    { title: 'Signature local experience', detail: 'A high-confidence activity that can become the emotional center of the trip.', meta: 'Vote-ready' },
    { title: 'Open afternoon', detail: 'A flexible block where the group can split, rest, or join later.', meta: 'Join-later friendly' },
  ];
}

function buildDetailBlocks(card: BasePersonalizedDiscoveryCard): DiscoverDetailBlock[] {
  if (card.cardKind === 'interactive_prompt') {
    return [
      {
        kind: 'story',
        title: card.interactivePrompt?.contextLabel ?? 'Interactive travel short',
        body: card.detail,
      },
      {
        kind: 'build_around',
        title: 'Why this is useful',
        body: 'Elsewhere uses curiosity as the hook, then turns the answer into timing, local context, activities, and a trip plan you can actually watch or book.',
      },
    ];
  }

  if (card.cardKind === 'assist_alert') {
    return [
      {
        kind: 'why_now',
        title: 'Why it surfaced',
        body: card.detail,
      },
      {
        kind: 'build_around',
        title: 'Assist monitor',
        body: card.assistWatchItems?.join(' ') ?? 'Assist is watching itinerary risk, price movement, policy windows, and group impact.',
      },
    ];
  }

  if (card.cardKind === 'travel_admin') {
    return [
      {
        kind: 'why_now',
        title: card.adminAction?.statusLabel ?? 'Travel admin',
        body: card.detail,
      },
      {
        kind: 'build_around',
        title: 'Next action',
        body: card.adminAction
          ? `${card.adminAction.actionLabel}. ${card.adminAction.deadlineLabel}.`
          : 'Open profile travel admin before booking hard-to-change travel.',
      },
    ];
  }

  if (card.cardKind === 'deal') {
    return [
      {
        kind: 'deal_terms',
        title: 'What Elsewhere is watching',
        body: `${card.deal?.origin ?? 'Your airport'} to ${card.deal?.destination ?? card.destination?.name ?? 'this route'} at ${card.deal?.priceAmount ? `$${card.deal.priceAmount}` : 'a watched fare'}. Elsewhere keeps this as an alert until price, dates, and fare rules are verified through an official booking source.`,
      },
      {
        kind: 'why_now',
        title: 'Why it matters now',
        body: card.deal?.bookingWindowEndsAt
          ? 'The booking window is short, so Assist tracks nearby airports and date shifts before this disappears.'
          : 'This is early signal, useful for watching prices before turning it into a recommendation.',
      },
    ];
  }

  if (card.sponsored) {
    return [
      {
        kind: 'stay_fit',
        title: 'Offer shape',
        body: `${card.detail} Elsewhere shows this because it matches timing, trip style, and bookable partner inventory without forcing a checkout decision in the feed.`,
      },
      {
        kind: 'build_around',
        title: 'Build around it',
        body: card.prompt,
      },
    ];
  }

  if (card.cardKind === 'personal_preview' || card.cardKind === 'occasion') {
    return [
      {
        kind: 'personal_reason',
        title: 'Why this surfaced',
        body: card.socialCard
          ? 'This trip idea is matched to close-friend context, invite readiness, and the people most likely to say yes.'
          : 'This trip idea is matched to your saved reference photos, calendar openings, and destination interests.',
      },
      {
        kind: 'build_around',
        title: 'What Elsewhere can do next',
        body: 'Watch prices, suggest smart dates, invite the group, and turn this into a bookable trip plan when you are ready.',
      },
    ];
  }

  if (card.cardKind === 'unique_stay') {
    return [
      {
        kind: 'story',
        title: 'The stay',
        body: card.detail,
      },
      {
        kind: 'stay_fit',
        title: 'Trip fit',
        body: 'Best for travelers who want the lodging to be part of the story, with enough structure for arrivals, reservations, and downtime.',
      },
    ];
  }

  if (card.cardKind === 'cultural_video') {
    return [
      {
        kind: 'story',
        title: 'What the film is showing',
        body: card.detail,
      },
      {
        kind: 'why_now',
        title: 'How to experience it well',
        body: 'Go early, keep the pacing slow, respect local etiquette, and build the day around one strong cultural moment instead of stacking too much.',
      },
    ];
  }

  return [
    {
      kind: 'story',
      title: 'The place',
      body: card.detail,
    },
    {
      kind: 'why_now',
      title: 'Why go',
      body: 'This is the kind of place that can anchor a trip by itself: one visual moment, one local rhythm, and enough texture to shape a full itinerary.',
    },
    {
      kind: 'build_around',
      title: 'What to build around',
      body: card.prompt,
    },
  ];
}

function enrichCard(
  card: BasePersonalizedDiscoveryCard,
  index: number,
): PersonalizedDiscoveryCard {
  const personalAsset = isPersonalCardKind(card.cardKind)
    ? {
        mediaUrl: personalizedVideoForDestination(card.destination?.name),
        posterUrl: personalizedStillForDestination(card.destination?.name, index, card.people.length),
      }
    : null;
  const price = card.primaryValueLabel ??
    card.tripValue?.label ??
    (card.deal?.priceAmount
    ? `$${card.deal.priceAmount}`
    : card.destination
      ? `from $${totalCost(card.destination).toLocaleString()}`
      : 'watching prices');
  const dateWindow = card.cardKind.includes('anniversary')
    ? 'Around your anniversary'
    : card.cardKind.includes('birthday')
      ? 'Birthday week'
      : card.cardKind.includes('pto')
        ? 'Best PTO window'
        : card.cardKind.includes('fare')
          ? 'Book-window sensitive'
          : 'Next smart opening';

  return {
    ...card,
    mediaUrl: card.mediaUrl ??
      (personalAsset
        ? personalAsset.mediaUrl
        : editorialAssetForDestination(card.destination?.name ?? card.title, index)),
    mediaPosterUrl: card.mediaPosterUrl ?? personalAsset?.posterUrl,
    fallbackAllowed: card.fallbackAllowed ?? false,
    mediaAlt: `${isEditorialCardKind(card.cardKind) ? 'Editorial destination media' : 'Personal travel media'} for ${card.title}`,
    size: card.sponsored ? 'hero' : index % 5 === 2 ? 'large' : index % 5 === 4 ? 'compact' : 'standard',
    tripDetails: {
      dateWindow,
      estimatedPrice: price,
      bestFor: card.people.length > 1 && isPersonalCardKind(card.cardKind)
        ? `${card.people.slice(0, 3).join(', ')}`
        : card.destination?.name ?? 'A flexible escape',
      smartDates: card.cardKind.includes('fare')
        ? 'Watched against nearby airports, date shifts, and fare-rule changes.'
        : 'Matched to shoulder seasons, long weekends, and flexible calendar windows.',
    },
    possibleEvents: buildPossibleEvents(card.destination, card.cardKind),
    assistPromise: 'Watch this idea and Assist will monitor price drops, better dates, booking windows, and policy-sensitive changes before you commit.',
    detailBlocks: buildDetailBlocks(card),
  };
}

export default function DiscoverScreen() {
  const router = useRouter();
  const tabSwipeHandlers = useHorizontalTabSwipe('discover');
  const queryClient = useQueryClient();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [selectedCard, setSelectedCard] = useState<PersonalizedDiscoveryCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchedCardIds, setWatchedCardIds] = useState<Set<string>>(() => new Set());
  const [savedCardIds, setSavedCardIds] = useState<Set<string>>(() => new Set());
  const [likedCards, setLikedCards] = useState<Record<string, string[]>>({});
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const [interactiveAnswers, setInteractiveAnswers] = useState<Record<string, string>>({});
  const [revealedPromptIds, setRevealedPromptIds] = useState<Set<string>>(() => new Set());
  const { photos, error: photosError } = useReferencePhotos();
  const calendar = useCalendarSignals();
  const localDiscovery = useLocalDiscoveryContext();

  const { error: healthError } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    retry: 1,
  });

  const { data: destinations, isLoading, error: destinationsError } = useQuery({
    queryKey: ['destinations', 'featured'],
    queryFn: () => api.getFeaturedDestinations(),
  });

  const { data: socialGraph } = useQuery({
    queryKey: ['social', 'graph', 'close'],
    queryFn: () => api.getSocialGraph('close'),
  });

  const { data: discoverFeed } = useQuery({
    queryKey: ['discover', 'feed', 'main'],
    queryFn: () => api.getDiscoverFeed('both'),
    retry: 1,
  });

  const detailSwipeResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (event, gesture) => (
        event.nativeEvent.pageX <= 36 &&
        gesture.dx > 14 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35
      ),
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx > 82 && Math.abs(gesture.dy) < 70) {
          setSelectedCard(null);
        }
      },
    }),
    [],
  );

  const referencePhotosForGeneration = photos.slice(0, 3);

  const closeFriendMutation = useMutation({
    mutationFn: ({ personId, closeFriend }: { personId: string; closeFriend: boolean }) =>
      api.updateSocialCloseFriend(personId, closeFriend),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social', 'graph'] });
    },
  });

  const cardActionMutation = useMutation({
    mutationFn: ({ cardId, watch, saved }: { cardId: string; watch: boolean; saved: boolean }) =>
      api.watchDiscoverCard(cardId, { watch, saved }),
    onSuccess: (result) => {
      if (result.watched) {
        setWatchedCardIds((current) => new Set([...current, result.cardId]));
      }
      if (result.saved) {
        setSavedCardIds((current) => new Set([...current, result.cardId]));
      }
    },
    onError: (err) => setError((err as Error).message),
  });

  const destinationList = destinations ?? [];
  const closeFriendNames = socialGraph?.closeFriends.map((person) => person.displayName).slice(0, 2) ?? [];
  const defaultPeople = ['You', ...closeFriendNames].slice(0, 3);

  const feedCardsByScope = useMemo<Record<'here' | 'elsewhere', PersonalizedDiscoveryCard[]>>(() => {
    const tokyo = destinationMatch(destinationList, 'Tokyo');
    const paris = destinationMatch(destinationList, 'Paris');
    const bali = destinationMatch(destinationList, 'Bali');
    const santorini = destinationMatch(destinationList, 'Santorini');
    const people = defaultPeople.length ? defaultPeople : ['You'];
    const cards: BasePersonalizedDiscoveryCard[] = [];

    cards.push({
      id: 'sponsored-anaheim-theme-park',
      typeLabel: 'Sponsored local',
      cardKind: 'sponsored',
      title: 'Anaheim after dark',
      detail: 'A low-lift theme-park weekend with one late-night ride block, a hotel within shuttle range, and a next-morning pool reset.',
      sourceLine: `${localDiscovery.usingFallbackMarket ? 'Local demo' : 'Near you'} · Anaheim weekend · family and friends`,
      destination: null,
      prompt: 'Plan a Southern California theme-park weekend near Anaheim with one park day, a nearby hotel, flexible arrival timing, and easy group payments.',
      people: [],
      mediaUrl: DEMO_MEDIA.discover.editorial.anaheimThemePark,
      mediaPosterUrl: DEMO_MEDIA.discover.editorial.anaheimThemePark,
      primaryCta: 'Plan',
      badge: 'Sponsored',
      sponsored: true,
      advertiserName: 'Anaheim stay partner',
      targetingReason: `Shown for ${localDiscovery.marketLabel} as a nearby weekend idea.`,
      feedScope: 'here',
      layoutVariant: 'sponsored_feature',
      mediaSource: 'pexels',
      locality: {
        label: 'Anaheim / Southern California',
        latitude: 33.8366,
        longitude: -117.9143,
      },
    });

    cards.push(
      {
        id: 'here-socal-coast',
        typeLabel: 'Weekend edit',
        cardKind: 'editorial',
        title: 'A coastal reset without the airport',
        detail: 'Leave after breakfast, make one beach stop, book a sunset dinner, and let the schedule stay loose enough for traffic.',
        sourceLine: `${localDiscovery.marketLabel} · driveable weekend · real local media`,
        destination: null,
        prompt: 'Plan a Southern California coastal weekend with beach time, one strong dinner, a relaxed hotel, and flexible drive timing.',
        people: [],
        mediaUrl: DEMO_MEDIA.discover.editorial.socalBeachWeekend,
        mediaPosterUrl: DEMO_MEDIA.discover.editorial.socalBeachWeekend,
        primaryCta: 'Plan',
        badge: 'Here',
        feedScope: 'here',
        layoutVariant: 'editorial_story',
        mediaSource: 'pexels',
        locality: { label: 'Southern California coast' },
      },
      {
        id: 'here-la-dinner-window',
        typeLabel: 'Local table',
        cardKind: 'unique_stay',
        title: 'Dinner-first night in Los Angeles',
        detail: 'A restaurant-led evening where Elsewhere watches reservation timing, rideshare distance, and a late checkout nearby.',
        sourceLine: 'Los Angeles · date-night friendly · bookable later',
        destination: null,
        prompt: 'Plan a Los Angeles dinner-first overnight with a restaurant anchor, nearby stay, rideshare-friendly timing, and a next-morning coffee stop.',
        people: [],
        mediaUrl: DEMO_MEDIA.discover.editorial.laDinnerPatio,
        mediaPosterUrl: DEMO_MEDIA.discover.editorial.laDinnerPatio,
        primaryCta: 'Plan',
        badge: 'Local',
        feedScope: 'here',
        layoutVariant: 'editorial_story',
        mediaSource: 'pexels',
        locality: { label: 'Los Angeles' },
      },
    );

    if (tokyo) {
      cards.push({
        id: 'sponsored-kyoto',
        typeLabel: 'Sponsored stay',
        cardKind: 'sponsored',
        title: 'A ryokan weekend outside Tokyo',
        detail: 'Two nights of cedar baths, lantern dinners, and a quiet rail route from the city. Select late-May and early-June dates have preferred availability.',
        sourceLine: 'Elsewhere Select · Nikko and Hakone · flexible rail access',
        destination: tokyo,
        prompt: 'Curate a long-weekend Japan trip around a ryokan stay, direct rail from Tokyo, onsen time, a quiet dinner, and one low-stress city night.',
        people: [],
        mediaUrl: DEMO_MEDIA.discover.editorial.ryokanWeekend,
        mediaPosterUrl: DEMO_MEDIA.discover.editorial.ryokanWeekend,
        primaryCta: 'Plan',
        badge: 'Sponsored',
        sponsored: true,
        advertiserName: 'Japan ryokan partner',
        targetingReason: 'Matched to long-weekend timing and flexible rail-first planning.',
        feedScope: 'elsewhere',
        layoutVariant: 'sponsored_feature',
        mediaSource: 'local',
      });
    }

    if (paris) {
      cards.push({
        id: 'sponsored-paris-stay',
        typeLabel: 'Sponsored hotel',
        cardKind: 'sponsored',
        title: 'Paris in three slow mornings',
        detail: 'Left Bank hotel credit, market breakfasts, Seine walks, and late checkout. Best for anniversaries, first Paris trips, and soft-launch weekends.',
        sourceLine: 'Boutique stay partner · Left Bank · breakfast credit',
        destination: paris,
        prompt: 'Curate a Paris trip around a Left Bank boutique stay, breakfast credit, museum timing, relaxed walks, and one reservation-worthy dinner.',
        people: [],
        mediaUrl: DEMO_MEDIA.discover.editorial.parisLeftBank,
        mediaPosterUrl: DEMO_MEDIA.discover.editorial.parisLeftBank,
        primaryCta: 'Plan',
        badge: 'Sponsored',
        sponsored: true,
        advertiserName: 'Boutique stay partner',
        targetingReason: 'Shown because flexible weekend windows and occasion trips fit this offer.',
        feedScope: 'elsewhere',
        layoutVariant: 'sponsored_feature',
        mediaSource: 'local',
      });
    }

    const editorialDestination = santorini ?? bali ?? paris ?? tokyo;
    if (editorialDestination) {
      cards.push({
        id: 'editorial-places-that-feel-unreal',
        typeLabel: 'Place to know',
        cardKind: 'editorial',
        title: 'Santorini without the cruise-hour crush',
        detail: 'Caldera walks before 9 AM, a Pyrgos dinner, one boat day, and a quiet cave stay above the water.',
        sourceLine: 'Editorial · Cyclades timing · May and September sweet spot',
        destination: editorialDestination,
        prompt: `Curate a trip inspired by the most beautiful and culturally interesting parts of ${editorialDestination.name}. Include one iconic moment, one local food experience, one slower hidden-gem block, and smart dates.`,
        people: [],
        mediaUrl: EDITORIAL_ASSET_PATHS[2],
        primaryCta: 'Plan',
        badge: 'Inspiration',
        feedScope: 'elsewhere',
        layoutVariant: 'editorial_story',
        mediaSource: 'local',
      });
    }

    if (bali) {
      cards.push({
        id: 'cultural-video-bali-morning',
        typeLabel: 'Cultural video',
        cardKind: 'cultural_video',
        title: 'Bali before breakfast',
        detail: 'Rice terraces at first light, temple etiquette, kopi, and a late surf window. A slower Bali built around mornings.',
        sourceLine: 'Culture · nature · food · video-style guide',
        destination: bali,
        prompt: 'Curate a Bali trip around early mornings, rice terraces, temples, local food, surf time, and rest days. Prefer thoughtful pacing over tourist overload.',
        people: [],
        mediaUrl: DEMO_MEDIA.discover.personalized.baliVideo,
        mediaPosterUrl: DEMO_MEDIA.discover.editorial.baliRiceTerraces,
        primaryCta: 'Plan',
        badge: 'Video',
        feedScope: 'elsewhere',
        layoutVariant: 'cultural_video',
        mediaSource: 'ai',
      });
    }

    cards.push(
      {
        id: 'unique-stay-marrakech-riad',
        typeLabel: 'Unique stay',
        cardKind: 'unique_stay',
        title: 'Sleep inside a riad courtyard',
        detail: 'A three-night Marrakech stay with mint tea at arrival, a guided souk morning, rooftop dinners, and a desert-day option kept optional.',
        sourceLine: 'Unique stays · Marrakech · small-group friendly',
        destination: paris ?? editorialDestination,
        prompt: 'Curate a Marrakech trip around a riad stay, souk timing, rooftop dinners, one guided cultural day, and enough downtime.',
        people: [],
        mediaUrl: EDITORIAL_ASSET_PATHS[4],
        primaryCta: 'Plan',
        badge: 'Stay',
      },
      {
        id: 'nature-iceland-blue-hour',
        typeLabel: 'Nature loop',
        cardKind: 'editorial',
        title: 'Iceland at blue hour',
        detail: 'Thermal water, black sand, roadside waterfalls, and a compact loop that leaves space for weather shifts.',
        sourceLine: 'Nature · weather-aware routing · shoulder season',
        destination: editorialDestination,
        prompt: 'Curate a weather-aware Iceland trip around thermal water, black-sand beaches, waterfalls, short drives, and flexible day swaps.',
        people: [],
        mediaUrl: EDITORIAL_ASSET_PATHS[5],
        primaryCta: 'Plan',
        badge: 'Nature',
      },
      {
        id: 'food-cdmx-weekend',
        typeLabel: 'Food weekend',
        cardKind: 'editorial',
        title: 'Mexico City by the bite',
        detail: 'Tacos before noon, design shops in Roma Norte, a museum block, late lunch reservations, and one night market wander.',
        sourceLine: 'Food · culture · long-weekend fit',
        destination: editorialDestination,
        prompt: 'Curate a Mexico City food weekend with neighborhood routing, reservations, museums, and one flexible night-market plan.',
        people: [],
        mediaUrl: EDITORIAL_ASSET_PATHS[6],
        primaryCta: 'Plan',
        badge: 'Food',
      },
    );

    cards.push({
      id: 'rail-places-that-look-fake',
      typeLabel: 'Collection',
      cardKind: 'collection_rail',
      title: 'Places that look fake but are real',
      detail: 'Swipe through the collection, save a spark, then let Elsewhere turn it into a real trip shape.',
      sourceLine: 'Collection rail · editorial inspiration',
      destination: editorialDestination,
      prompt: 'Curate a visually remarkable trip from this collection, balancing beautiful places with realistic travel logistics.',
      people: [],
      mediaUrl: EDITORIAL_ASSET_PATHS[7],
      primaryCta: 'Plan',
      badge: 'Collection',
      collectionItems: [
        {
          id: 'rail-santorini',
          title: 'Cliffside villages',
          detail: 'Whitewashed stays, caldera walks, sunset timing.',
          imageUrl: EDITORIAL_ASSET_PATHS[2],
          curationPrompt: 'Build a relaxed Greek island trip around cliffside villages, sea views, local tavernas, and ferry timing.',
        },
        {
          id: 'rail-bali',
          title: 'Jungle mornings',
          detail: 'Rice terraces, villas, temples, surf breaks.',
          imageUrl: EDITORIAL_ASSET_PATHS[3],
          curationPrompt: 'Build a Bali trip around jungle villas, early rice terrace walks, temple etiquette, and beach recovery time.',
        },
        {
          id: 'rail-tokyo',
          title: 'Neon food nights',
          detail: 'Markets, tiny bars, trains, design shops.',
          imageUrl: EDITORIAL_ASSET_PATHS[9],
          curationPrompt: 'Build a Tokyo food and design trip with neighborhood walks, train-friendly routing, and late-night options.',
        },
      ],
    });

    for (const card of socialGraph?.inviteCards.slice(0, 2) ?? []) {
      const inviteeNames = card.inviteePersonIds
        .map((personId) => socialGraph?.people.find((person) => person.id === personId)?.displayName)
        .filter((name): name is string => !!name);
      const destination = destinationMatch(destinationList, card.destinationName);
      cards.push({
        id: `occasion-${card.id}`,
        typeLabel: 'Birthday / occasion',
        cardKind: 'occasion',
        title: `${card.destinationName} with ${inviteeNames[0] ?? 'the group'}`,
        detail: `${card.subtitle} A ready-to-share trip idea with the people who would actually make it happen.`,
        sourceLine: `Close friends · ${readinessLabel(card.previewReadiness)} · native invite`,
        destination,
        prompt: `Create a cinematic AI group travel preview for ${['You', ...inviteeNames].join(' and ')} in ${card.destinationName}, joyful but natural, birthday or special occasion energy, realistic travel video still.`,
        people: ['You', ...inviteeNames].slice(0, 3),
        primaryCta: 'View',
        badge: readinessLabel(card.previewReadiness),
        socialCard: card,
      });
    }

    for (const signal of calendar.signals.slice(0, 2)) {
      const destination = signal.label.toLowerCase().includes('weekend') ? bali : paris;
      if (!destination) continue;
      cards.push({
        id: `calendar-${signal.id}`,
        typeLabel: signal.label,
        cardKind: 'personal_preview',
        title: `${destination.name} fits the opening`,
        detail: `${signal.detail} Elsewhere found a trip idea for the window least likely to fight your calendar.`,
        sourceLine: 'Calendar fit · saved references',
        destination,
        prompt: `Create a cinematic AI travel preview of ${people.join(' and ')} in ${destination.name}, designed around ${signal.label.toLowerCase()}, relaxed schedule, real friendship energy, not posed.`,
        people,
        primaryCta: 'View',
        badge: 'Calendar fit',
      });
    }

    for (const destination of destinationList.slice(0, 3)) {
      cards.push({
        id: `destination-${destination.id}`,
        typeLabel: 'Personal idea',
        cardKind: 'personal_preview',
        title: `${destination.name}, with you in mind`,
        detail: `${destination.teaser} Elsewhere matched this to your saved reference set and can turn it into a plan when you want it.`,
        sourceLine: `Personalized idea · from $${totalCost(destination).toLocaleString()}`,
        destination,
        prompt: `${destination.teaser} Create a cinematic AI travel preview starring ${people.join(' and ')} in ${destination.name}, natural candid moments, social-share ready but realistic.`,
        people,
        primaryCta: 'View',
        badge: 'Personal',
      });
    }

    if (!cards.length && !isLoading) {
      cards.push({
        id: 'empty-personal',
        typeLabel: 'Start here',
        cardKind: 'personalization setup',
        title: 'Build your reference library',
        detail: 'Add a few strong reference photos once, then Elsewhere can keep personal travel ideas ready inside Discover.',
        sourceLine: 'Reference photos · close friends · calendar fit',
        destination: null,
        prompt: '',
        people: ['You'],
        primaryCta: 'Add selfie',
        badge: 'Personalization needed',
      });
    }

    const apiFeedCards = [
      ...(discoverFeed?.items ?? []),
    ].map((item) => cardFromFeedItem(item, destinationList));
    const sourceCards = apiFeedCards.length ? apiFeedCards : cards;

    const scopedCardsFor = (feedScope: 'here' | 'elsewhere') => sourceCards.filter((card) => {
      const scope = card.feedScope ?? 'elsewhere';
      return scope === 'both' || scope === feedScope;
    });

    return {
      here: orderDiscoverCards(scopedCardsFor('here')).map((card, index) => enrichCard(card, index)),
      elsewhere: orderDiscoverCards(scopedCardsFor('elsewhere')).map((card, index) => enrichCard(card, index)),
    };
  }, [
    calendar.signals,
    closeFriendNames,
    defaultPeople,
    destinationList,
    discoverFeed,
    isLoading,
    localDiscovery.marketLabel,
    localDiscovery.usingFallbackMarket,
    socialGraph,
  ]);

  const discoverReelCards = useMemo(() => {
    const seen = new Set<string>();
    const combined = [...feedCardsByScope.here, ...feedCardsByScope.elsewhere].filter((card) => {
      if (seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    });
    return rankedDiscoverCards(orderDiscoverCards(combined), likedCards);
  }, [feedCardsByScope, likedCards]);

  useEffect(() => {
    const activeCard = discoverReelCards[activeReelIndex];
    if (!activeCard?.interactivePrompt || revealedPromptIds.has(activeCard.id)) return;

    const timeout = setTimeout(() => {
      setRevealedPromptIds((current) => new Set([...current, activeCard.id]));
    }, activeCard.interactivePrompt.revealAfterMs ?? 2200);

    return () => clearTimeout(timeout);
  }, [activeReelIndex, discoverReelCards, revealedPromptIds]);

  const handleCardPress = (card: PersonalizedDiscoveryCard) => {
    setSelectedCard(card);
  };

  const handleShareInvite = async (card: SocialTripInviteCard) => {
    await Share.share({
      title: card.title,
      message: card.shareText,
      url: card.shareUrl,
    });
  };

  const handleWatchCard = (card: PersonalizedDiscoveryCard) => {
    setError(null);
    cardActionMutation.mutate({ cardId: card.id, watch: true, saved: true });
  };

  const handleSaveCard = (card: PersonalizedDiscoveryCard) => {
    setError(null);
    cardActionMutation.mutate({ cardId: card.id, watch: false, saved: true });
  };

  const handleLikeCard = (card: PersonalizedDiscoveryCard) => {
    setLikedCards((current) => {
      const next = { ...current };
      if (next[card.id]) {
        delete next[card.id];
      } else {
        next[card.id] = preferenceSignature(card);
      }
      return next;
    });
  };

  const handleBookCard = (card: PersonalizedDiscoveryCard) => {
    router.push({
      pathname: '/trip/intake',
      params: { initialText: card.prompt || `Curate a trip from ${card.title}.` },
    });
  };

  if (selectedCard) {
    return (
      <View style={styles.container} {...detailSwipeResponder.panHandlers}>
        <DiscoverDetail
          card={selectedCard}
          error={error}
          isActing={cardActionMutation.isPending}
          isSaved={savedCardIds.has(selectedCard.id)}
          isWatched={watchedCardIds.has(selectedCard.id)}
          photos={referencePhotosForGeneration}
          onBack={() => setSelectedCard(null)}
          onBook={() => handleBookCard(selectedCard)}
          onSave={() => handleSaveCard(selectedCard)}
          onShare={() => Share.share({ title: selectedCard.title, message: selectedCard.detail })}
          onWatch={() => handleWatchCard(selectedCard)}
          onCurateCollection={(prompt) => {
            router.push({
              pathname: '/trip/intake',
              params: { initialText: prompt },
            });
          }}
        />
      </View>
    );
  }

  const feedError = error ??
    calendar.error ??
    photosError ??
    (destinationsError instanceof Error ? destinationsError.message : null) ??
    (healthError instanceof Error ? `API unreachable at ${api.baseUrl}` : null);
  const reelHeight = screenHeight;
  const reelChromeBottom = Math.max(102, insets.bottom + 86);

  return (
    <View style={styles.reelsContainer} {...tabSwipeHandlers}>
      <FlatList
        data={discoverReelCards}
        keyExtractor={(card) => card.id}
        renderItem={({ item, index }) => (
          <DiscoverReelPost
            card={item}
            index={index}
            height={reelHeight}
            width={screenWidth}
            chromeBottom={reelChromeBottom}
            photos={referencePhotosForGeneration}
            isActive={index === activeReelIndex}
            soundEnabled={soundEnabled}
            isLiked={Boolean(likedCards[item.id])}
            showPromptControls={revealedPromptIds.has(item.id) || Boolean(interactiveAnswers[item.id])}
            selectedAnswerId={interactiveAnswers[item.id]}
            onLearn={() => handleCardPress(item)}
            onPlan={() => handleBookCard(item)}
            onLike={() => handleLikeCard(item)}
            onShare={() => Share.share({ title: item.title, message: item.detail })}
            onSelectAnswer={(answerId) => {
              setInteractiveAnswers((current) => ({ ...current, [item.id]: answerId }));
            }}
          />
        )}
        pagingEnabled
        snapToInterval={reelHeight}
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(event) => {
          const nextIndex = Math.round(event.nativeEvent.contentOffset.y / reelHeight);
          setActiveReelIndex(Math.max(0, nextIndex));
        }}
        contentContainerStyle={styles.reelsListContent}
        ListEmptyComponent={isLoading ? <ActivityIndicator style={styles.reelsLoader} color="#fff" /> : null}
      />

      <View style={[styles.reelsTopBar, { paddingTop: insets.top + 18 }]}>
        <View style={styles.reelsLogoMark}>
          <View style={styles.reelsLogoOrbitA} />
          <View style={styles.reelsLogoOrbitB} />
          <Text style={styles.reelsLogoText}>e</Text>
        </View>
        <View style={styles.reelsTopCopy}>
          <Text style={styles.reelsWordmark}>elsewhere</Text>
          <Text style={styles.reelsTagline}>Watch travel. Make it real.</Text>
        </View>
        <ReelSoundToggle enabled={soundEnabled} onPress={() => setSoundEnabled((enabled) => !enabled)} />
      </View>

      {feedError ? (
        <View style={[styles.reelsErrorToast, { top: insets.top + 74 }]}>
          <Text style={styles.reelsErrorText}>{feedError}</Text>
        </View>
      ) : null}
    </View>
  );
}

function DiscoverDetail({
  card,
  error,
  isActing,
  isSaved,
  isWatched,
  photos,
  onBack,
  onBook,
  onCurateCollection,
  onSave,
  onShare,
  onWatch,
}: {
  card: PersonalizedDiscoveryCard;
  error: string | null;
  isActing: boolean;
  isSaved: boolean;
  isWatched: boolean;
  photos: { id: string; url: string }[];
  onBack: () => void;
  onBook: () => void;
  onCurateCollection: (prompt: string) => void;
  onSave: () => void;
  onShare: () => void;
  onWatch: () => void;
}) {
  const isPersonal = isPersonalCardKind(card.cardKind);
  const isDeal = isDealCardKind(card.cardKind);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.detailContent}>
      <Pressable onPress={onBack}>
        <Text style={styles.backLinkInline}>Back to Discover</Text>
      </Pressable>

      <View style={styles.detailHero}>
        {card.mediaUrl ? (
          <AutoplayMedia
            uri={card.mediaUrl}
            posterUri={card.mediaPosterUrl}
            style={styles.detailHeroImage}
            accessibilityLabel={card.mediaAlt}
          />
        ) : null}
        <View style={styles.mediaShade} />
        <View style={styles.mediaTopOverlay}>
          <View style={styles.mediaTopLeft}>
            <Text style={styles.mediaTypeChip}>{cardTypeLabel(card)}</Text>
            {projectedDateLabel(card) ? (
              <Text style={styles.mediaProjectedDate}>{projectedDateLabel(card)}</Text>
            ) : null}
          </View>
          {card.sponsored ? <Text style={styles.sponsoredTextTag}>Sponsored</Text> : null}
        </View>
        <Text style={styles.mediaLocationTitle}>{locationLabel(card)}</Text>
      </View>

      <View style={styles.detailPanel}>
        <Text style={styles.detailTag}>{cardTypeLabel(card)}</Text>
        <Text style={styles.detailTitle}>{card.title}</Text>
        <Text style={styles.detailBody}>{card.detail}</Text>

        {card.editorialShort ? <EditorialShortPanel short={card.editorialShort} /> : null}
        {card.interactivePrompt ? <InteractiveDetailPanel prompt={card.interactivePrompt} /> : null}
        {card.adminAction ? <TravelAdminDetailPanel action={card.adminAction} /> : null}
        {card.tripValue ? <TripValuePanel value={card.tripValue} /> : null}

        {isPersonal ? <ParticipantRow people={card.people} photos={photos} /> : null}

        {card.tripProposal ? <TripProposalPanel proposal={card.tripProposal} /> : null}

        {card.collectionItems ? (
          <>
            <Text style={styles.detailSectionTitle}>Collection</Text>
            <CollectionRail
              cardId={card.id}
              items={card.collectionItems}
              onCurate={(item) => onCurateCollection(item.curationPrompt)}
            />
          </>
        ) : null}

        {card.detailBlocks.map((block) => (
          <View key={`${card.id}-${block.kind}-${block.title}`} style={styles.detailBlock}>
            <Text style={styles.detailBlockTitle}>{block.title}</Text>
            <Text style={styles.detailBlockBody}>{block.body}</Text>
          </View>
        ))}

        {isDeal ? (
          <View style={styles.dealTermsBox}>
            <Text style={styles.dealTermsLabel}>Verification</Text>
            <Text style={styles.dealTermsText}>
              Public deal signals are alerts. Elsewhere watches the fare, but final booking or changes require official provider confirmation.
            </Text>
          </View>
        ) : (
          <View style={styles.assistBox}>
            <Text style={styles.assistBoxTitle}>Watch with Assist</Text>
            <Text style={styles.assistBoxText}>{card.assistPromise}</Text>
          </View>
        )}

        {card.contentSources?.length ? <SourceProvenancePanel sources={card.contentSources} /> : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.detailActions}>
          <Pressable
            style={[styles.detailPrimaryButton, isWatched && styles.detailButtonActive]}
            onPress={onBook}
          >
            <Text
              style={styles.detailPrimaryButtonText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {isDeal ? 'Watch fare' : 'Plan'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.detailActions}>
          <Pressable
            style={[styles.detailSecondaryButtonWide, isWatched && styles.detailSecondaryButtonActive]}
            onPress={onWatch}
            disabled={isActing}
          >
            <Text
              style={styles.detailSecondaryButtonText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {isActing ? 'Updating...' : isWatched ? 'Watching' : isDeal ? 'Watch fare' : 'Watch'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.detailSecondaryButton, isSaved && styles.detailSecondaryButtonActive]}
            onPress={onSave}
            disabled={isActing}
          >
            <Text
              style={styles.detailSecondaryButtonText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {isSaved ? 'Saved' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <Pressable style={styles.bookButton} onPress={onShare}>
          <Text
            style={styles.bookButtonText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            Share
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function reelHook(card: PersonalizedDiscoveryCard): string {
  if (card.hook) return card.hook;
  if (card.editorialShort?.hook) return card.editorialShort.hook;
  if (card.cardKind === 'deal') return `${locationLabel(card)} is moving. Watch the window.`;
  if (card.sponsored) return `This ${locationLabel(card)} trip is ready to price.`;
  if (isPersonalCardKind(card.cardKind)) return `${locationLabel(card)}, but with your actual group.`;
  return card.title;
}

function reelSubline(card: PersonalizedDiscoveryCard, selectedAnswer?: NonNullable<DiscoverInteractivePrompt['answers']>[number]): string {
  if (selectedAnswer) return selectedAnswer.responseDetail;
  if (card.cardKind === 'deal') return card.detail;
  if (card.editorialShort?.captionText) return card.editorialShort.captionText;
  if (card.adminAction) return `${card.adminAction.statusLabel} · ${card.adminAction.deadlineLabel}`;
  return card.detail;
}

function DiscoverReelPost({
  card,
  height,
  width,
  chromeBottom,
  photos,
  isActive,
  soundEnabled,
  isLiked,
  showPromptControls,
  selectedAnswerId,
  onLearn,
  onPlan,
  onLike,
  onShare,
  onSelectAnswer,
}: {
  card: PersonalizedDiscoveryCard;
  index: number;
  height: number;
  width: number;
  chromeBottom: number;
  photos: { id: string; url: string }[];
  isActive: boolean;
  soundEnabled: boolean;
  isLiked: boolean;
  showPromptControls: boolean;
  selectedAnswerId?: string;
  onLearn: () => void;
  onPlan: () => void;
  onLike: () => void;
  onShare: () => void;
  onSelectAnswer: (answerId: string) => void;
}) {
  const isPersonal = isPersonalCardKind(card.cardKind);
  const selectedAnswer = card.interactivePrompt?.answers.find((answer) => answer.id === selectedAnswerId);
  const activeMediaUrl = selectedAnswer?.responseMediaUrl ?? card.mediaUrl;
  const activePosterUrl = selectedAnswer?.responsePosterUrl ?? card.mediaPosterUrl;
  const planDealLabel = priceBadgeLabel(card);

  return (
    <Pressable
      style={[styles.reelPost, { height, width }]}
      onPress={onLearn}
    >
      {activeMediaUrl ? (
        <AutoplayMedia
          uri={activeMediaUrl}
          posterUri={activePosterUrl}
          animateStill
          isActive={isActive}
          soundEnabled={soundEnabled}
          style={styles.reelMedia}
          accessibilityLabel={card.mediaAlt}
        />
      ) : null}
      <View style={styles.reelShadeTop} />
      <View style={styles.reelShadeBottom} />

      <View style={[styles.reelActionRail, { bottom: chromeBottom + 78 }]}>
        <Pressable style={styles.reelRoundAction} onPress={onLike}>
          <Text style={[styles.reelRoundActionIcon, isLiked && styles.reelRoundActionIconActive]}>
            {isLiked ? '♥' : '♡'}
          </Text>
          <Text style={styles.reelRoundActionText}>like</Text>
        </Pressable>
        <Pressable style={styles.reelRoundAction} onPress={onLearn}>
          <Text style={styles.reelRoundActionIcon}>?</Text>
          <Text style={styles.reelRoundActionText}>learn</Text>
        </Pressable>
        <PlanRailAction label={planDealLabel} onPress={onPlan} />
        <Pressable style={styles.reelRoundAction} onPress={onShare}>
          <Text style={styles.reelRoundActionIcon}>{'↗'}</Text>
          <Text style={styles.reelRoundActionText}>share</Text>
        </Pressable>
      </View>

      <View style={[styles.reelCopy, { bottom: chromeBottom }]}>
        <ReelLocationRow
          location={locationLabel(card)}
          participants={isPersonal ? card.participants : []}
          people={isPersonal ? card.people : []}
          photos={photos}
        />
        <Text style={styles.reelHook} numberOfLines={isPersonal ? 2 : 3} adjustsFontSizeToFit minimumFontScale={0.78}>
          {reelHook(card)}
        </Text>
        <MusicAttributionLabel label={musicLabel(card)} />
        <Text style={styles.reelDeck} numberOfLines={isPersonal ? 1 : 2}>
          {reelSubline(card, selectedAnswer)}
        </Text>
        {card.interactivePrompt && showPromptControls ? (
          <InteractivePromptControls
            prompt={card.interactivePrompt}
            selectedAnswerId={selectedAnswerId}
            onSelectAnswer={onSelectAnswer}
          />
        ) : card.adminAction ? (
          <TravelAdminControls action={card.adminAction} />
        ) : null}
      </View>
    </Pressable>
  );
}

function InteractivePromptControls({
  prompt,
  selectedAnswerId,
  onSelectAnswer,
}: {
  prompt: DiscoverInteractivePrompt;
  selectedAnswerId?: string;
  onSelectAnswer: (answerId: string) => void;
}) {
  const selectedAnswer = prompt.answers.find((answer) => answer.id === selectedAnswerId);

  return (
    <View style={styles.interactivePanel}>
      <Text style={styles.interactiveQuestion} numberOfLines={selectedAnswer ? 1 : 2}>
        {selectedAnswer ? selectedAnswer.responseHook : prompt.question}
      </Text>
      <View style={styles.interactiveAnswerRow}>
        {(selectedAnswer ? [selectedAnswer] : prompt.answers).map((answer) => (
          <Pressable
            key={answer.id}
            style={[
              styles.interactiveAnswerButton,
              selectedAnswerId === answer.id && styles.interactiveAnswerButtonSelected,
            ]}
            onPress={(event) => {
              event.stopPropagation();
              onSelectAnswer(answer.id);
            }}
          >
            <Text
              style={styles.interactiveAnswerText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.74}
            >
              {selectedAnswer ? answer.responseCtaLabel : answer.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function PlanRailAction({ label, onPress }: { label: string | null; onPress: () => void }) {
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!label) {
      slide.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(slide, {
          toValue: 1,
          duration: 780,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slide, {
          toValue: 0.82,
          duration: 920,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [label, slide]);

  const transform = {
    transform: [
      {
        translateX: slide.interpolate({
          inputRange: [0, 1],
          outputRange: [5, 0],
        }),
      },
    ],
    opacity: slide.interpolate({
      inputRange: [0, 1],
      outputRange: [0.72, 1],
    }),
  };

  return (
    <Pressable style={styles.reelRoundAction} onPress={onPress}>
      <View style={styles.planDealActionWrap}>
        {label ? (
          <Animated.View pointerEvents="none" style={[styles.planDealCallout, transform]}>
            <Text style={styles.planDealCalloutText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.74}>
              {compactPriceLabel(label)}
            </Text>
          </Animated.View>
        ) : (
          <Text style={styles.reelRoundActionIcon}>✦</Text>
        )}
        {label ? (
          <Text style={styles.planDealSignal} numberOfLines={1}>
            deal
          </Text>
        ) : null}
      </View>
      <Text style={styles.reelRoundActionText}>plan</Text>
    </Pressable>
  );
}

function TravelAdminControls({ action }: { action: DiscoverAdminAction }) {
  return (
    <View style={styles.adminPanel}>
      <Text style={styles.adminPanelText} numberOfLines={2}>
        {action.partnerName ? `${action.partnerName} handoff available` : action.statusLabel}
      </Text>
      <View style={styles.adminActionPill}>
        <Text style={styles.adminActionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
          {action.actionLabel}
        </Text>
      </View>
    </View>
  );
}

function ReelSoundToggle({ enabled, onPress }: { enabled: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.soundToggle} onPress={onPress}>
      <Text style={styles.soundToggleText}>{enabled ? 'sound on' : 'sound off'}</Text>
    </Pressable>
  );
}

function MusicAttributionLabel({ label }: { label: string }) {
  return <Text style={styles.reelMusicLabel} numberOfLines={1}>♪ {label}</Text>;
}

function ReelLocationRow({
  location,
  participants,
  people,
  photos,
}: {
  location: string;
  participants?: DiscoverParticipant[];
  people: string[];
  photos: { id: string; url: string }[];
}) {
  return (
    <View style={styles.reelLocationRow}>
      <Text style={styles.reelLocation} numberOfLines={1}>{location}</Text>
      {participants?.length || people.length ? (
        <View style={styles.reelParticipantStack}>
          {(participants?.length ? participants : people.map((name): DiscoverParticipant => ({ name }))).slice(0, 3).map((participant, index) => {
            const isYou = participant.name.trim().toLowerCase() === 'you';
            const uri = participant.avatarUrl
              ? assetUrl(participant.avatarUrl)
              : isYou && photos[0]
                ? photos[0].url
                : assetUrl(friendAvatarForName(participant.name, index) ?? DEMO_MEDIA.discover.friendAvatars.you);
            return (
              <Image
                key={`${participant.name}-${index}`}
                source={{ uri }}
                style={[styles.reelParticipantAvatar, { marginLeft: index === 0 ? 0 : -9 }]}
                contentFit="cover"
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function EditorialShortPanel({ short }: { short: EditorialShort }) {
  return (
    <View style={styles.intelPanel}>
      <Text style={styles.intelPanelLabel}>Editorial short</Text>
      <Text style={styles.intelPanelTitle}>{short.hook}</Text>
      <Text style={styles.intelPanelBody}>{short.captionText}</Text>
      <Text style={styles.intelPanelMeta}>
        {short.durationSeconds}s · {short.ctaLabel}{short.disclosure ? ` · ${short.disclosure}` : ''}
      </Text>
    </View>
  );
}

function InteractiveDetailPanel({ prompt }: { prompt: DiscoverInteractivePrompt }) {
  return (
    <View style={styles.intelPanel}>
      <Text style={styles.intelPanelLabel}>{prompt.contextLabel}</Text>
      <Text style={styles.intelPanelTitle}>{prompt.question}</Text>
      {prompt.answers.map((answer) => (
        <View key={answer.id} style={styles.answerDetailRow}>
          <Text style={styles.answerDetailLabel}>{answer.label}</Text>
          <Text style={styles.answerDetailBody}>{answer.responseHook} {answer.responseDetail}</Text>
        </View>
      ))}
    </View>
  );
}

function TravelAdminDetailPanel({ action }: { action: DiscoverAdminAction }) {
  return (
    <View style={styles.valuePanel}>
      <View>
        <Text style={styles.valuePanelLabel}>{action.kind.replace('_', ' ')}</Text>
        <Text style={styles.valuePanelPrice}>{action.statusLabel}</Text>
      </View>
      <View style={styles.valueMonthlyPill}>
        <Text style={styles.valueMonthlyText}>{action.actionLabel}</Text>
      </View>
      <Text style={styles.valueLimitation}>
        {action.deadlineLabel}{action.partnerName ? ` · partner handoff: ${action.partnerName}` : ''}
      </Text>
    </View>
  );
}

function TripValuePanel({ value }: { value: DiscoverTripValue }) {
  return (
    <View style={styles.valuePanel}>
      <View>
        <Text style={styles.valuePanelLabel}>Trip value</Text>
        <Text style={styles.valuePanelPrice}>{value.label}</Text>
      </View>
      <View style={styles.valueMonthlyPill}>
        <Text style={styles.valueMonthlyText}>
          ${value.monthlyAmount}/mo
        </Text>
      </View>
      <Text style={styles.valueLimitation}>{value.limitation}</Text>
    </View>
  );
}

function TripProposalPanel({ proposal }: { proposal: DiscoverTripProposal }) {
  return (
    <View style={styles.proposalPanel}>
      <Text style={styles.detailSectionTitle}>Trip proposal</Text>
      <View style={styles.tripFactsGrid}>
        <View style={styles.tripFact}>
          <Text style={styles.tripFactLabel}>Route</Text>
          <Text style={styles.tripFactValue}>
            {proposal.origin ? `${proposal.origin} -> ` : ''}{proposal.destination}
          </Text>
        </View>
        <View style={styles.tripFact}>
          <Text style={styles.tripFactLabel}>Window</Text>
          <Text style={styles.tripFactValue}>{proposal.dateWindow}</Text>
        </View>
        <View style={[styles.tripFact, styles.tripFactWide]}>
          <Text style={styles.tripFactLabel}>Calendar fit</Text>
          <Text style={styles.tripFactValue}>{proposal.calendarFit}</Text>
        </View>
      </View>
      {proposal.components.map((component) => (
        <View key={component.id} style={styles.proposalComponent}>
          <Text style={styles.proposalComponentKicker}>{component.kind}</Text>
          <Text style={styles.proposalComponentTitle}>{component.title}</Text>
          <Text style={styles.proposalComponentBody}>{component.summary}</Text>
          <Text style={styles.proposalComponentPrice}>
            ${component.estimatedPriceAmount.toLocaleString()} · {component.sourceKind}
          </Text>
        </View>
      ))}
      <View style={styles.assistWatchList}>
        <Text style={styles.assistBoxTitle}>Assist is watching</Text>
        {proposal.assistWatchItems.map((watchItem) => (
          <Text key={watchItem} style={styles.assistWatchItem}>- {watchItem}</Text>
        ))}
      </View>
    </View>
  );
}

function SourceProvenancePanel({ sources }: { sources: DiscoverContentSource[] }) {
  return (
    <View style={styles.sourcePanel}>
      <Text style={styles.sourcePanelTitle}>Media and signal sources</Text>
      {sources.map((source, index) => (
        <View key={`${source.kind}-${source.name}-${index}`} style={styles.sourceRow}>
          <Text style={styles.sourceKind}>{source.kind.replace('_', ' ')}</Text>
          <Text style={styles.sourceName}>{source.name}</Text>
          {source.freshnessLabel ? <Text style={styles.sourceMeta}>{source.freshnessLabel}</Text> : null}
          {source.limitation ? <Text style={styles.sourceLimitation}>{source.limitation}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function AutoplayMedia({
  uri,
  posterUri,
  style,
  accessibilityLabel,
  imageFit = 'cover',
  animateStill = false,
  isActive = true,
  soundEnabled = false,
}: {
  uri: string;
  posterUri?: string;
  style: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  imageFit?: 'cover' | 'contain';
  animateStill?: boolean;
  isActive?: boolean;
  soundEnabled?: boolean;
}) {
  if (isVideoUrl(uri)) {
    return (
      <SafeAutoplayVideo
        uri={assetUrl(uri)}
        posterUri={posterUri ? assetUrl(posterUri) : undefined}
        style={style}
        accessibilityLabel={accessibilityLabel}
        isActive={isActive}
        soundEnabled={soundEnabled}
      />
    );
  }

  if (animateStill) {
    return (
      <AnimatedStillReelMedia
        uri={assetUrl(uri)}
        style={style}
        accessibilityLabel={accessibilityLabel}
        imageFit={imageFit}
        isActive={isActive}
      />
    );
  }

  return (
    <Image
      source={{ uri: assetUrl(uri) }}
      style={style as any}
      contentFit={imageFit}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

function SafeAutoplayVideo({
  uri,
  posterUri,
  style,
  accessibilityLabel,
  isActive,
  soundEnabled,
}: {
  uri: string;
  posterUri?: string;
  style: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  isActive: boolean;
  soundEnabled: boolean;
}) {
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const loopSeekingRef = useRef(false);
  const player = useVideoPlayer({ uri }, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.timeUpdateEventInterval = 0.12;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });

  useEffect(() => {
    if (status === 'readyToPlay') {
      setPlaybackFailed(false);
      player.muted = !soundEnabled;
      if (isActive) {
        player.play();
      } else {
        player.pause();
      }
    }
    if (status === 'error') {
      setPlaybackFailed(true);
    }
  }, [isActive, player, soundEnabled, status]);

  useEffect(() => {
    if (!isActive || playbackFailed || status !== 'readyToPlay' || loopSeekingRef.current) return;
    const duration = player.duration;
    if (!Number.isFinite(duration) || duration <= 1.2 || currentTime <= 0.6) return;
    if (duration - currentTime > 0.14) return;

    loopSeekingRef.current = true;
    player.currentTime = 0.01;
    player.play();
    const timer = setTimeout(() => {
      loopSeekingRef.current = false;
    }, 180);
    return () => clearTimeout(timer);
  }, [currentTime, isActive, playbackFailed, player, status]);

  return (
    <View style={style} accessibilityLabel={accessibilityLabel}>
      {posterUri ? (
        <Image source={{ uri: posterUri }} style={styles.videoPoster} contentFit="cover" />
      ) : null}
      {!playbackFailed && status === 'readyToPlay' ? (
        <VideoView
          player={player}
          style={styles.videoSurface}
          contentFit="cover"
          nativeControls={false}
          allowsFullscreen={false}
        />
      ) : null}
    </View>
  );
}

function AnimatedStillReelMedia({
  uri,
  style,
  accessibilityLabel,
  imageFit,
  isActive,
}: {
  uri: string;
  style: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  imageFit: 'cover' | 'contain';
  isActive: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isActive) {
      scale.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.08,
          duration: 9000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [isActive, scale]);

  return (
    <View style={style} accessibilityLabel={accessibilityLabel}>
      <Animated.View style={[styles.animatedStillFrame, { transform: [{ scale }] }]}>
        <Image source={{ uri }} style={styles.videoSurface} contentFit={imageFit} />
      </Animated.View>
    </View>
  );
}

function ParticipantRow({
  people,
  photos,
}: {
  people: string[];
  photos: { id: string; url: string }[];
}) {
  if (!people.length) return null;

  return (
    <View style={styles.participantRow}>
      {people.map((person, index) => {
        const isYou = person.trim().toLowerCase() === 'you';
        const photo = isYou ? photos[0] : null;
        const fallbackAvatar = photo ? null : friendAvatarForName(person, index);
        return (
          <View key={`${person}-${index}`} style={styles.participant}>
            {photo ? (
              <Image source={{ uri: photo.url }} style={styles.participantImage} contentFit="cover" />
            ) : fallbackAvatar ? (
              <Image source={{ uri: assetUrl(fallbackAvatar) }} style={styles.participantImage} contentFit="cover" />
            ) : (
              <View style={styles.participantInitials}>
                <Text style={styles.participantInitialsText}>{initials(person)}</Text>
              </View>
            )}
            <Text style={styles.participantName}>{person}</Text>
          </View>
        );
      })}
    </View>
  );
}

function PersonalizedCard({
  card,
  cardWidth,
  closeFriendLabel,
  featured,
  photos,
  onPress,
  onShare,
  onToggleCloseFriend,
}: {
  card: PersonalizedDiscoveryCard;
  cardWidth?: number;
  closeFriendLabel?: string;
  featured: boolean;
  photos: { id: string; url: string }[];
  onPress: () => void;
  onShare?: () => void;
  onToggleCloseFriend?: () => void;
}) {
  const variant = layoutVariantForCard(card);
  if (variant === 'collection_rail') {
    return <CollectionDiscoverCard card={card} cardWidth={cardWidth} onPress={onPress} />;
  }

  if (variant === 'deal_compact') {
    return <DealDiscoverCard card={card} onPress={onPress} />;
  }

  if (variant === 'sponsored_feature') {
    return <SponsoredDiscoverCard card={card} featured={featured} onPress={onPress} />;
  }

  if (variant === 'cultural_video') {
    return <CulturalVideoDiscoverCard card={card} cardWidth={cardWidth} onPress={onPress} />;
  }

  if (variant === 'personal_preview') {
    return (
      <PersonalPreviewDiscoverCard
        card={card}
        cardWidth={cardWidth}
        closeFriendLabel={closeFriendLabel}
        photos={photos}
        onPress={onPress}
        onShare={onShare}
        onToggleCloseFriend={onToggleCloseFriend}
      />
    );
  }

  return <EditorialDiscoverCard card={card} cardWidth={cardWidth} featured={featured} onPress={onPress} />;
}

function MediaOverlay({ card }: { card: PersonalizedDiscoveryCard }) {
  return (
    <>
      <View style={styles.mediaShade} />
      <View style={styles.mediaTopOverlay}>
        <View style={styles.mediaTopLeft}>
          <Text style={styles.mediaTypeChip}>{cardTypeLabel(card)}</Text>
          {projectedDateLabel(card) ? (
            <Text style={styles.mediaProjectedDate}>{projectedDateLabel(card)}</Text>
          ) : null}
        </View>
        {card.sponsored ? <Text style={styles.sponsoredTextTag}>Sponsored</Text> : null}
      </View>
      <Text style={styles.mediaLocationTitle}>{locationLabel(card)}</Text>
    </>
  );
}

function CtaPill({ label, tone = 'primary' }: { label: string; tone?: 'primary' | 'secondary' | 'deal' }) {
  return (
    <View style={[
      styles.primaryPill,
      tone === 'secondary' && styles.secondaryPillStatic,
      tone === 'deal' && styles.dealWatchPill,
    ]}>
      <Text
        style={[
          styles.primaryPillText,
          tone === 'secondary' && styles.secondaryPillText,
          tone === 'deal' && styles.dealWatchPillText,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
      >
        {label}
      </Text>
    </View>
  );
}

function SponsoredDiscoverCard({
  card,
  featured,
  onPress,
}: {
  card: PersonalizedDiscoveryCard;
  featured: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.sponsoredFeatureCard, featured && styles.personalCardFeatured]}
      onPress={onPress}
    >
      <View style={styles.sponsoredMediaFrame}>
        {card.mediaUrl ? (
          <AutoplayMedia
            uri={card.mediaUrl}
            posterUri={card.mediaPosterUrl}
            style={styles.personalPreviewImage}
            accessibilityLabel={card.mediaAlt}
          />
        ) : null}
        <MediaOverlay card={card} />
      </View>
      <View style={styles.sponsoredBody}>
        <Text style={styles.sponsoredEyebrow}>{card.advertiserName ?? card.sourceLine}</Text>
        <Text style={styles.sponsoredTitle}>{card.title}</Text>
        {valueLabel(card) ? <Text style={styles.cardValueText}>{valueLabel(card)}</Text> : null}
        <Text style={styles.sponsoredDetail} numberOfLines={3}>{card.detail}</Text>
        <View style={styles.sponsoredFooter}>
          <Text style={styles.sponsoredReason} numberOfLines={2}>
            {card.targetingReason ?? card.sourceLine}
          </Text>
          <CtaPill label="Plan" />
        </View>
      </View>
    </Pressable>
  );
}

function EditorialDiscoverCard({
  card,
  cardWidth,
  featured,
  onPress,
}: {
  card: PersonalizedDiscoveryCard;
  cardWidth?: number;
  featured: boolean;
  onPress: () => void;
}) {
  const width = cardWidth ?? 360;
  const mediaHeight = featured ? Math.min(430, width * 1.05) : card.size === 'compact' ? 210 : card.size === 'large' ? 330 : 270;

  return (
    <Pressable style={styles.editorialStoryCard} onPress={onPress}>
      <View style={[styles.editorialMediaFrame, { height: mediaHeight }]}>
        {card.mediaUrl ? (
          <AutoplayMedia
            uri={card.mediaUrl}
            posterUri={card.mediaPosterUrl}
            style={styles.personalPreviewImage}
            accessibilityLabel={card.mediaAlt}
          />
        ) : null}
        <MediaOverlay card={card} />
      </View>
      <View style={styles.editorialBody}>
        <Text style={styles.editorialSource}>{card.sourceLine}</Text>
        <Text style={styles.editorialTitle}>{card.title}</Text>
        {valueLabel(card) ? <Text style={styles.cardValueText}>{valueLabel(card)}</Text> : null}
        <Text style={styles.editorialDetail}>{card.detail}</Text>
        <Text style={styles.editorialReadMore}>Plan from this</Text>
      </View>
    </Pressable>
  );
}

function CulturalVideoDiscoverCard({
  card,
  cardWidth,
  onPress,
}: {
  card: PersonalizedDiscoveryCard;
  cardWidth?: number;
  onPress: () => void;
}) {
  const width = cardWidth ?? 360;
  const mediaHeight = Math.min(680, Math.max(520, width * 1.62));

  return (
    <Pressable style={styles.culturalVideoCard} onPress={onPress}>
      <View style={[styles.culturalVideoFrame, { height: mediaHeight }]}>
        {card.mediaUrl ? (
          <AutoplayMedia
            uri={card.mediaUrl}
            posterUri={card.mediaPosterUrl}
            style={styles.personalPreviewImage}
            accessibilityLabel={card.mediaAlt}
          />
        ) : null}
        <View style={styles.mediaShade} />
        <View style={styles.mediaTopOverlay}>
          <View style={styles.mediaTopLeft}>
            <Text style={styles.mediaTypeChip}>{cardTypeLabel(card)}</Text>
            {projectedDateLabel(card) ? (
              <Text style={styles.mediaProjectedDate}>{projectedDateLabel(card)}</Text>
            ) : null}
          </View>
        </View>
        <Text style={styles.mediaLocationTitle}>{locationLabel(card)}</Text>
      </View>
      <View style={styles.culturalVideoBody}>
        <Text style={styles.culturalVideoTitle}>{card.title}</Text>
        {valueLabel(card) ? <Text style={styles.culturalVideoValue}>{valueLabel(card)}</Text> : null}
        <Text style={styles.culturalVideoDetail} numberOfLines={2}>{card.detail}</Text>
      </View>
    </Pressable>
  );
}

function PersonalPreviewDiscoverCard({
  card,
  cardWidth,
  closeFriendLabel,
  photos,
  onPress,
  onShare,
  onToggleCloseFriend,
}: {
  card: PersonalizedDiscoveryCard;
  cardWidth?: number;
  closeFriendLabel?: string;
  photos: { id: string; url: string }[];
  onPress: () => void;
  onShare?: () => void;
  onToggleCloseFriend?: () => void;
}) {
  const width = cardWidth ?? 360;
  const mediaHeight = Math.min(650, Math.max(480, width * 1.45));

  return (
    <Pressable style={styles.personalPreviewCard} onPress={onPress}>
      <View style={[styles.personalPreviewFrame, { height: mediaHeight }]}>
        {card.mediaUrl ? (
          <AutoplayMedia
            uri={card.mediaUrl}
            posterUri={card.mediaPosterUrl}
            style={styles.personalPreviewImage}
            accessibilityLabel={card.mediaAlt}
          />
        ) : null}
        <MediaOverlay card={card} />
      </View>
      <View style={styles.personalBody}>
        <ParticipantRow people={card.people} photos={photos} />
        <Text style={styles.personalTitle}>{card.title}</Text>
        {valueLabel(card) ? <Text style={styles.cardValueText}>{valueLabel(card)}</Text> : null}
        <Text style={styles.personalDetail} numberOfLines={3}>{card.detail}</Text>
        <Text style={styles.personalSource}>{card.sourceLine}</Text>
        <View style={styles.personalActions}>
          <CtaPill label={primaryCtaLabel(card)} />
          {onShare ? (
            <Pressable style={styles.secondaryPill} onPress={onShare}>
              <Text style={styles.secondaryPillText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                Share invite
              </Text>
            </Pressable>
          ) : null}
          {onToggleCloseFriend && closeFriendLabel ? (
            <Pressable style={styles.secondaryPill} onPress={onToggleCloseFriend}>
              <Text style={styles.secondaryPillText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                {closeFriendLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function DealDiscoverCard({
  card,
  onPress,
}: {
  card: PersonalizedDiscoveryCard;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.dealCompactCard} onPress={onPress}>
      <View style={styles.dealCompactTop}>
        <View style={styles.dealCompactCopy}>
          <Text style={styles.dealCompactKicker}>{cardTypeLabel(card)}</Text>
          <Text style={styles.dealCompactTitle}>{card.title}</Text>
          {valueLabel(card) ? <Text style={styles.dealValueText}>{valueLabel(card)}</Text> : null}
          <Text style={styles.dealCompactDetail} numberOfLines={3}>{card.detail}</Text>
          <Text style={styles.dealCompactSource} numberOfLines={1}>{card.sourceLine}</Text>
        </View>
        <View style={styles.dealCompactMedia}>
          {card.mediaUrl ? (
            <AutoplayMedia
              uri={card.mediaUrl}
              posterUri={card.mediaPosterUrl}
              style={styles.dealCompactImage}
              accessibilityLabel={card.mediaAlt}
              imageFit="cover"
            />
          ) : null}
        </View>
      </View>
      <View style={styles.dealCompactFooter}>
        <Text style={styles.dealCompactDate} numberOfLines={1}>
          {projectedDateLabel(card) ?? 'Watching dates'}
        </Text>
        <CtaPill label="Watch" tone="deal" />
      </View>
    </Pressable>
  );
}

function CollectionDiscoverCard({
  card,
  cardWidth,
  onPress,
}: {
  card: PersonalizedDiscoveryCard;
  cardWidth?: number;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.collectionCard} onPress={onPress}>
      <View style={styles.collectionHeader}>
        <Text style={styles.collectionKicker}>{cardTypeLabel(card)}</Text>
        <Text style={styles.collectionHeadline}>{card.title}</Text>
        <Text style={styles.collectionDeck}>{card.detail}</Text>
      </View>
      {card.collectionItems ? (
        <CollectionRail
          cardId={card.id}
          items={card.collectionItems}
          cardWidth={(cardWidth ?? 360) * 0.64}
        />
      ) : null}
      <View style={styles.collectionFooter}>
        <Text style={styles.personalSource}>{card.sourceLine}</Text>
        <CtaPill label="Plan" tone="secondary" />
      </View>
    </Pressable>
  );
}

function CollectionRail({
  cardId,
  items,
  cardWidth = 260,
  onCurate,
}: {
  cardId: string;
  items: NonNullable<PersonalizedDiscoveryCard['collectionItems']>;
  cardWidth?: number;
  onCurate?: (item: NonNullable<PersonalizedDiscoveryCard['collectionItems']>[number]) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.collectionScroller}
    >
      {items.map((item) => (
        <Pressable
          key={`${cardId}-${item.id}`}
          style={[styles.collectionItem, { width: cardWidth }]}
          onPress={() => onCurate?.(item)}
        >
          {item.imageUrl ? (
            <Image source={{ uri: assetUrl(item.imageUrl) }} style={styles.collectionImage} contentFit="cover" />
          ) : null}
          <View style={styles.collectionOverlay} />
          <View style={styles.collectionText}>
            <Text style={styles.collectionTitle}>{item.title}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SOCIAL_POP.background },
  reelsContainer: { flex: 1, backgroundColor: '#050506' },
  reelsListContent: { backgroundColor: '#050506' },
  reelsLoader: { marginTop: 180 },
  reelPost: {
    backgroundColor: '#050506',
    overflow: 'hidden',
  },
  reelMedia: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  reelShadeTop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.14)',
  },
  reelShadeBottom: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  reelsTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  reelsLogoMark: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reelsLogoOrbitA: {
    position: 'absolute',
    width: 42,
    height: 13,
    borderRadius: 999,
    backgroundColor: SOCIAL_POP.coral,
    transform: [{ rotate: '-28deg' }],
    top: 9,
    left: -6,
  },
  reelsLogoOrbitB: {
    position: 'absolute',
    width: 42,
    height: 13,
    borderRadius: 999,
    backgroundColor: SOCIAL_POP.teal,
    transform: [{ rotate: '28deg' }],
    bottom: 9,
    right: -6,
  },
  reelsLogoText: { color: SOCIAL_POP.text, fontSize: 22, fontWeight: '900' },
  reelsTopCopy: { flex: 1 },
  reelsWordmark: { color: '#fff', fontSize: 18, fontWeight: '900', textTransform: 'lowercase' },
  reelsTagline: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '800', marginTop: 1 },
  soundToggle: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center',
  },
  soundToggleText: {
    color: '#fff',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    textTransform: 'lowercase',
    textShadowColor: 'rgba(0,0,0,0.48)',
    textShadowRadius: 8,
  },
  reelsErrorToast: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 30,
    borderRadius: 14,
    backgroundColor: 'rgba(130, 30, 42, 0.92)',
    padding: 10,
  },
  reelsErrorText: { color: '#fff', fontSize: 12, lineHeight: 17, fontWeight: '800' },
  reelActionRail: {
    position: 'absolute',
    right: 12,
    gap: 13,
    alignItems: 'center',
  },
  reelRoundAction: { alignItems: 'center', gap: 4 },
  planDealActionWrap: {
    width: 56,
    height: 47,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelRoundActionIcon: {
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.19)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    color: '#fff',
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingTop: 12,
    fontSize: 13,
    fontWeight: '900',
  },
  reelRoundActionIconActive: {
    backgroundColor: 'rgba(255, 79, 109, 0.42)',
    borderColor: 'rgba(255, 255, 255, 0.48)',
  },
  planDealCallout: {
    width: 58,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 5,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 79, 109, 0.43)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
    shadowColor: '#ff4f6d',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.42,
    shadowRadius: 16,
    elevation: 5,
  },
  planDealCalloutText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 8,
  },
  planDealSignal: {
    position: 'absolute',
    bottom: 2,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 7,
    lineHeight: 8,
    fontWeight: '800',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  reelRoundActionText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 10,
  },
  reelCopy: {
    position: 'absolute',
    left: 16,
    right: 98,
  },
  reelLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: '100%',
  },
  reelLocation: {
    flexShrink: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowRadius: 12,
  },
  reelParticipantStack: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 3,
  },
  reelParticipantAvatar: {
    width: 27,
    height: 27,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.78)',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  reelHook: {
    color: '#fff',
    fontSize: 25,
    lineHeight: 28,
    fontWeight: '900',
    marginTop: 8,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowRadius: 16,
  },
  reelMusicLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    marginTop: 8,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 10,
  },
  reelDeck: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 7,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 10,
  },
  priceBadge: {
    alignSelf: 'flex-start',
    maxWidth: 286,
    marginTop: 10,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  priceBadgeLabel: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 21,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 8,
  },
  priceBadgeReason: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  interactivePanel: {
    marginTop: 12,
    maxWidth: 290,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    padding: 10,
  },
  interactiveQuestion: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 8,
  },
  interactiveAnswerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 8,
  },
  interactiveAnswerButton: {
    maxWidth: 132,
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    justifyContent: 'center',
  },
  interactiveAnswerButtonSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
    borderColor: 'rgba(255,255,255,0.58)',
  },
  interactiveAnswerText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  adminPanel: {
    marginTop: 12,
    maxWidth: 285,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 20,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  adminPanelText: {
    flex: 1,
    color: '#fff',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  adminActionPill: {
    maxWidth: 118,
    minHeight: 31,
    borderRadius: 999,
    paddingHorizontal: 10,
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.30)',
  },
  adminActionText: {
    color: '#fff',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  feedContent: { padding: 16, paddingBottom: 180 },
  feedPager: { flex: 1 },
  feedPage: { flex: 1 },
  feedPageContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 180 },
  title: { fontSize: 32, fontWeight: '900', marginBottom: 4, color: '#111' },
  subtitle: { fontSize: 15, color: '#5f625f', lineHeight: 21, marginBottom: 16 },
  devStatus: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  devStatusText: { fontSize: 13, fontWeight: '700', color: '#333' },
  devStatusMeta: { fontSize: 11, color: '#777', marginTop: 2 },
  errorBox: {
    backgroundColor: '#fff5f5',
    borderColor: '#fed7d7',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errorText: { color: '#c53030', fontSize: 13, lineHeight: 18 },
  loader: { marginTop: 40 },
  feedSwitchWrap: {
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
  },
  feedSwitch: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(20, 20, 20, 0.08)',
  },
  feedSwitchButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedSwitchButtonActive: {
    backgroundColor: SOCIAL_POP.text,
  },
  feedSwitchText: {
    color: '#6b6258',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'lowercase',
  },
  feedSwitchTextActive: { color: '#fff' },
  feedSwitchMeta: {
    color: '#6b6258',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 7,
    paddingHorizontal: 4,
  },
  personalCard: {
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(20, 20, 20, 0.08)',
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 3,
  },
  personalCardFeatured: { borderColor: 'rgba(17, 17, 17, 0.28)' },
  sponsoredCard: { borderColor: 'rgba(255, 79, 109, 0.38)' },
  sponsoredFeatureCard: {
    borderRadius: 28,
    borderWidth: 0,
    backgroundColor: '#fff',
    marginBottom: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 30,
    elevation: 4,
  },
  editorialStoryCard: {
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(17, 17, 17, 0.10)',
    marginBottom: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.035,
    shadowRadius: 14,
    elevation: 2,
  },
  dealCompactCard: {
    padding: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(232, 63, 93, 0.24)',
    backgroundColor: '#fff8f2',
    marginBottom: 16,
    shadowColor: '#e83f5d',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  dealCompactTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dealCompactCopy: { flex: 1 },
  dealCompactKicker: {
    color: SOCIAL_POP.coral,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dealCompactTitle: { color: '#111', fontSize: 20, lineHeight: 23, fontWeight: '900', marginTop: 7 },
  dealCompactDetail: { color: '#4d4b47', fontSize: 13, lineHeight: 18, marginTop: 7 },
  dealCompactSource: { color: '#7b746d', fontSize: 11, lineHeight: 15, fontWeight: '800', marginTop: 8 },
  dealCompactMedia: {
    width: 112,
    height: 132,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  dealCompactImage: { width: 112, height: 132 },
  dealCompactFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(20, 20, 20, 0.08)',
  },
  dealCompactDate: { flex: 1, color: '#6b6258', fontSize: 12, fontWeight: '800' },
  dealWatchPill: {
    borderRadius: 999,
    backgroundColor: SOCIAL_POP.coral,
    minHeight: 32,
    paddingHorizontal: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dealWatchPillText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  collectionCard: {
    borderRadius: 24,
    backgroundColor: '#151515',
    marginBottom: 18,
    overflow: 'hidden',
    paddingTop: 0,
  },
  personalPreviewFrame: {
    minHeight: 230,
    backgroundColor: '#101820',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  personalPreviewImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  videoSurface: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  videoPoster: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  animatedStillFrame: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  mediaShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.16)',
  },
  mediaTopOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  mediaTopLeft: { flex: 1, alignItems: 'flex-start' },
  mediaTypeChip: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowRadius: 10,
  },
  mediaProjectedDate: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '400',
    marginTop: 3,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowRadius: 10,
  },
  sponsoredTextTag: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowRadius: 10,
  },
  mediaLocationTitle: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowRadius: 14,
  },
  participantRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  participant: { alignItems: 'center', maxWidth: 66 },
  participantImage: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#e8eef0' },
  participantInitials: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#d9f0f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  participantInitialsText: { color: '#0a4f66', fontSize: 13, fontWeight: '900' },
  participantName: { color: '#4b5563', fontSize: 11, fontWeight: '800', marginTop: 5 },
  personalBody: { padding: 16, paddingBottom: 24 },
  personalType: { color: '#8b6b34', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  personalTitle: { color: '#111', fontSize: 22, fontWeight: '900', lineHeight: 27, marginTop: 7 },
  personalDetail: { color: '#444', fontSize: 14, lineHeight: 20, marginTop: 8 },
  personalSource: { color: '#667085', fontSize: 12, lineHeight: 17, marginTop: 10 },
  cardValueText: { color: SOCIAL_POP.coral, fontSize: 15, lineHeight: 19, fontWeight: '900', marginTop: 8 },
  dealValueText: { color: SOCIAL_POP.coral, fontSize: 17, lineHeight: 20, fontWeight: '900', marginTop: 6 },
  personalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, paddingBottom: 8, alignItems: 'flex-start' },
  primaryPill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 36,
    backgroundColor: SOCIAL_POP.coral,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryPillText: { color: '#fff', fontSize: 12, lineHeight: 14, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' },
  secondaryPill: {
    maxWidth: '100%',
    minHeight: 34,
    borderWidth: 1,
    borderColor: '#d6cec0',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fbfaf7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryPillStatic: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e1d8c8',
  },
  secondaryPillText: { color: '#5a5145', fontSize: 12, lineHeight: 14, fontWeight: '900', textAlign: 'center' },
  sponsoredMediaFrame: {
    height: 410,
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  sponsoredBody: { padding: 18, paddingBottom: 20 },
  sponsoredEyebrow: {
    color: '#92733c',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sponsoredTitle: { color: '#111', fontSize: 27, lineHeight: 31, fontWeight: '900', marginTop: 8 },
  sponsoredDetail: { color: '#4c4741', fontSize: 14, lineHeight: 20, marginTop: 9 },
  sponsoredFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  sponsoredReason: { flex: 1, color: '#71695f', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  editorialMediaFrame: {
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  editorialBody: { padding: 16, paddingBottom: 18 },
  editorialSource: {
    color: '#8a7962',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  editorialTitle: { color: '#101010', fontSize: 24, lineHeight: 28, fontWeight: '900', marginTop: 8 },
  editorialDetail: { color: '#4b4741', fontSize: 14, lineHeight: 21, marginTop: 8 },
  editorialReadMore: { color: SOCIAL_POP.coral, fontSize: 13, fontWeight: '900', marginTop: 14 },
  culturalVideoCard: {
    borderRadius: 30,
    backgroundColor: '#0b0b0d',
    marginBottom: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 4,
  },
  culturalVideoFrame: {
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  culturalVideoBody: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 54,
    paddingTop: 70,
  },
  culturalVideoTitle: { color: '#fff', fontSize: 24, lineHeight: 28, fontWeight: '900' },
  culturalVideoValue: { color: '#ffd86f', fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 6 },
  culturalVideoDetail: { color: 'rgba(255,255,255,0.86)', fontSize: 13, lineHeight: 18, marginTop: 6 },
  personalPreviewCard: {
    borderRadius: 26,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255, 79, 109, 0.24)',
    marginBottom: 18,
    overflow: 'hidden',
    shadowColor: '#ff4f6d',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 3,
  },
  collectionHeader: { padding: 18, paddingBottom: 12 },
  collectionKicker: { color: '#ffd86f', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  collectionHeadline: { color: '#fff', fontSize: 25, lineHeight: 29, fontWeight: '900', marginTop: 8 },
  collectionDeck: { color: 'rgba(255,255,255,0.74)', fontSize: 13, lineHeight: 19, marginTop: 7 },
  collectionFooter: { padding: 16, paddingTop: 10, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'space-between' },
  collectionScroller: { gap: 10, paddingHorizontal: 16, paddingBottom: 4 },
  collectionItem: {
    height: 220,
    borderRadius: 14,
    backgroundColor: '#101820',
    overflow: 'hidden',
  },
  collectionImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  collectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  collectionText: { flex: 1, justifyContent: 'flex-end', padding: 14 },
  collectionTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  collectionDetail: { color: '#eef4f6', fontSize: 12, lineHeight: 17, marginTop: 5 },
  connectCalendarCard: {
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e3dbcf',
    padding: 16,
    marginTop: 2,
  },
  connectCalendarTitle: { color: '#111', fontSize: 17, fontWeight: '900' },
  connectCalendarDetail: { color: '#555', fontSize: 13, lineHeight: 19, marginTop: 7 },
  connectCalendarText: { color: '#111', fontSize: 13, fontWeight: '900', marginTop: 12 },
  detailContent: { padding: 16, paddingBottom: 36 },
  backLinkInline: { color: SOCIAL_POP.coral, fontSize: 14, fontWeight: '900', marginBottom: 12 },
  detailHero: {
    minHeight: 390,
    borderRadius: 18,
    backgroundColor: '#101820',
    overflow: 'hidden',
    marginBottom: 14,
  },
  detailHeroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  detailHeroOverlay: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
  },
  detailHeroTitle: { color: '#fff', fontSize: 31, fontWeight: '900', lineHeight: 36 },
  detailSponsor: { color: '#e7f5f8', fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 10 },
  detailPanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e4ecef',
    padding: 16,
    backgroundColor: '#fff',
  },
  detailTag: { color: SOCIAL_POP.coral, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  detailTitle: { color: '#111', fontSize: 30, fontWeight: '900', lineHeight: 34, marginTop: 8 },
  detailBody: { color: '#333', fontSize: 15, lineHeight: 22, marginTop: 8 },
  tripFactsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  tripFact: {
    width: '48%',
    borderRadius: 12,
    backgroundColor: '#f6fafb',
    borderWidth: 1,
    borderColor: '#e2edf1',
    padding: 12,
  },
  tripFactWide: { width: '100%' },
  tripFactLabel: { color: '#667085', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  tripFactValue: { color: '#111', fontSize: 13, fontWeight: '800', lineHeight: 18, marginTop: 5 },
  detailSectionTitle: { color: '#111', fontSize: 18, fontWeight: '900', marginTop: 20, marginBottom: 10 },
  eventCard: {
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e8eef0',
    padding: 12,
    marginBottom: 8,
  },
  eventTitle: { color: '#111', fontSize: 15, fontWeight: '900' },
  eventDetail: { color: '#555', fontSize: 13, lineHeight: 19, marginTop: 5 },
  eventMeta: { color: SOCIAL_POP.coral, fontSize: 12, fontWeight: '900', marginTop: 8 },
  detailBlock: {
    borderTopWidth: 1,
    borderTopColor: '#edf2f4',
    paddingTop: 16,
    marginTop: 16,
  },
  detailBlockTitle: { color: '#111', fontSize: 18, fontWeight: '900' },
  detailBlockBody: { color: '#3f3f46', fontSize: 14, lineHeight: 21, marginTop: 7 },
  intelPanel: {
    borderRadius: 14,
    backgroundColor: '#111',
    padding: 14,
    marginTop: 16,
  },
  intelPanelLabel: { color: '#ffd86f', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  intelPanelTitle: { color: '#fff', fontSize: 18, lineHeight: 22, fontWeight: '900', marginTop: 6 },
  intelPanelBody: { color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 19, marginTop: 6 },
  intelPanelMeta: { color: 'rgba(255,255,255,0.58)', fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 8 },
  answerDetailRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  answerDetailLabel: {
    color: '#ffd86f',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  answerDetailBody: {
    color: 'rgba(255,255,255,0.80)',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  valuePanel: {
    borderRadius: 16,
    backgroundColor: '#fff8f2',
    borderWidth: 1,
    borderColor: 'rgba(232, 63, 93, 0.22)',
    padding: 14,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  valuePanelLabel: { color: '#8a7962', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  valuePanelPrice: { color: '#111', fontSize: 20, lineHeight: 24, fontWeight: '900', marginTop: 4 },
  valueMonthlyPill: {
    borderRadius: 999,
    backgroundColor: SOCIAL_POP.coral,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  valueMonthlyText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  valueLimitation: { width: '100%', color: '#6b6258', fontSize: 11, lineHeight: 16 },
  proposalPanel: { marginTop: 4 },
  proposalComponent: {
    borderRadius: 14,
    backgroundColor: '#fbfaf7',
    borderWidth: 1,
    borderColor: '#e8e1d6',
    padding: 13,
    marginTop: 10,
  },
  proposalComponentKicker: { color: SOCIAL_POP.coral, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  proposalComponentTitle: { color: '#111', fontSize: 15, lineHeight: 19, fontWeight: '900', marginTop: 5 },
  proposalComponentBody: { color: '#555', fontSize: 13, lineHeight: 18, marginTop: 5 },
  proposalComponentPrice: { color: '#6b6258', fontSize: 11, fontWeight: '800', marginTop: 8 },
  assistWatchList: {
    borderRadius: 14,
    backgroundColor: '#eef8fb',
    borderWidth: 1,
    borderColor: '#cbe9f1',
    padding: 14,
    marginTop: 12,
  },
  assistWatchItem: { color: '#315966', fontSize: 12, lineHeight: 18, marginTop: 5 },
  sourcePanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8eef0',
    padding: 14,
    marginTop: 14,
    marginBottom: 12,
    backgroundColor: '#fbfcfc',
  },
  sourcePanelTitle: { color: '#111', fontSize: 14, fontWeight: '900' },
  sourceRow: { borderTopWidth: 1, borderTopColor: '#edf2f4', paddingTop: 10, marginTop: 10 },
  sourceKind: { color: SOCIAL_POP.coral, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  sourceName: { color: '#111', fontSize: 13, fontWeight: '900', marginTop: 4 },
  sourceMeta: { color: '#667085', fontSize: 11, lineHeight: 16, marginTop: 3 },
  sourceLimitation: { color: '#667085', fontSize: 11, lineHeight: 16, marginTop: 3 },
  dealTermsBox: {
    borderRadius: 14,
    backgroundColor: '#fff8ea',
    borderWidth: 1,
    borderColor: '#f0ddad',
    padding: 14,
    marginTop: 14,
    marginBottom: 12,
  },
  dealTermsLabel: { color: '#8b6b34', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  dealTermsText: { color: '#5a4a29', fontSize: 13, lineHeight: 19, marginTop: 6 },
  assistBox: {
    borderRadius: 14,
    backgroundColor: '#eef8fb',
    borderWidth: 1,
    borderColor: '#cbe9f1',
    padding: 14,
    marginTop: 14,
    marginBottom: 12,
  },
  assistBoxTitle: { color: '#0a4f66', fontSize: 15, fontWeight: '900' },
  assistBoxText: { color: '#315966', fontSize: 13, lineHeight: 19, marginTop: 6 },
  assistLimitation: { color: '#667085', fontSize: 11, lineHeight: 16, marginTop: 8 },
  detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  detailPrimaryButton: {
    flex: 1,
    minWidth: 132,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: SOCIAL_POP.coral,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailButtonActive: { backgroundColor: '#e83f5d' },
  detailPrimaryButtonText: { color: '#fff', fontSize: 14, lineHeight: 17, fontWeight: '900', textAlign: 'center' },
  detailSecondaryButton: {
    flexGrow: 1,
    minWidth: 92,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SOCIAL_POP.coral,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailSecondaryButtonWide: {
    flex: 1,
    minWidth: 132,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SOCIAL_POP.coral,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailSecondaryButtonActive: { backgroundColor: '#eef8fb' },
  detailSecondaryButtonText: { color: SOCIAL_POP.coral, fontSize: 14, lineHeight: 17, fontWeight: '900', textAlign: 'center' },
  bookButton: {
    borderRadius: 12,
    backgroundColor: SOCIAL_POP.text,
    minHeight: 50,
    paddingVertical: 15,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  bookButtonText: { color: '#fff', fontSize: 15, lineHeight: 18, fontWeight: '900', textAlign: 'center' },
});

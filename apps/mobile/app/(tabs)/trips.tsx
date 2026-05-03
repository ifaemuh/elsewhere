import { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SOCIAL_POP } from '@/components/AppHeader';
import { LiquidGlassButton } from '@/components/LiquidGlass';
import { useHorizontalTabSwipe } from '@/hooks/useHorizontalTabSwipe';
import { useTripGuides } from '@/hooks/useTrip';
import { getDemoTripHeaderPath, type ActiveTripGuide } from '@elsewhere/shared';
import { api } from '@/services/api';

type TripFilter = 'all' | 'action' | 'upcoming' | 'active' | 'past';

const DAY_MS = 24 * 60 * 60 * 1000;

const FILTERS: Array<{ id: TripFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'action', label: 'Action needed' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'active', label: 'Active' },
  { id: 'past', label: 'Past' },
];

function iso(daysFromNow: number, hour = 12): string {
  const date = new Date(Date.now() + daysFromNow * DAY_MS);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

const DEMO_TRIP_GUIDES: ActiveTripGuide[] = [
  {
    tripId: 'mock-trip-bali',
    tripName: 'Bali 2026',
    tripTagline: 'Rainforest mornings, surf at sunset, and time to breathe.',
    destinationName: 'Bali',
    destinationCountry: 'Indonesia',
    status: 'in_progress',
    travelerCount: 2,
    totalCost: 5210,
    protectedValue: 1180,
    potentialSavings: 0,
    monitoredAt: new Date().toISOString(),
    segments: [],
    opportunities: [
      {
        id: 'opp-bali-connection-risk',
        tripId: 'mock-trip-bali',
        kind: 'connection_risk',
        status: 'action_available',
        title: 'Connection risk detected',
        detail: 'Inbound weather makes your 55-minute connection fragile. Assist found a protected earlier departure.',
        actionLabel: 'Review',
        priority: 1,
        savingsAmount: null,
        protectedValue: 1180,
        deadlineAt: iso(2, 8),
        autoActionable: true,
        citations: [],
      },
    ],
    cancellation: {
      tripId: 'mock-trip-bali',
      summary: 'Assist is monitoring your return timing and same-ticket protection.',
      refundAmount: 0,
      travelCreditAmount: 1180,
      feeAmount: 0,
      decisionWindowEndsAt: iso(2, 20),
      creditExpiresAt: iso(368, 0),
      risks: ['Canceling breaks airline-protected connection handling.'],
    },
  },
  {
    tripId: 'mock-trip-tokyo',
    tripName: 'Tokyo 2026',
    tripTagline: 'Neon, quiet mornings, and a smoother way across the city.',
    destinationName: 'Tokyo',
    destinationCountry: 'Japan',
    status: 'booked',
    travelerCount: 2,
    totalCost: 4820,
    protectedValue: 1730,
    potentialSavings: 342,
    monitoredAt: new Date().toISOString(),
    segments: [],
    opportunities: [
      {
        id: 'opp-tokyo-earlier-flight',
        tripId: 'mock-trip-tokyo',
        kind: 'better_flight',
        status: 'action_available',
        title: 'Earlier nonstop saves $186',
        detail: 'Lower inventory opened on an earlier nonstop. Assist can move both travelers and keep the same arrival day.',
        actionLabel: 'Review',
        priority: 1,
        savingsAmount: 186,
        protectedValue: null,
        deadlineAt: iso(20, 22),
        autoActionable: true,
        citations: [],
      },
    ],
    cancellation: {
      tripId: 'mock-trip-tokyo',
      summary: 'Canceling today keeps most value as airline credit and preserves the hotel refund window.',
      refundAmount: 1290,
      travelCreditAmount: 1730,
      feeAmount: 0,
      decisionWindowEndsAt: iso(19, 16),
      creditExpiresAt: iso(386, 0),
      risks: ['Airfare returns as travel credit, not cash.'],
    },
  },
  {
    tripId: 'mock-trip-paris',
    tripName: 'Paris 2026',
    tripTagline: 'Four nights, better timing, and more room for wonder.',
    destinationName: 'Paris',
    destinationCountry: 'France',
    status: 'booked',
    travelerCount: 4,
    totalCost: 7680,
    protectedValue: 2800,
    potentialSavings: 640,
    monitoredAt: new Date().toISOString(),
    segments: [],
    opportunities: [
      {
        id: 'opp-paris-hotel-rate',
        tripId: 'mock-trip-paris',
        kind: 'hotel_rate_drop',
        status: 'action_available',
        title: 'Same hotel is $454 cheaper',
        detail: 'The refundable public rate dropped for your dates. Assist can cancel and rebook before the penalty window.',
        actionLabel: 'Review',
        priority: 1,
        savingsAmount: 454,
        protectedValue: null,
        deadlineAt: iso(32, 15),
        autoActionable: true,
        citations: [],
      },
    ],
    cancellation: {
      tripId: 'mock-trip-paris',
      summary: 'Canceling today preserves airfare as individual credits and returns the hotel deposit.',
      refundAmount: 2120,
      travelCreditAmount: 2800,
      feeAmount: 0,
      decisionWindowEndsAt: iso(32, 15),
      creditExpiresAt: iso(399, 0),
      risks: ['Airline credit is traveler-specific.'],
    },
  },
  {
    tripId: 'mock-trip-lisbon-past',
    tripName: 'Lisbon 2026',
    tripTagline: 'The city in hills, music, and one last golden hour.',
    destinationName: 'Lisbon',
    destinationCountry: 'Portugal',
    status: 'completed',
    travelerCount: 3,
    totalCost: 4380,
    protectedValue: 84,
    potentialSavings: 0,
    monitoredAt: new Date().toISOString(),
    segments: [],
    opportunities: [
      {
        id: 'opp-lisbon-refund',
        tripId: 'mock-trip-lisbon-past',
        kind: 'credit_protection',
        status: 'monitoring',
        title: '$84 seat-fee refund pending',
        detail: 'Assist is watching a post-trip ancillary refund from the return flight seat change.',
        actionLabel: 'Track refund',
        priority: 4,
        savingsAmount: null,
        protectedValue: 84,
        deadlineAt: iso(21, 12),
        autoActionable: false,
        citations: [],
      },
    ],
    cancellation: {
      tripId: 'mock-trip-lisbon-past',
      summary: 'Trip completed. Assist is only monitoring post-trip refund and credit cleanup.',
      refundAmount: 84,
      travelCreditAmount: 0,
      feeAmount: 0,
      decisionWindowEndsAt: null,
      creditExpiresAt: null,
      risks: ['Refund timing depends on the airline processing queue.'],
    },
  },
];

const MEDIA_CACHE_VERSION = 'elsewhere-trip-card-bg-20260501a';

function localAssetUri(path: string): string {
  if (path.startsWith('http')) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${api.baseUrl}${path}${separator}v=${MEDIA_CACHE_VERSION}`;
}

function tripHeroImage(destinationName: string): string {
  return localAssetUri(getDemoTripHeaderPath(destinationName));
}

function hasActionNeeded(guide: ActiveTripGuide): boolean {
  return guide.opportunities.some((opportunity) =>
    ['action_available', 'watching_deadline', 'blocked'].includes(opportunity.status),
  );
}

function statusRank(guide: ActiveTripGuide): number {
  if (guide.status === 'in_progress') return 0;
  if (guide.status === 'booked' || guide.status === 'draft') return 1;
  return 2;
}

function sortGuides(guides: ActiveTripGuide[]): ActiveTripGuide[] {
  return [...guides].sort((a, b) => {
    const actionDelta = Number(!hasActionNeeded(a)) - Number(!hasActionNeeded(b));
    if (actionDelta !== 0) return actionDelta;

    const statusDelta = statusRank(a) - statusRank(b);
    if (statusDelta !== 0) return statusDelta;

    const priorityA = a.opportunities[0]?.priority ?? 99;
    const priorityB = b.opportunities[0]?.priority ?? 99;
    return priorityA - priorityB;
  });
}

function filterGuides(guides: ActiveTripGuide[], filter: TripFilter): ActiveTripGuide[] {
  const filtered = guides.filter((guide) => {
    if (filter === 'all') return true;
    if (filter === 'upcoming') return guide.status === 'booked' || guide.status === 'draft';
    if (filter === 'active') return guide.status === 'in_progress';
    if (filter === 'past') return guide.status === 'completed';
    if (filter === 'action') return hasActionNeeded(guide);
    return true;
  });

  return sortGuides(filtered);
}

function tripSubtitle(guide: ActiveTripGuide): string {
  if (guide.status === 'completed') {
    return 'Recap ready · memories, refunds, and next-trip ideas';
  }
  if (guide.status === 'in_progress') {
    return 'Today: smart feed, nearby ideas, media, and Assist';
  }
  return 'Upcoming: action items, payments, documents, and free-cancel windows';
}

export default function TripsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const tabSwipeHandlers = useHorizontalTabSwipe('trips');
  const { data: guides, error: guidesError, isLoading } = useTripGuides();
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<TripFilter | null>(null);
  const activeFilter = selectedFilter ?? 'all';
  const guideSource = guides?.length ? guides : DEMO_TRIP_GUIDES;
  const filteredGuides = useMemo(
    () => filterGuides(guideSource, activeFilter),
    [guideSource, activeFilter],
  );
  const reelHeight = screenHeight;
  const chromeBottom = Math.max(102, insets.bottom + 86);

  return (
    <View style={styles.reelsContainer} {...tabSwipeHandlers}>
      <View style={[styles.reelsTopBar, { paddingTop: insets.top + 18 }]}>
        <View>
          <Text style={styles.reelsTitle}>trips</Text>
          <Text style={styles.reelsSubtitle}>plans, alerts, payments, memories</Text>
        </View>
        <View style={styles.reelsTopActions}>
          <LiquidGlassButton
            style={styles.topGlassButton}
            onPress={() => router.push('/trip/intake')}
          >
            <Text style={styles.topGlassButtonText}>book</Text>
          </LiquidGlassButton>
          <LiquidGlassButton
            style={styles.topGlassButton}
            onPress={() => setFilterOpen((open) => !open)}
          >
            <Text style={styles.topGlassButtonText}>{activeFilter === 'all' ? 'filter' : activeFilter}</Text>
          </LiquidGlassButton>
        </View>
      </View>
      {filterOpen && (
        <View style={[styles.filterSheet, { top: insets.top + 86 }]}>
          {FILTERS.map((filter) => {
            const isActive = filter.id === activeFilter;
            return (
              <Pressable
                key={filter.id}
                style={[styles.filterOption, isActive && styles.filterOptionActive]}
                onPress={() => {
                  setSelectedFilter(filter.id);
                  setFilterOpen(false);
                }}
              >
                <Text style={[styles.filterOptionText, isActive && styles.filterOptionTextActive]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {guidesError ? (
        <View style={[styles.offlineNotice, { top: insets.top + 142 }]}>
          <Text style={styles.offlineNoticeText}>Showing demo trips while the trip guide service reconnects.</Text>
        </View>
      ) : null}

      {isLoading && !guideSource.length ? (
        <ActivityIndicator style={styles.loader} />
      ) : !filteredGuides.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No trips here</Text>
          <Text style={styles.emptyText}>Try a different filter or create a trip from Discover.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredGuides}
          keyExtractor={(item) => item.tripId}
          contentContainerStyle={styles.reelsListContent}
          scrollEventThrottle={16}
          pagingEnabled
          snapToInterval={reelHeight}
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TripReelCard
              guide={item}
              height={reelHeight}
              width={screenWidth}
              chromeBottom={chromeBottom}
              onOpen={() => router.push(`/trip/${item.tripId}`)}
            />
          )}
        />
      )}
    </View>
  );
}

function TripReelCard({
  guide,
  height,
  width,
  chromeBottom,
  onOpen,
}: {
  guide: ActiveTripGuide;
  height: number;
  width: number;
  chromeBottom: number;
  onOpen: () => void;
}) {
  const topOpportunity = guide.opportunities[0];
  const actionNeeded = hasActionNeeded(guide);
  const statusLabel = guide.status === 'in_progress'
    ? 'active now'
    : guide.status === 'completed'
      ? 'past trip'
      : 'upcoming';

  return (
    <Pressable style={[styles.tripReel, { height, width }]} onPress={onOpen}>
      <Image source={{ uri: tripHeroImage(guide.destinationName) }} style={styles.tripReelImage} contentFit="cover" />
      <View style={styles.tripReelShade} />
      <View style={styles.tripReelTopFade} />
      <View style={styles.tripReelBottomFade} />

      <View style={[styles.tripActionRail, { bottom: chromeBottom + 72 }]}>
        {['chat', 'schedule', 'assist', 'media', 'pay'].map((label) => (
          <Pressable key={label} style={styles.tripRailAction} onPress={onOpen}>
            <Text style={styles.tripRailDot}>{label.slice(0, 1)}</Text>
            <Text style={styles.tripRailText}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.tripReelMeta}>
        <Text style={styles.tripReelType}>{statusLabel}</Text>
        {actionNeeded ? <Text style={styles.tripReelActionNeeded}>Action needed</Text> : null}
      </View>

      <View style={[styles.tripReelCopy, { bottom: chromeBottom }]}>
        <View style={styles.tripReelCopyGlass}>
        <Text style={styles.tripReelLocation}>{guide.destinationName}, {guide.destinationCountry}</Text>
        <Text style={styles.tripReelTitle}>{guide.tripName}</Text>
        <Text style={styles.tripReelTagline} numberOfLines={2}>
          {guide.tripTagline ?? tripSubtitle(guide)}
        </Text>
        <Text style={styles.tripReelSubtitle} numberOfLines={2}>
          {topOpportunity?.title ?? tripSubtitle(guide)}
        </Text>

        <Text style={styles.tripReelMetaLine}>
          {guide.travelerCount} travelers · {guide.opportunities.length} alerts · ${guide.potentialSavings.toLocaleString()} watched savings
        </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: SOCIAL_POP.background },
  reelsContainer: { flex: 1, backgroundColor: '#050506' },
  reelsListContent: { backgroundColor: '#050506' },
  reelsTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  reelsTitle: {
    color: '#fff',
    fontSize: 22,
    lineHeight: 25,
    fontWeight: '900',
    textTransform: 'lowercase',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 12,
  },
  reelsSubtitle: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    marginTop: 1,
    textShadowColor: 'rgba(0,0,0,0.42)',
    textShadowRadius: 10,
  },
  reelsTopActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  topGlassButton: { minHeight: 34, paddingHorizontal: 12, paddingVertical: 8 },
  topGlassButtonText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    textTransform: 'lowercase',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  headerText: { flex: 1 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#666', lineHeight: 21 },
  filterButton: {
    borderWidth: 1,
    borderColor: '#dfe8ec',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fbfaf7',
  },
  filterButtonText: { color: '#111', fontSize: 13, fontWeight: '800' },
  filterSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 22,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterOption: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.20)' },
  filterOptionActive: { backgroundColor: SOCIAL_POP.coral },
  filterOptionText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  filterOptionTextActive: { color: '#fff' },
  offlineNotice: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 28,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 79, 109, 0.22)',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  offlineNoticeText: {
    color: '#6b6258',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  loader: { marginTop: 40 },
  tripReel: {
    backgroundColor: '#050506',
    overflow: 'hidden',
  },
  tripReelImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  tripReelShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  tripReelTopFade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  tripReelBottomFade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  tripReelMeta: {
    position: 'absolute',
    top: 116,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  tripReelType: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 12,
  },
  tripReelActionNeeded: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 12,
  },
  tripActionRail: {
    position: 'absolute',
    right: 12,
    gap: 10,
    alignItems: 'center',
  },
  tripRailAction: { alignItems: 'center', gap: 3 },
  tripRailDot: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    color: '#fff',
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingTop: 11,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  tripRailText: {
    color: '#fff',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 10,
  },
  tripReelCopy: {
    position: 'absolute',
    left: 16,
    right: 82,
  },
  tripReelCopyGlass: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: 26,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.20)',
    overflow: 'hidden',
  },
  tripReelLocation: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowRadius: 12,
  },
  tripReelTitle: {
    color: '#fff',
    fontSize: 30,
    lineHeight: 33,
    fontWeight: '900',
    marginTop: 8,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowRadius: 16,
  },
  tripReelTagline: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
    marginTop: 8,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 10,
  },
  tripReelSubtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    marginTop: 8,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 10,
  },
  tripReelMetaLine: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    marginTop: 11,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 10,
  },
  listContent: { paddingBottom: 96 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: '#777', textAlign: 'center', lineHeight: 20 },
  card: {
    padding: 16,
    backgroundColor: SOCIAL_POP.text,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.20)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  cardBackgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  cardImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  recapTopper: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2edf1',
  },
  recapEyebrow: { color: SOCIAL_POP.coral, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  recapTitle: { color: '#111', fontSize: 16, fontWeight: '800', marginTop: 4 },
  recapDetail: { color: '#666', fontSize: 13, lineHeight: 18, marginTop: 5 },
  actionTopper: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
  },
  actionTopperText: { color: SOCIAL_POP.coral, fontSize: 12, fontWeight: '800' },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    padding: 12,
    marginHorizontal: -4,
    marginTop: -4,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.20)',
  },
  cardTitle: { fontSize: 19, fontWeight: '800', color: '#fff' },
  cardCountry: { color: 'rgba(255, 255, 255, 0.78)', marginTop: 2, fontSize: 13, fontWeight: '700' },
  cardTagline: { color: '#fff', marginTop: 12, lineHeight: 20, fontSize: 15, fontWeight: '700' },
  cardSubtitle: { color: 'rgba(255, 255, 255, 0.74)', marginTop: 6, lineHeight: 18, fontSize: 13 },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: { color: '#4d463c', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  metricsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  metric: { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.24)', borderRadius: 12, padding: 10 },
  metricLabel: { fontSize: 11, color: 'rgba(255, 255, 255, 0.72)', marginBottom: 4, fontWeight: '700' },
  metricValue: { fontSize: 16, color: '#fff', fontWeight: '900' },
  opportunityStrip: { marginTop: 12, borderLeftWidth: 3, borderLeftColor: SOCIAL_POP.coral, paddingLeft: 10 },
  opportunityTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  opportunityDetail: { fontSize: 13, color: 'rgba(255, 255, 255, 0.74)', marginTop: 3, lineHeight: 18 },
  clearText: { marginTop: 12, color: 'rgba(255, 255, 255, 0.76)', fontSize: 13, fontWeight: '700' },
});

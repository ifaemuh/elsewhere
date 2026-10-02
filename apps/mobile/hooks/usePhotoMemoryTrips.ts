import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { create } from 'zustand';
import type {
  ActiveTripGuide,
  PhotoLibraryTripCluster,
  PhotoMemoryTrip,
  TripCoverMedia,
  TripMediaItem,
  TripRoomData,
} from '@elsewhere/shared';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SCAN_ASSETS = 180;
const MAX_CLUSTER_MEDIA = 28;

type PhotoPermissionState = 'unknown' | 'granted' | 'limited' | 'denied';

interface ScannedAsset {
  id: string;
  uri: string;
  mediaType: 'photo' | 'video';
  creationTime: number;
  width: number | null;
  height: number | null;
  latitude: number | null;
  longitude: number | null;
}

type DetailedMediaAsset = MediaLibrary.Asset & {
  localUri?: string;
  location?: MediaLibrary.Location;
};

interface KnownPlace {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
}

interface PhotoMemoryTripState {
  trips: PhotoMemoryTrip[];
  clusters: PhotoLibraryTripCluster[];
  permissionState: PhotoPermissionState;
  isScanning: boolean;
  lastScanMessage: string | null;
  lastScannedAt: string | null;
  scanPhotoLibraryTrips: () => Promise<PhotoMemoryTrip[]>;
  approveTripForDiscover: (tripId: string) => void;
  rejectTrip: (tripId: string) => void;
}

const KNOWN_PLACES: KnownPlace[] = [
  { name: 'Los Angeles', country: 'United States', latitude: 34.0522, longitude: -118.2437, radiusKm: 95 },
  { name: 'Anaheim', country: 'United States', latitude: 33.8366, longitude: -117.9143, radiusKm: 35 },
  { name: 'Las Vegas', country: 'United States', latitude: 36.1716, longitude: -115.1391, radiusKm: 70 },
  { name: 'Miami', country: 'United States', latitude: 25.7617, longitude: -80.1918, radiusKm: 85 },
  { name: 'New York', country: 'United States', latitude: 40.7128, longitude: -74.006, radiusKm: 85 },
  { name: 'Paris', country: 'France', latitude: 48.8566, longitude: 2.3522, radiusKm: 90 },
  { name: 'Lisbon', country: 'Portugal', latitude: 38.7223, longitude: -9.1393, radiusKm: 80 },
  { name: 'Tokyo', country: 'Japan', latitude: 35.6762, longitude: 139.6503, radiusKm: 105 },
  { name: 'Kyoto', country: 'Japan', latitude: 35.0116, longitude: 135.7681, radiusKm: 70 },
  { name: 'Bali', country: 'Indonesia', latitude: -8.3405, longitude: 115.092, radiusKm: 95 },
  { name: 'Santorini', country: 'Greece', latitude: 36.3932, longitude: 25.4615, radiusKm: 35 },
  { name: 'Marrakech', country: 'Morocco', latitude: 31.6295, longitude: -7.9811, radiusKm: 75 },
  { name: 'Iceland', country: 'Iceland', latitude: 64.9631, longitude: -19.0208, radiusKm: 260 },
  { name: 'Mexico City', country: 'Mexico', latitude: 19.4326, longitude: -99.1332, radiusKm: 90 },
  { name: 'Seoul', country: 'South Korea', latitude: 37.5665, longitude: 126.978, radiusKm: 80 },
  { name: 'Rome', country: 'Italy', latitude: 41.9028, longitude: 12.4964, radiusKm: 80 },
  { name: 'Barcelona', country: 'Spain', latitude: 41.3874, longitude: 2.1686, radiusKm: 75 },
  { name: 'London', country: 'United Kingdom', latitude: 51.5072, longitude: -0.1276, radiusKm: 95 },
];

function permissionStateFrom(permission: MediaLibrary.PermissionResponse): PhotoPermissionState {
  if (!permission.granted) return 'denied';
  const accessPrivileges = (permission as { accessPrivileges?: string }).accessPrivileges;
  if (accessPrivileges === 'limited') return 'limited';
  return 'granted';
}

function haversineKm(
  a: { latitude: number | null; longitude: number | null },
  b: { latitude: number | null; longitude: number | null },
): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const radius = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const root = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(root));
}

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString([], { day: 'numeric', year: 'numeric' })}`;
  }
  return `${start.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} - ${end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function clusterCenter(assets: ScannedAsset[]): { latitude: number | null; longitude: number | null } {
  const located = assets.filter((asset) => asset.latitude != null && asset.longitude != null);
  if (!located.length) return { latitude: null, longitude: null };
  return {
    latitude: located.reduce((sum, asset) => sum + asset.latitude!, 0) / located.length,
    longitude: located.reduce((sum, asset) => sum + asset.longitude!, 0) / located.length,
  };
}

function inferKnownPlace(center: { latitude: number | null; longitude: number | null }): KnownPlace | null {
  if (center.latitude == null || center.longitude == null) return null;
  return KNOWN_PLACES
    .map((place) => ({
      place,
      distance: haversineKm(center, place) ?? Number.POSITIVE_INFINITY,
    }))
    .filter(({ place, distance }) => distance <= place.radiusKm)
    .sort((a, b) => a.distance - b.distance)[0]?.place ?? null;
}

function stableId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

async function loadAssetDetails(assets: MediaLibrary.Asset[]): Promise<ScannedAsset[]> {
  const output: ScannedAsset[] = [];
  for (let index = 0; index < assets.length; index += 12) {
    const batch = assets.slice(index, index + 12);
    const details: DetailedMediaAsset[] = await Promise.all(
      batch.map(async (asset) => {
        try {
          return await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: false }) as DetailedMediaAsset;
        } catch {
          return asset as DetailedMediaAsset;
        }
      }),
    );
    output.push(...details.map((asset) => ({
      id: asset.id,
      uri: asset.localUri ?? asset.uri,
      mediaType: (asset.mediaType === MediaLibrary.MediaType.video ? 'video' : 'photo') as ScannedAsset['mediaType'],
      creationTime: asset.creationTime,
      width: asset.width ?? null,
      height: asset.height ?? null,
      latitude: asset.location?.latitude ?? null,
      longitude: asset.location?.longitude ?? null,
    })));
  }
  return output;
}

function shouldSplitCluster(current: ScannedAsset[], next: ScannedAsset): boolean {
  const last = current[current.length - 1];
  if (!last) return false;
  const gapMs = next.creationTime - last.creationTime;
  const distanceKm = haversineKm(
    { latitude: last.latitude, longitude: last.longitude },
    { latitude: next.latitude, longitude: next.longitude },
  );

  if (distanceKm != null && distanceKm > 800) return true;
  if (distanceKm != null && distanceKm > 140 && gapMs > 8 * 60 * 60 * 1000) return true;
  if (gapMs > 72 * 60 * 60 * 1000) return true;
  if (distanceKm == null && gapMs > 54 * 60 * 60 * 1000) return true;
  return false;
}

function clusterScannedAssets(assets: ScannedAsset[]): ScannedAsset[][] {
  const sorted = [...assets].sort((a, b) => a.creationTime - b.creationTime);
  const clusters: ScannedAsset[][] = [];
  let current: ScannedAsset[] = [];

  for (const asset of sorted) {
    if (current.length && shouldSplitCluster(current, asset)) {
      clusters.push(current);
      current = [];
    }
    current.push(asset);
  }
  if (current.length) clusters.push(current);

  const meaningful = clusters.filter((cluster) => {
    const spanMs = cluster[cluster.length - 1].creationTime - cluster[0].creationTime;
    return cluster.length >= 4 || (cluster.length >= 3 && spanMs >= 5 * 60 * 60 * 1000);
  });

  if (meaningful.length) return meaningful;
  return sorted.length >= 3 ? [sorted.slice(0, Math.min(sorted.length, MAX_CLUSTER_MEDIA))] : [];
}

function coverMediaFromAssets(assets: ScannedAsset[]): TripCoverMedia[] {
  const photosFirst = [
    ...assets.filter((asset) => asset.mediaType === 'photo'),
    ...assets.filter((asset) => asset.mediaType === 'video'),
  ];
  return photosFirst.slice(0, MAX_CLUSTER_MEDIA).map((asset): TripCoverMedia => ({
    id: `cover-${asset.id}`,
    localAssetId: asset.id,
    uri: asset.uri,
    mediaType: asset.mediaType,
    capturedAt: new Date(asset.creationTime).toISOString(),
    width: asset.width,
    height: asset.height,
  }));
}

function clusterToPhotoTrip(cluster: ScannedAsset[], index: number): { cluster: PhotoLibraryTripCluster; trip: PhotoMemoryTrip } {
  const center = clusterCenter(cluster);
  const knownPlace = inferKnownPlace(center);
  const startDate = new Date(cluster[0].creationTime).toISOString();
  const endDate = new Date(cluster[cluster.length - 1].creationTime).toISOString();
  const year = new Date(startDate).getFullYear();
  const destinationName = knownPlace?.name ?? 'Photo Trip';
  const destinationCountry = knownPlace?.country ?? 'Memories';
  const dateRangeLabel = formatDateRange(startDate, endDate);
  const photoCount = cluster.filter((asset) => asset.mediaType === 'photo').length;
  const videoCount = cluster.filter((asset) => asset.mediaType === 'video').length;
  const mediaCount = cluster.length;
  const locationLabel = knownPlace
    ? `${knownPlace.name}, ${knownPlace.country}`
    : center.latitude != null && center.longitude != null
      ? `near ${center.latitude.toFixed(1)}, ${center.longitude.toFixed(1)}`
      : 'from your camera roll';
  const confidence = knownPlace ? 'high' : center.latitude != null ? 'medium' : 'low';
  const id = `photo-trip-${stableId(`${destinationName}-${year}-${cluster[0].id}-${index}`)}`;
  const coverMedia = coverMediaFromAssets(cluster);
  const tagline = knownPlace
    ? `${mediaCount} moments from ${dateRangeLabel}, rebuilt into a private Elsewhere memory.`
    : `${mediaCount} camera-roll moments clustered by time, ready to name and turn into a trip memory.`;

  const photoCluster: PhotoLibraryTripCluster = {
    id: `cluster-${id}`,
    title: `${destinationName} ${year}`,
    tagline,
    destinationName,
    destinationCountry,
    dateRangeLabel,
    startDate,
    endDate,
    centerLatitude: center.latitude,
    centerLongitude: center.longitude,
    confidence,
    mediaCount,
    photoCount,
    videoCount,
    localAssetIds: cluster.map((asset) => asset.id),
    coverMedia,
    approvalStatus: 'added_to_trips',
    privacyLabel: 'Private on this phone until you approve sharing, syncing, recap use, or AI generation.',
    createdAt: new Date().toISOString(),
  };

  return {
    cluster: photoCluster,
    trip: {
      id,
      source: 'photo_library_inferred',
      clusterId: photoCluster.id,
      title: `${destinationName} ${year}`,
      tagline,
      destinationName,
      destinationCountry,
      status: 'completed',
      travelerCount: 1,
      dateRangeLabel,
      startDate,
      endDate,
      mediaCount,
      photoCount,
      videoCount,
      coverMedia,
      privacyLabel: photoCluster.privacyLabel,
      approvalStatus: 'added_to_trips',
      discoverPrompt: `Turn this private ${locationLabel} memory into a Discover reel and suggest a similar trip only after approval.`,
      recapPrompt: `Build a nostalgic recap from ${mediaCount} approved ${destinationName} media items captured ${dateRangeLabel}.`,
    },
  };
}

async function scanPhotoLibrary(): Promise<{ trips: PhotoMemoryTrip[]; clusters: PhotoLibraryTripCluster[]; permissionState: PhotoPermissionState; message: string }> {
  // expo-media-library is native-only. On web (dev/testing target) skip the
  // scan gracefully so the rest of the UI can be iterated in a browser.
  if (Platform.OS === 'web') {
    return {
      trips: [],
      clusters: [],
      permissionState: 'denied',
      message: 'Photo-library scanning is unavailable on web. Run on a device or simulator to infer photo trips.',
    };
  }

  const permission = await MediaLibrary.requestPermissionsAsync();
  const permissionState = permissionStateFrom(permission);
  if (!permission.granted) {
    return {
      trips: [],
      clusters: [],
      permissionState,
      message: 'Photo access is off. Elsewhere cannot infer past trips until Photos permission is granted.',
    };
  }

  const page = await MediaLibrary.getAssetsAsync({
    first: MAX_SCAN_ASSETS,
    mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
    sortBy: [MediaLibrary.SortBy.creationTime],
  });
  const details = await loadAssetDetails(page.assets);
  const clusters = clusterScannedAssets(details)
    .sort((a, b) => b[b.length - 1].creationTime - a[a.length - 1].creationTime)
    .slice(0, 6)
    .map(clusterToPhotoTrip);

  const trips = clusters.map((item) => item.trip);
  const tripClusters = clusters.map((item) => item.cluster);
  const message = trips.length
    ? `Built ${trips.length} private photo trip${trips.length === 1 ? '' : 's'} from ${details.length} local item${details.length === 1 ? '' : 's'}.`
    : `Scanned ${details.length} local item${details.length === 1 ? '' : 's'}, but did not find a strong trip cluster yet.`;

  return { trips, clusters: tripClusters, permissionState, message };
}

export const usePhotoMemoryTrips = create<PhotoMemoryTripState>((set, get) => ({
  trips: [],
  clusters: [],
  permissionState: 'unknown',
  isScanning: false,
  lastScanMessage: null,
  lastScannedAt: null,
  scanPhotoLibraryTrips: async () => {
    set({ isScanning: true, lastScanMessage: null });
    try {
      const result = await scanPhotoLibrary();
      set({
        trips: result.trips,
        clusters: result.clusters,
        permissionState: result.permissionState,
        isScanning: false,
        lastScanMessage: result.message,
        lastScannedAt: new Date().toISOString(),
      });
      return result.trips;
    } catch (error) {
      const message = (error as Error).message;
      set({ isScanning: false, lastScanMessage: message });
      return get().trips;
    }
  },
  approveTripForDiscover: (tripId) => set((state) => ({
    trips: state.trips.map((trip) => trip.id === tripId ? { ...trip, approvalStatus: 'approved_for_discover' } : trip),
    clusters: state.clusters.map((cluster) => cluster.id === state.trips.find((trip) => trip.id === tripId)?.clusterId
      ? { ...cluster, approvalStatus: 'approved_for_discover' }
      : cluster),
  })),
  rejectTrip: (tripId) => set((state) => ({
    trips: state.trips.filter((trip) => trip.id !== tripId),
    clusters: state.clusters.filter((cluster) => cluster.id !== state.trips.find((trip) => trip.id === tripId)?.clusterId),
  })),
}));

export function usePhotoMemoryTrip(tripId: string | undefined): PhotoMemoryTrip | undefined {
  return usePhotoMemoryTrips(useCallback((state) => state.trips.find((trip) => trip.id === tripId), [tripId]));
}

export function photoMemoryTripToGuide(trip: PhotoMemoryTrip): ActiveTripGuide {
  return {
    tripId: trip.id,
    tripName: trip.title,
    tripTagline: trip.tagline,
    destinationName: trip.destinationName,
    destinationCountry: trip.destinationCountry,
    source: 'photo_library_inferred',
    sourceLabel: 'from Photos',
    memoryClusterId: trip.clusterId,
    coverMedia: trip.coverMedia,
    status: 'completed',
    travelerCount: trip.travelerCount,
    totalCost: 0,
    protectedValue: 0,
    potentialSavings: 0,
    monitoredAt: new Date().toISOString(),
    segments: [],
    opportunities: [],
    cancellation: {
      tripId: trip.id,
      summary: 'Memory trip. No live booking is attached yet; Elsewhere can use this to plan a similar trip when you approve.',
      refundAmount: 0,
      travelCreditAmount: 0,
      feeAmount: 0,
      decisionWindowEndsAt: null,
      creditExpiresAt: null,
      risks: ['Camera-roll media stays private on this phone until approved.'],
    },
  };
}

export function photoMemoryTripToRoom(trip: PhotoMemoryTrip): TripRoomData {
  const media: TripMediaItem[] = trip.coverMedia.map((item, index) => ({
    id: `photo-memory-media-${item.localAssetId ?? index}`,
    tripId: trip.id,
    ownerUserId: 'local-user',
    ownerName: 'You',
    source: 'photo_library',
    mediaType: item.mediaType,
    status: index < 8 ? 'recap_selected' : 'candidate',
    caption: index === 0 ? `${trip.title} cover moment` : `${trip.destinationName} memory ${index + 1}`,
    capturedAt: item.capturedAt,
    uploadedAt: new Date().toISOString(),
    sourceUrl: item.uri,
    thumbnailUrl: item.uri,
    socialProvider: null,
    socialPostUrl: null,
    socialAuthorHandle: null,
    location: {
      name: trip.destinationName === 'Photo Trip' ? null : trip.destinationName,
      latitude: null,
      longitude: null,
    },
    matchedPlaceId: null,
    matchedScheduleItemId: null,
    matchConfidence: trip.destinationName === 'Photo Trip' ? 'low' : 'medium',
    matchReasons: ['Photo library time window', 'Private local candidate', trip.dateRangeLabel],
    visibleToTrip: index < 8,
    eligibleForRecap: index < 12,
  }));

  return {
    feed: [
      {
        id: `${trip.id}-memory-recap`,
        tripId: trip.id,
        kind: 'recap',
        priority: 'high',
        title: 'Memory recap draft',
        subtitle: `${trip.mediaCount} camera-roll moments`,
        detail: `${trip.title} was inferred from your native Photos library. Approve selected media to turn it into a private recap or a Discover memory reel.`,
        ctaLabel: 'Review media',
        relatedEntityId: media[0]?.id ?? null,
        startsAt: trip.startDate,
        expiresAt: null,
        statusLabel: 'Private',
      },
      {
        id: `${trip.id}-similar-trip`,
        tripId: trip.id,
        kind: 'planner_suggestion',
        priority: 'normal',
        title: 'Plan a similar trip',
        subtitle: trip.destinationName,
        detail: 'Elsewhere can use this memory pattern to suggest a new trip with flights, stays, activities, monthly pricing, and Assist monitoring.',
        ctaLabel: 'Plan similar',
        relatedEntityId: null,
        startsAt: null,
        expiresAt: null,
        statusLabel: 'Ready',
      },
    ],
    schedule: [
      {
        id: `${trip.id}-memory-window`,
        tripId: trip.id,
        title: trip.title,
        kind: 'custom',
        startsAt: trip.startDate,
        endsAt: trip.endDate,
        place: {
          name: trip.destinationName === 'Photo Trip' ? 'Memory location' : trip.destinationName,
          neighborhood: null,
          latitude: null,
          longitude: null,
        },
        participants: [{ userId: 'local-user', name: 'You', status: 'going' }],
        reservationStatus: 'none',
        bookingUrl: null,
        costEstimate: null,
        notes: `Inferred from Photos · ${trip.dateRangeLabel}`,
      },
    ],
    suggestions: [
      {
        id: `${trip.id}-recreate`,
        tripId: trip.id,
        kind: 'experience',
        title: `Recreate ${trip.destinationName === 'Photo Trip' ? 'this trip' : trip.destinationName}`,
        summary: 'Use the media, timing, and places you already loved as the creative brief for a new trip.',
        place: {
          name: trip.destinationName,
          neighborhood: null,
          latitude: null,
          longitude: null,
        },
        distanceText: 'Based on memories',
        travelTimeText: 'Trip planning',
        priceLevel: null,
        startsAt: null,
        availability: 'Ready to curate',
        weatherFit: null,
        preferenceFit: 'High: based on your own camera roll',
        bookable: false,
        source: 'Photo library intelligence',
        confidence: trip.destinationName === 'Photo Trip' ? 'medium' : 'high',
      },
    ],
    votes: [],
    actionItems: [
      {
        id: `${trip.id}-privacy`,
        tripId: trip.id,
        kind: 'media',
        title: 'Approve media before sharing',
        detail: trip.privacyLabel,
        assignedUserIds: ['local-user'],
        dueAt: null,
        status: 'open',
        relatedEntityId: media[0]?.id ?? null,
        notificationState: 'quiet',
      },
    ],
    paymentSummary: {
      tripId: trip.id,
      totalCost: 0,
      paidAmount: 0,
      dueAmount: 0,
      monthlyPlanAmount: null,
      nextPaymentDueAt: null,
      travelCredits: 0,
      refundsPending: 0,
      travelers: [{ userId: 'local-user', name: 'You', totalDue: 0, paid: 0, nextDueAt: null, status: 'paid' }],
    },
    media,
    chatProvider: {
      tripId: trip.id,
      provider: 'mock',
      channelId: `${trip.id}-memory-room`,
      configured: true,
      supportsGifs: true,
      supportsModeration: false,
      detail: 'Memory trip chat is local demo mode until this trip is synced.',
    },
    chatSuggestions: [
      {
        id: `${trip.id}-share-memory`,
        tripId: trip.id,
        kind: 'activity',
        title: 'Turn this into a group memory',
        detail: 'Invite friends later or keep this private as your own trip archive.',
        confidence: 'medium',
        sourceMessageIds: [],
        actionLabel: 'Invite later',
        relatedEntityId: null,
      },
    ],
    messages: [
      {
        id: `${trip.id}-system-message`,
        tripId: trip.id,
        senderUserId: 'system',
        senderName: 'Elsewhere',
        body: `I found ${trip.mediaCount} Photos items from ${trip.dateRangeLabel}. They stay private until you approve sharing or recap use.`,
        providerMessageId: null,
        relatedCardId: `${trip.id}-memory-recap`,
        attachments: [],
        intentSignals: ['photo_memory', 'privacy_required', 'recap_candidate'],
        createdAt: new Date().toISOString(),
      },
    ],
    notifications: [
      {
        id: `${trip.id}-private-notice`,
        tripId: trip.id,
        title: 'Private photo trip created',
        detail: 'Nothing has been uploaded. Review media before using it in Discover, recaps, or AI generation.',
        priority: 'quiet',
        channel: 'in_app',
        relatedEntityId: null,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

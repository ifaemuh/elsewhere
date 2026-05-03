import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable, useWindowDimensions, Share, Linking, Modal } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useEvent } from 'expo';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SOCIAL_POP } from '@/components/AppHeader';
import { useLiveTripIntelligence, useTripGuide, useTripRoom } from '@/hooks/useTrip';
import { api } from '@/services/api';
import type {
  AssistTripOpportunity,
  TripActionItem,
  TripChatProvider,
  TripChatSuggestion,
  TripFeedCard,
  TripMediaItem,
  TripMessage,
  PreviewVideoJob,
  SocialPublishingStatus,
  TripPlannerSuggestion,
  TripScheduleItem,
  TripVote,
} from '@elsewhere/shared';
import { getDemoTripHeaderPath, getDemoTripSuggestionAsset, getDemoTripSuggestionGallery } from '@elsewhere/shared';

type TripPage = 'chat' | 'feed' | 'media' | 'schedule' | 'explore' | 'payments' | 'checklist';
const MEDIA_CACHE_VERSION = 'elsewhere-live-media-20260501b';

const TRIP_PAGES: Array<{ id: TripPage; label: string }> = [
  { id: 'chat', label: 'Chat' },
  { id: 'feed', label: 'Smart Feed' },
  { id: 'media', label: 'Media' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'explore', label: 'Explore' },
  { id: 'payments', label: 'Payments' },
  { id: 'checklist', label: 'Checklist' },
];

function pageIndex(page: TripPage): number {
  return TRIP_PAGES.findIndex((item) => item.id === page);
}

function formatDate(value: string | null): string {
  if (!value) return 'No deadline';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTime(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function cardTone(card: TripFeedCard): string {
  if (card.priority === 'urgent') return '#e53e3e';
  if (card.priority === 'high') return SOCIAL_POP.coral;
  if (card.priority === 'normal') return '#2f855a';
  return '#667085';
}

function opportunityTone(opportunity: AssistTripOpportunity): string {
  if (opportunity.status === 'blocked') return '#e53e3e';
  if (opportunity.status === 'watching_deadline') return '#dd6b20';
  if (opportunity.autoActionable) return SOCIAL_POP.coral;
  return '#38a169';
}

function readableKind(value: string): string {
  return value.replace(/_/g, ' ');
}

function mediaUri(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith('http')) return value;
  const separator = value.includes('?') ? '&' : '?';
  return `${api.baseUrl}${value}${separator}v=${MEDIA_CACHE_VERSION}`;
}

function localAssetUri(path: string): string {
  if (path.startsWith('http')) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${api.baseUrl}${path}${separator}v=${MEDIA_CACHE_VERSION}`;
}

function imageForDestination(destinationName: string): string {
  return localAssetUri(getDemoTripHeaderPath(destinationName));
}

function imageForSuggestion(suggestion: TripPlannerSuggestion, destinationName: string): string {
  return localAssetUri(getDemoTripSuggestionAsset(suggestion.id, destinationName).mediaUrl);
}

function galleryForSuggestion(suggestion: TripPlannerSuggestion, destinationName: string): string[] {
  return getDemoTripSuggestionGallery(suggestion.id, destinationName).map(localAssetUri);
}

function socialLabel(item: TripMediaItem): string {
  if (item.socialProvider && item.socialAuthorHandle) return `${item.socialProvider} · ${item.socialAuthorHandle}`;
  if (item.socialProvider) return item.socialProvider;
  return readableKind(item.source);
}

function SmartFeedCard({ card }: { card: TripFeedCard }) {
  const tone = cardTone(card);
  return (
    <View style={styles.feedCard}>
      <View style={styles.feedHeader}>
        <Text style={[styles.feedKind, { color: tone }]}>{readableKind(card.kind)}</Text>
        {card.statusLabel ? <Text style={styles.feedStatus}>{card.statusLabel}</Text> : null}
      </View>
      <Text style={styles.feedTitle}>{card.title}</Text>
      {card.subtitle ? <Text style={styles.feedSubtitle}>{card.subtitle}</Text> : null}
      <Text style={styles.feedDetail}>{card.detail}</Text>
      <View style={styles.feedFooter}>
        <Text style={styles.feedTime}>{card.startsAt ? formatDate(card.startsAt) : card.expiresAt ? `By ${formatDate(card.expiresAt)}` : 'Now'}</Text>
        {card.ctaLabel ? (
          <View style={[styles.smallCta, { backgroundColor: tone }]}>
            <Text style={styles.smallCtaText}>{card.ctaLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ScheduleCard({
  item,
  onJoinLater,
  onGoing,
}: {
  item: TripScheduleItem;
  onJoinLater: () => void;
  onGoing: () => void;
}) {
  const going = item.participants.filter((p) => p.status === 'going').map((p) => p.name).join(', ');
  const joinLater = item.participants.filter((p) => p.status === 'join_later').map((p) => p.name).join(', ');
  const resting = item.participants.filter((p) => p.status === 'resting').map((p) => p.name).join(', ');
  const userStatus = item.participants.find((p) => p.userId === 'dev-user-000')?.status;

  return (
    <View style={styles.compactCard}>
      <View style={styles.rowBetween}>
        <Text style={styles.compactTitle}>{item.title}</Text>
        <Text style={styles.compactMeta}>{formatTime(item.startsAt)}</Text>
      </View>
      <Text style={styles.compactDetail}>
        {item.place?.name ?? 'Location pending'} · {readableKind(item.reservationStatus)}
      </Text>
      {going ? <Text style={styles.peopleLine}>Going: {going}</Text> : null}
      {joinLater ? <Text style={styles.peopleLine}>Join later: {joinLater}</Text> : null}
      {resting ? <Text style={styles.peopleLine}>Resting: {resting}</Text> : null}
      {item.notes ? <Text style={styles.noteLine}>{item.notes}</Text> : null}
      <View style={styles.inlineButtonRow}>
        <Pressable
          style={[styles.secondaryButton, userStatus === 'going' && styles.secondaryButtonActive]}
          onPress={onGoing}
        >
          <Text
            style={[styles.secondaryButtonText, userStatus === 'going' && styles.secondaryButtonTextActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            I’m going
          </Text>
        </Pressable>
        <Pressable
          style={[styles.secondaryButton, userStatus === 'join_later' && styles.secondaryButtonActive]}
          onPress={onJoinLater}
        >
          <Text
            style={[styles.secondaryButtonText, userStatus === 'join_later' && styles.secondaryButtonTextActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            Join later
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SuggestionCard({
  suggestion,
  imageUrl,
  onPress,
}: {
  suggestion: TripPlannerSuggestion;
  imageUrl: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.exploreCard} onPress={onPress}>
      <View style={styles.exploreImageFrame}>
        <Image source={{ uri: imageUrl }} style={styles.exploreImage} contentFit="cover" />
        <View style={styles.mediaThumbOverlay} />
        <Text style={styles.exploreKind}>{readableKind(suggestion.kind)}</Text>
      </View>
      <View style={styles.exploreBody}>
        <View style={styles.rowBetween}>
          <Text style={styles.compactTitle}>{suggestion.title}</Text>
          <Text style={styles.compactMeta}>{suggestion.priceLevel ?? 'Watch'}</Text>
        </View>
        <Text style={styles.compactDetail}>{suggestion.summary}</Text>
        <Text style={styles.peopleLine}>
          {suggestion.distanceText} · {suggestion.travelTimeText} · {suggestion.availability}
        </Text>
        {suggestion.preferenceFit ? <Text style={styles.noteLine}>{suggestion.preferenceFit}</Text> : null}
        <View style={styles.exploreActions}>
          <View style={styles.explorePrimaryCta}>
            <Text
              style={styles.explorePrimaryCtaText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {suggestion.bookable ? 'Reserve' : 'Add to plan'}
            </Text>
          </View>
          <View style={styles.exploreSecondaryCta}>
            <Text
              style={styles.exploreSecondaryCtaText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              Details
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function ExploreDetailSheet({
  suggestion,
  imageUrl,
  galleryUrls,
  onClose,
}: {
  suggestion: TripPlannerSuggestion;
  imageUrl: string;
  galleryUrls: string[];
  onClose: () => void;
}) {
  const sources = ['Reddit', 'Yelp', 'Tripadvisor', suggestion.source].filter(Boolean) as string[];
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.exploreSheet}>
          <View style={styles.rowBetween}>
            <View style={styles.headerText}>
              <Text style={styles.storyOwner}>{suggestion.title}</Text>
              <Text style={styles.storyMeta}>{suggestion.place.neighborhood ?? suggestion.place.name} · {suggestion.distanceText}</Text>
            </View>
            <Pressable style={styles.closePill} onPress={onClose}>
              <Text style={styles.closePillText}>Close</Text>
            </Pressable>
          </View>
          <ScrollView nestedScrollEnabled style={styles.exploreSheetScroll} showsVerticalScrollIndicator={false}>
            <Image source={{ uri: imageUrl }} style={styles.exploreSheetHero} contentFit="cover" />
            <Text style={styles.exploreSheetTitle}>AI summary</Text>
            <Text style={styles.exploreSheetText}>
              {suggestion.summary} Elsewhere ranks this because it fits current availability, distance, weather, group preferences, and the open schedule window.
            </Text>
            <Text style={styles.exploreSheetTitle}>Source signals</Text>
            <View style={styles.sourceRail}>
              {sources.map((source) => (
                <View key={source} style={styles.sourcePill}>
                  <Text style={styles.sourcePillText}>{source}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.exploreSheetText}>
              Reddit sentiment: good for travelers who want a less scripted plan. Yelp/Tripadvisor style signal: consistent service, useful photos, and recent availability. Official site: check hours and booking rules before committing.
            </Text>
            <Text style={styles.exploreSheetTitle}>Media preview</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.detailMediaRail}>
              {galleryUrls.map((uri, index) => (
                <Image key={`${suggestion.id}-${index}`} source={{ uri }} style={styles.detailMediaImage} contentFit="cover" />
              ))}
            </ScrollView>
            <View style={styles.inlineButtonRow}>
              <Pressable style={[styles.secondaryButton, styles.secondaryButtonActive]}>
                <Text
                  style={styles.secondaryButtonTextActive}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {suggestion.bookable ? 'Reserve' : 'Add to plan'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => Linking.openURL('https://www.google.com/search?q=' + encodeURIComponent(`${suggestion.title} ${suggestion.place.name}`))}
              >
                <Text
                  style={styles.secondaryButtonText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  Website
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ActionItemCard({
  item,
  onDone,
  onSnooze,
}: {
  item: TripActionItem;
  onDone: () => void;
  onSnooze: () => void;
}) {
  return (
    <View style={styles.compactCard}>
      <View style={styles.rowBetween}>
        <Text style={styles.compactTitle}>{item.title}</Text>
        <Text style={styles.compactMeta}>{readableKind(item.kind)}</Text>
      </View>
      <Text style={styles.compactDetail}>{item.detail}</Text>
      <Text style={styles.peopleLine}>Due: {formatDate(item.dueAt)}</Text>
      <View style={styles.inlineButtonRow}>
        <Pressable style={styles.secondaryButton} onPress={onSnooze}>
          <Text
            style={styles.secondaryButtonText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            Snooze
          </Text>
        </Pressable>
        <Pressable style={[styles.secondaryButton, styles.secondaryButtonActive]} onPress={onDone}>
          <Text
            style={styles.secondaryButtonTextActive}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            Done
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function MediaCard({
  item,
  onOpen,
  onApprove,
  onReject,
  onSelectForRecap,
  onExcludeFromRecap,
  onOpenSocial,
}: {
  item: TripMediaItem;
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSelectForRecap: () => void;
  onExcludeFromRecap: () => void;
  onOpenSocial: () => void;
}) {
  const thumb = mediaUri(item.thumbnailUrl ?? item.sourceUrl);
  return (
    <Pressable style={styles.mediaCard} onPress={onOpen}>
      <View style={styles.mediaThumbFrame}>
        {thumb ? <Image source={{ uri: thumb }} style={styles.mediaThumb} contentFit="cover" /> : null}
        <View style={styles.mediaThumbOverlay} />
        <Text style={styles.mediaThumbType}>{item.mediaType === 'social_post' ? item.socialProvider ?? 'Social' : readableKind(item.mediaType)}</Text>
        {item.mediaType === 'video' || item.mediaType === 'recap_video' ? (
          <View style={styles.playBadge}>
            <Text style={styles.playBadgeText}>▶</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.mediaBody}>
        <View style={styles.rowBetween}>
          <Text style={styles.compactTitle}>
            {item.status === 'candidate' ? 'Private camera-roll match' : item.mediaType === 'social_post' ? 'Social post linked' : `${item.ownerName} shared media`}
          </Text>
          <Text style={styles.compactMeta}>{item.matchConfidence}</Text>
        </View>
        <Text style={styles.compactDetail}>
          {item.caption ?? `${item.location?.name ?? 'Trip stop'} · ${formatDate(item.capturedAt)}`}
        </Text>
        <Text style={styles.noteLine}>{item.matchReasons.join(' · ')}</Text>
        <Text style={styles.noteLine}>
          {item.status === 'candidate'
            ? 'Private until approved'
            : item.eligibleForRecap
              ? 'Eligible for recap'
              : 'Shared to feed only'}
          {item.source === 'social_post' ? ` · ${socialLabel(item)}` : ''}
        </Text>
      </View>
      {item.status === 'candidate' ? (
        <View style={styles.inlineButtonRow}>
          <Pressable style={styles.secondaryButton} onPress={onReject}>
            <Text
              style={styles.secondaryButtonText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              Keep private
            </Text>
          </Pressable>
          <Pressable style={[styles.secondaryButton, styles.secondaryButtonActive]} onPress={onApprove}>
            <Text
              style={styles.secondaryButtonTextActive}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              Share
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.inlineButtonRow}>
          {item.socialPostUrl ? (
            <Pressable style={styles.secondaryButton} onPress={onOpenSocial}>
              <Text
                style={styles.secondaryButtonText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                Open post
              </Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.secondaryButton} onPress={onExcludeFromRecap}>
            <Text
              style={styles.secondaryButtonText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              Exclude recap
            </Text>
          </Pressable>
          <Pressable style={[styles.secondaryButton, item.status === 'recap_selected' && styles.secondaryButtonActive]} onPress={onSelectForRecap}>
            <Text
              style={[styles.secondaryButtonText, item.status === 'recap_selected' && styles.secondaryButtonTextActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              Use in recap
            </Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

function ChatMessageBubble({ message }: { message: TripMessage }) {
  const isUser = message.senderUserId === 'dev-user-000';
  const gifAttachment = message.attachments.find((attachment) => attachment.type === 'gif');
  return (
    <View style={[styles.messageBubble, isUser && styles.messageBubbleUser]}>
      <Text style={[styles.messageSender, isUser && styles.messageSenderUser]}>{message.senderName}</Text>
      <Text style={[styles.messageBody, isUser && styles.messageBodyUser]}>{message.body}</Text>
      {gifAttachment ? (
        <View style={styles.gifAttachment}>
          {gifAttachment.thumbnailUrl ?? gifAttachment.url ? (
            <Image
              source={{ uri: gifAttachment.thumbnailUrl ?? gifAttachment.url! }}
              style={styles.gifImage}
              contentFit="cover"
            />
          ) : null}
          <Text style={styles.gifBadge}>GIF</Text>
          <Text style={styles.gifTitle}>{gifAttachment.title}</Text>
          <Text style={styles.gifProvider}>{gifAttachment.providerName ?? 'GIF provider'}</Text>
        </View>
      ) : null}
      <Text style={[styles.messageTime, isUser && styles.messageTimeUser]}>{formatTime(message.createdAt)}</Text>
    </View>
  );
}

function TripChatPanel({
  messages,
  votes,
  suggestions,
  chatProvider,
  chatSuggestions,
  onVote,
  onBackToFeed,
  onScroll,
}: {
  messages: TripMessage[];
  votes: TripVote[];
  suggestions: TripPlannerSuggestion[];
  chatProvider: TripChatProvider;
  chatSuggestions: TripChatSuggestion[];
  onVote: (voteId: string, optionId: string) => void;
  onBackToFeed: () => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}) {
  const firstVote = votes[0] ?? null;
  const suggestedPlan = suggestions[0] ?? null;
  const chatSuggestion = chatSuggestions[0] ?? null;
  const groupCards = [
    ...(firstVote ? [{
      id: `vote-${firstVote.id}`,
      label: 'Vote',
      title: firstVote.title,
      detail: firstVote.detail,
      action: firstVote.options[0]?.label ?? 'Vote',
      onPress: () => firstVote.options[0] && onVote(firstVote.id, firstVote.options[0].id),
    }] : []),
    ...(chatSuggestions.slice(0, 2).map((suggestion) => ({
      id: `chat-${suggestion.id}`,
      label: readableKind(suggestion.kind),
      title: suggestion.title,
      detail: suggestion.detail,
      action: suggestion.actionLabel,
      onPress: () => undefined,
    }))),
    ...(suggestedPlan ? [{
      id: `plan-${suggestedPlan.id}`,
      label: 'Activity',
      title: suggestedPlan.title,
      detail: suggestedPlan.summary,
      action: suggestedPlan.bookable ? 'Reserve' : 'Save',
      onPress: () => undefined,
    }] : []),
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <View style={styles.chatHeader}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Group Chat</Text>
          <Text style={styles.country}>
            {chatProvider.provider === 'mock' ? 'Mock chat' : chatProvider.provider} · GIFs {chatProvider.supportsGifs ? 'on' : 'off'}
          </Text>
        </View>
        <Pressable style={styles.statusPill} onPress={onBackToFeed}>
          <Text style={styles.statusText}>Feed</Text>
        </Pressable>
      </View>

      <View style={styles.smartChatCard}>
        <Text style={styles.smartChatLabel}>Smart suggestion</Text>
        <Text style={styles.smartChatTitle}>
          {chatSuggestion?.title ??
            (suggestedPlan ? `Turn ${suggestedPlan.title} into a group decision` : 'Watch chat for plan changes')}
        </Text>
        <Text style={styles.smartChatDetail}>
          {chatSuggestion?.detail ?? 'Mia may rest through dinner, so a quick vote keeps tonight easy.'}
        </Text>
        {firstVote ? (
          <View style={styles.voteOptions}>
            {firstVote.options.slice(0, 2).map((option) => (
              <Pressable
                key={option.id}
                style={styles.votePill}
                onPress={() => onVote(firstVote.id, option.id)}
              >
                <Text style={styles.votePillText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {groupCards.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chatActionRail}
        >
          {groupCards.map((card) => (
            <Pressable key={card.id} style={styles.chatActionCard} onPress={card.onPress}>
              <Text style={styles.smartChatLabel}>{card.label}</Text>
              <Text style={styles.chatActionTitle}>{card.title}</Text>
              <Text style={styles.chatActionDetail}>{card.detail}</Text>
              <View style={styles.chatActionButton}>
              <Text
                style={styles.chatActionButtonText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {card.action}
              </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.section}>
        {messages.map((message) => (
          <ChatMessageBubble key={message.id} message={message} />
        ))}
      </View>

      <View style={styles.chatComposer}>
        <Text style={styles.chatComposerText}>Message... · GIF</Text>
      </View>
    </ScrollView>
  );
}

function TripVideoPlayer({ uri, posterUri }: { uri: string; posterUri?: string }) {
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
      player.play();
    }
    if (status === 'error') {
      setPlaybackFailed(true);
    }
  }, [player, status]);

  useEffect(() => {
    if (playbackFailed || status !== 'readyToPlay' || loopSeekingRef.current) return;
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
  }, [currentTime, playbackFailed, player, status]);

  return (
    <View style={styles.storyVideo}>
      {posterUri ? <Image source={{ uri: posterUri }} style={styles.storyVideoPoster} contentFit="cover" /> : null}
      {!playbackFailed && status === 'readyToPlay' ? (
        <VideoView
          player={player}
          style={styles.storyVideoSurface}
          contentFit="cover"
          nativeControls
          allowsFullscreen
        />
      ) : null}
      {playbackFailed ? (
        <View style={styles.storyPlayOverlay}>
          <Text style={styles.storyPlayText}>Preview still</Text>
        </View>
      ) : null}
    </View>
  );
}

function StoryViewer({
  item,
  onClose,
  onOpenSocial,
}: {
  item: TripMediaItem;
  onClose: () => void;
  onOpenSocial: () => void;
}) {
  const visual = mediaUri(item.sourceUrl ?? item.thumbnailUrl);
  const poster = mediaUri(item.thumbnailUrl);
  const isPlayable = item.mediaType === 'video' || item.mediaType === 'recap_video';

  return (
    <View style={styles.storyViewer}>
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.storyOwner}>{item.ownerName}</Text>
          <Text style={styles.storyMeta}>{socialLabel(item)} · {item.location?.name ?? 'Trip media'}</Text>
        </View>
        <Pressable style={styles.closePill} onPress={onClose}>
          <Text style={styles.closePillText}>Close</Text>
        </Pressable>
      </View>
      <View style={styles.storyFrame}>
        {visual && isPlayable && visual.endsWith('.mp4') ? (
          <TripVideoPlayer uri={visual} posterUri={poster ?? undefined} />
        ) : visual ? (
          <Image source={{ uri: visual }} style={styles.storyImage} contentFit="cover" />
        ) : (
          <View style={styles.storyEmpty}><Text style={styles.storyEmptyText}>Media preview</Text></View>
        )}
        {isPlayable && (!visual || !visual.endsWith('.mp4')) ? (
          <View style={styles.storyPlayOverlay}>
            <Text style={styles.storyPlayText}>Video preview</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.storyCaption}>{item.caption ?? item.matchReasons.join(' · ')}</Text>
      <View style={styles.inlineButtonRow}>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => Share.share({ title: item.caption ?? 'Trip media', message: item.socialPostUrl ?? item.caption ?? 'Shared from Elsewhere' })}
        >
          <Text
            style={styles.secondaryButtonText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            Share out
          </Text>
        </Pressable>
        {item.socialPostUrl ? (
          <Pressable style={styles.secondaryButton} onPress={onOpenSocial}>
            <Text
              style={styles.secondaryButtonText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              Open original
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function MediaFolder({
  media,
  selectedItem,
  scanSummary,
  onSelect,
  onCloseViewer,
  onScanLibrary,
  onOpenSocial,
  onGenerateRecap,
  recapJob,
  recapPending,
  isPast,
  socialPublishingStatus,
}: {
  media: TripMediaItem[];
  selectedItem: TripMediaItem | null;
  scanSummary: string | null;
  onSelect: (item: TripMediaItem) => void;
  onCloseViewer: () => void;
  onScanLibrary: () => void;
  onOpenSocial: (item: TripMediaItem) => void;
  onGenerateRecap: () => void;
  recapJob?: PreviewVideoJob;
  recapPending: boolean;
  isPast: boolean;
  socialPublishingStatus?: SocialPublishingStatus;
}) {
  const approvedCount = media.filter((item) => item.visibleToTrip).length;
  const candidateCount = media.filter((item) => item.status === 'candidate').length;
  const recapCount = media.filter((item) => item.eligibleForRecap || item.status === 'recap_selected').length;

  return (
    <>
      {selectedItem ? (
        <StoryViewer
          item={selectedItem}
          onClose={onCloseViewer}
          onOpenSocial={() => onOpenSocial(selectedItem)}
        />
      ) : null}

      <View style={styles.mediaSummaryCard}>
        <Text style={styles.mediaSummaryLabel}>Trip media folder</Text>
        <Text style={styles.mediaSummaryTitle}>{approvedCount} shared · {candidateCount} private candidates · {recapCount} recap picks</Text>
        <Text style={styles.mediaSummaryDetail}>
          Native camera photos and videos are matched by time and location, then held for approval. Social posts stay as links unless the platform API is configured.
        </Text>
        <View style={styles.inlineButtonRow}>
          <Pressable style={styles.secondaryButton} onPress={onScanLibrary}>
            <Text
              style={styles.secondaryButtonText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              Scan camera roll
            </Text>
          </Pressable>
          <Pressable style={[styles.secondaryButton, styles.secondaryButtonActive]} onPress={onGenerateRecap}>
            <Text
              style={styles.secondaryButtonTextActive}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.74}
            >
              {isPast ? 'Generate recap film' : 'Prep recap'}
            </Text>
          </Pressable>
        </View>
        {scanSummary ? <Text style={styles.mediaSummaryNote}>{scanSummary}</Text> : null}
      </View>

      {recapJob ? (
        <View style={styles.recapVideoCard}>
          <Text style={styles.smartChatLabel}>Sora recap</Text>
          <Text style={styles.smartChatTitle}>{recapJob.title}</Text>
          {recapJob.videoUrl ? (
            <TripVideoPlayer uri={recapJob.videoUrl} />
          ) : (
            <Text style={styles.smartChatDetail}>
              {recapJob.mock ? 'Mock recap ready. Set OPENAI_API_KEY for a real MP4.' : `${recapJob.status} · ${recapJob.progress}%`}
            </Text>
          )}
          <Text style={styles.noteLine}>{recapJob.limitation}</Text>
          {recapJob.errorMessage ? <Text style={styles.errorLine}>{recapJob.errorMessage}</Text> : null}
          <View style={styles.inlineButtonRow}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => Share.share({ title: recapJob.title, message: recapJob.videoUrl ?? recapJob.limitation })}
            >
              <Text
                style={styles.secondaryButtonText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                Export story
              </Text>
            </Pressable>
          </View>
        </View>
      ) : recapPending ? (
        <View style={styles.recapVideoCard}><ActivityIndicator /></View>
      ) : null}

      <View style={styles.mediaGrid}>
        {media.map((item) => {
          const thumb = mediaUri(item.thumbnailUrl ?? item.sourceUrl);
          return (
            <Pressable key={item.id} style={styles.mediaGridItem} onPress={() => onSelect(item)}>
              {thumb ? <Image source={{ uri: thumb }} style={styles.mediaGridImage} contentFit="cover" /> : null}
              <View style={styles.mediaGridOverlay} />
              <Text style={styles.mediaGridLabel}>{item.mediaType === 'social_post' ? item.socialProvider : readableKind(item.mediaType)}</Text>
              <Text style={styles.mediaGridMeta}>{item.status === 'candidate' ? 'Private' : item.status === 'recap_selected' ? 'Recap' : 'Shared'}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.socialPocCard}>
        <Text style={styles.smartChatLabel}>Social publishing POC</Text>
        <Text style={styles.smartChatTitle}>Native share now, APIs gated</Text>
        <Text style={styles.smartChatDetail}>
          Instagram story/highlight automation is treated as assisted export first. TikTok and Instagram publishing APIs stay behind developer app credentials, audit, and explicit user consent.
        </Text>
        {(socialPublishingStatus?.providers ?? []).map((provider) => (
          <Text key={provider.provider} style={styles.noteLine}>
            {provider.provider}: {provider.statusLabel} · {provider.configured ? 'configured' : 'not configured'}
          </Text>
        ))}
        {!socialPublishingStatus ? (
          <>
            <Text style={styles.noteLine}>TikTok: disabled until client key/secret and video.publish approval exist.</Text>
            <Text style={styles.noteLine}>Instagram: native story share/link-out first; Graph publishing only for eligible professional-account flows.</Text>
          </>
        ) : null}
      </View>
    </>
  );
}

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [tripPage, setTripPage] = useState<TripPage>('feed');
  const [selectedMediaItem, setSelectedMediaItem] = useState<TripMediaItem | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<TripPlannerSuggestion | null>(null);
  const [libraryScanSummary, setLibraryScanSummary] = useState<string | null>(null);
  const [recapVideoJob, setRecapVideoJob] = useState<PreviewVideoJob | undefined>();
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(false);
  const pagerRef = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const { data: guide, isLoading, refetch, isRefetching } = useTripGuide(id);
  const { data: room, isLoading: isRoomLoading } = useTripRoom(id);
  const {
    data: liveIntel,
    refetch: refetchLiveIntel,
    isRefetching: isLiveIntelRefetching,
  } = useLiveTripIntelligence(id);
  const { data: socialPublishingStatus } = useQuery({
    queryKey: ['social', 'publishing', 'status'],
    queryFn: () => api.getSocialPublishingStatus(),
  });
  const refreshRoom = () =>
    queryClient.invalidateQueries({ queryKey: ['trips', id, 'room'] });
  const goToTripPage = (page: TripPage) => {
    setTripPage(page);
    pagerRef.current?.scrollTo({ x: pageIndex(page) * width, animated: true });
  };
  const handleVerticalPageScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const shouldCollapse = event.nativeEvent.contentOffset.y > 24;
    setIsHeroCollapsed((current) => (current === shouldCollapse ? current : shouldCollapse));
  };

  useEffect(() => {
    if (isLoading || isRoomLoading) return undefined;
    const timeout = setTimeout(() => {
      pagerRef.current?.scrollTo({ x: pageIndex('feed') * width, animated: false });
    }, 0);
    return () => clearTimeout(timeout);
  }, [isLoading, isRoomLoading, width]);

  const voteMutation = useMutation({
    mutationFn: ({ voteId, optionId }: { voteId: string; optionId: string }) =>
      api.respondToTripVote(id!, voteId, optionId),
    onSuccess: refreshRoom,
  });

  const actionItemMutation = useMutation({
    mutationFn: ({ actionItemId, status }: { actionItemId: string; status: 'snoozed' | 'done' }) =>
      api.updateTripActionItem(id!, actionItemId, status),
    onSuccess: refreshRoom,
  });

  const mediaMutation = useMutation({
    mutationFn: ({ mediaId, action }: { mediaId: string; action: 'approve' | 'reject' | 'select_for_recap' | 'exclude_from_recap' }) =>
      api.updateTripMediaApproval(id!, mediaId, action),
    onSuccess: refreshRoom,
  });

  const participationMutation = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: 'going' | 'join_later' }) =>
      api.updateTripParticipation(id!, itemId, status),
    onSuccess: refreshRoom,
  });

  const recapVideoMutation = useMutation({
    mutationFn: () =>
      api.createPreviewVideo({
        cardId: `trip-recap-${id}`,
        destinationName: guide?.destinationName ?? 'Trip',
        title: `${guide?.tripName ?? 'Trip'} recap film`,
        prompt: [
          guide?.tripTagline,
          `Trip media: ${room?.media.map((item) => item.caption ?? item.location?.name ?? item.mediaType).join(', ')}`,
          'Create a nostalgic post-vacation recap from approved trip moments, generic travelers only.',
        ].filter(Boolean).join(' '),
        people: [],
        mode: 'trip_recap',
        seconds: '8',
      }),
    onSuccess: setRecapVideoJob,
  });

  const shouldPollRecap = Boolean(
    recapVideoJob &&
    !recapVideoJob.mock &&
    recapVideoJob.status !== 'completed' &&
    recapVideoJob.status !== 'failed',
  );

  const { data: refreshedRecapJob } = useQuery({
    queryKey: ['preview-video', recapVideoJob?.jobId],
    queryFn: () => api.getPreviewVideo(recapVideoJob!.jobId),
    enabled: shouldPollRecap,
    refetchInterval: shouldPollRecap ? 5000 : false,
  });

  useEffect(() => {
    if (refreshedRecapJob) setRecapVideoJob(refreshedRecapJob);
  }, [refreshedRecapJob]);

  if (isLoading || isRoomLoading || !guide || !room) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const sharedMedia = room.media.slice(0, 3);
  const topOpportunity = guide.opportunities[0];
  const handleOpenSocial = (item: TripMediaItem) => {
    if (!item.socialPostUrl) return;
    Linking.openURL(item.socialPostUrl).catch(() => {
      Share.share({ title: item.caption ?? 'Trip social post', message: item.socialPostUrl! });
    });
  };
  const handleScanLibrary = async () => {
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        setLibraryScanSummary('Photo library access is off. Elsewhere will keep using mock candidates until access is granted.');
        return;
      }
      const assets = await MediaLibrary.getAssetsAsync({
        first: 12,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      setLibraryScanSummary(
        `Found ${assets.assets.length} recent camera-roll item${assets.assets.length === 1 ? '' : 's'} for matching. MVP keeps them private until approval.`,
      );
    } catch (error) {
      setLibraryScanSummary((error as Error).message);
    }
  };
  const renderTripHeader = () => (
    <View
      style={[
        styles.anchoredHero,
        {
          height: isHeroCollapsed ? insets.top + 136 : insets.top + 196,
          paddingTop: insets.top + 18,
        },
      ]}
    >
      <Image
        source={{ uri: imageForDestination(guide.destinationName) }}
        style={styles.anchoredHeroImage}
        contentFit="cover"
      />
      <View style={styles.anchoredHeroOverlay} />
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.tripHeroTitle, isHeroCollapsed && styles.tripHeroTitleCollapsed]}>
            {guide.tripName}
          </Text>
          <Text style={styles.tripHeroCountry}>
            {guide.destinationName}, {guide.destinationCountry} · {guide.travelerCount} travelers
          </Text>
          {!isHeroCollapsed && guide.tripTagline ? (
            <Text style={styles.tripHeroTagline} numberOfLines={2}>
              {guide.tripTagline}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.pageIndicatorRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pageChipScroller}
        >
          {TRIP_PAGES.map((page) => {
            const active = page.id === tripPage;
            return (
              <Pressable
                key={page.id}
                style={[styles.pageChip, active && styles.pageChipActive]}
                onPress={() => goToTripPage(page.id)}
              >
                <Text style={[styles.pageChipText, active && styles.pageChipTextActive]}>
                  {page.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  const renderPaymentSummary = () => (
    <View style={styles.paymentCard}>
      <View style={styles.paymentRow}>
        <Text style={styles.metricLabel}>Paid</Text>
        <Text style={styles.paymentValue}>${room.paymentSummary.paidAmount.toLocaleString()}</Text>
      </View>
      <View style={styles.paymentRow}>
        <Text style={styles.metricLabel}>Due</Text>
        <Text style={styles.paymentValue}>${room.paymentSummary.dueAmount.toLocaleString()}</Text>
      </View>
      <View style={styles.paymentRow}>
        <Text style={styles.metricLabel}>0% monthly</Text>
        <Text style={styles.paymentValue}>
          {room.paymentSummary.monthlyPlanAmount
            ? `$${room.paymentSummary.monthlyPlanAmount.toLocaleString()}`
            : 'Complete'}
        </Text>
      </View>
      <Text style={styles.noteLine}>
        Credits ${room.paymentSummary.travelCredits.toLocaleString()} · refunds pending ${room.paymentSummary.refundsPending.toLocaleString()}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderTripHeader()}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(event) => {
          const index = Math.max(0, Math.min(TRIP_PAGES.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)));
          setTripPage(TRIP_PAGES[index].id);
        }}
      >
        <View style={{ width }}>
          <TripChatPanel
            messages={room.messages}
            votes={room.votes}
            suggestions={room.suggestions}
            chatProvider={room.chatProvider}
            chatSuggestions={room.chatSuggestions}
            onVote={(voteId, optionId) => voteMutation.mutate({ voteId, optionId })}
            onBackToFeed={() => goToTripPage('feed')}
            onScroll={handleVerticalPageScroll}
          />
        </View>

        <View style={{ width }}>
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            onScroll={handleVerticalPageScroll}
            scrollEventThrottle={16}
          >
            <Pressable
              style={[styles.monitorButton, (isRefetching || isLiveIntelRefetching) && styles.disabledButton]}
              onPress={async () => {
                await Promise.all([refetch(), refetchLiveIntel()]);
                queryClient.invalidateQueries({ queryKey: ['assist', 'trip-guides'] });
                queryClient.invalidateQueries({ queryKey: ['assist', 'live-intel', id] });
                queryClient.invalidateQueries({ queryKey: ['trips', id, 'room'] });
              }}
              disabled={isRefetching || isLiveIntelRefetching}
            >
              {isRefetching || isLiveIntelRefetching ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.monitorButtonText}>Run Trip Check</Text>
              )}
            </Pressable>
            <Text style={styles.monitorMeta}>
              Last checked {formatDate(liveIntel?.generatedAt ?? guide.monitoredAt)}
            </Text>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Smart Feed</Text>
              {room.feed.map((card) => (
                <SmartFeedCard key={card.id} card={card} />
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Trip Media</Text>
              {sharedMedia.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  onOpen={() => {
                    setSelectedMediaItem(item);
                    goToTripPage('media');
                  }}
                  onApprove={() => mediaMutation.mutate({ mediaId: item.id, action: 'approve' })}
                  onReject={() => mediaMutation.mutate({ mediaId: item.id, action: 'reject' })}
                  onSelectForRecap={() => mediaMutation.mutate({ mediaId: item.id, action: 'select_for_recap' })}
                  onExcludeFromRecap={() => mediaMutation.mutate({ mediaId: item.id, action: 'exclude_from_recap' })}
                  onOpenSocial={() => handleOpenSocial(item)}
                />
              ))}
              {!sharedMedia.length ? <Text style={styles.emptyLine}>No trip media yet.</Text> : null}
            </View>

            {liveIntel && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Best Move</Text>
                <View style={styles.decisionCard}>
                  <Text style={styles.decisionTitle}>{liveIntel.decision.title}</Text>
                  <Text style={styles.decisionRecommendation}>{liveIntel.decision.recommendation}</Text>
                  <View style={styles.valueRow}>
                    <Text style={styles.valueLabel}>
                      {liveIntel.decision.usedAi ? 'AI-ranked decision' : 'Rules fallback decision'}
                    </Text>
                    <Text style={styles.valueAmount}>
                      ${(liveIntel.decision.estimatedSavings + liveIntel.decision.protectedValue).toLocaleString()}
                    </Text>
                  </View>
                  {liveIntel.decision.limitations.slice(0, 2).map((item) => (
                    <Text key={item} style={styles.limitLine}>- {item}</Text>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Assist Recommendations</Text>
              {guide.opportunities.map((opportunity) => {
                const tone = opportunityTone(opportunity);
                return (
                  <View key={opportunity.id} style={styles.opportunityCard}>
                    <View style={styles.opportunityHeader}>
                      <Text style={styles.opportunityTitle}>{opportunity.title}</Text>
                      <Text style={[styles.opportunityStatus, { color: tone }]}>
                        {readableKind(opportunity.status)}
                      </Text>
                    </View>
                    <Text style={styles.opportunityDetail}>{opportunity.detail}</Text>
                    <View style={styles.valueRow}>
                      <Text style={styles.valueLabel}>
                        {opportunity.savingsAmount ? 'Savings' : 'Protected'}
                      </Text>
                      <Text style={styles.valueAmount}>
                        ${(opportunity.savingsAmount ?? opportunity.protectedValue ?? 0).toLocaleString()}
                      </Text>
                    </View>
                    <Text style={styles.deadline}>Deadline: {formatDate(opportunity.deadlineAt)}</Text>
                  </View>
                );
              })}
              {!guide.opportunities.length && !topOpportunity ? (
                <Text style={styles.emptyLine}>No active Assist actions. Elsewhere is still watching.</Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Monitored Bookings</Text>
              {guide.segments.map((segment) => (
                <View key={segment.id} style={styles.segmentCard}>
                  <Text style={styles.segmentProvider}>{segment.providerName}</Text>
                  <Text style={styles.segmentTitle}>{segment.title}</Text>
                  <Text style={styles.segmentMeta}>{formatDate(segment.startsAt)}</Text>
                  {segment.routeSummary ? (
                    <Text style={styles.segmentMeta}>{segment.routeSummary}</Text>
                  ) : null}
                  <Text style={styles.policySummary}>{segment.policySummary}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={{ width }}>
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            onScroll={handleVerticalPageScroll}
            scrollEventThrottle={16}
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Media Folder</Text>
              <MediaFolder
                media={room.media}
                selectedItem={selectedMediaItem}
                scanSummary={libraryScanSummary}
                onSelect={setSelectedMediaItem}
                onCloseViewer={() => setSelectedMediaItem(null)}
                onScanLibrary={handleScanLibrary}
                onOpenSocial={handleOpenSocial}
                onGenerateRecap={() => recapVideoMutation.mutate()}
                recapJob={recapVideoJob}
                recapPending={recapVideoMutation.isPending}
                isPast={guide.status === 'completed'}
                socialPublishingStatus={socialPublishingStatus}
              />
            </View>
          </ScrollView>
        </View>

        <View style={{ width }}>
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            onScroll={handleVerticalPageScroll}
            scrollEventThrottle={16}
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Schedule</Text>
              {room.schedule.map((item) => (
                <ScheduleCard
                  key={item.id}
                  item={item}
                  onGoing={() => participationMutation.mutate({ itemId: item.id, status: 'going' })}
                  onJoinLater={() => participationMutation.mutate({ itemId: item.id, status: 'join_later' })}
                />
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={{ width }}>
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            onScroll={handleVerticalPageScroll}
            scrollEventThrottle={16}
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Explore Nearby</Text>
              {selectedSuggestion ? (
                <ExploreDetailSheet
                  suggestion={selectedSuggestion}
                  imageUrl={imageForSuggestion(selectedSuggestion, guide.destinationName)}
                  galleryUrls={galleryForSuggestion(selectedSuggestion, guide.destinationName)}
                  onClose={() => setSelectedSuggestion(null)}
                />
              ) : null}
              {room.suggestions.map((suggestion, index) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  imageUrl={imageForSuggestion(suggestion, guide.destinationName)}
                  onPress={() => setSelectedSuggestion(suggestion)}
                />
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={{ width }}>
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            onScroll={handleVerticalPageScroll}
            scrollEventThrottle={16}
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payments</Text>
              {renderPaymentSummary()}
              {room.paymentSummary.travelers.map((traveler) => (
                <View key={traveler.userId} style={styles.compactCard}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.compactTitle}>{traveler.name}</Text>
                    <Text style={styles.compactMeta}>{readableKind(traveler.status)}</Text>
                  </View>
                  <Text style={styles.compactDetail}>
                    Paid ${traveler.paid.toLocaleString()} · due ${(traveler.totalDue - traveler.paid).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={{ width }}>
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            onScroll={handleVerticalPageScroll}
            scrollEventThrottle={16}
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Checklist</Text>
              {room.actionItems.map((item) => (
                <ActionItemCard
                  key={item.id}
                  item={item}
                  onDone={() => actionItemMutation.mutate({ actionItemId: item.id, status: 'done' })}
                  onSnooze={() => actionItemMutation.mutate({ actionItemId: item.id, status: 'snoozed' })}
                />
              ))}
              {!room.actionItems.length ? <Text style={styles.emptyLine}>Nothing to do right now.</Text> : null}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SOCIAL_POP.background },
  content: { padding: 16, paddingBottom: 104 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: SOCIAL_POP.background },
  anchoredHero: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 62,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    backgroundColor: SOCIAL_POP.text,
  },
  anchoredHeroImage: { ...StyleSheet.absoluteFillObject, opacity: 1 },
  anchoredHeroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.34)' },
  pageIndicatorRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: 'transparent',
  },
  pageChipScroller: { gap: 8, paddingHorizontal: 16 },
  pageChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.30)',
  },
  pageChipActive: { backgroundColor: 'rgba(255, 255, 255, 0.78)', borderColor: 'rgba(255, 255, 255, 0.78)' },
  pageChipText: { color: 'rgba(255, 255, 255, 0.82)', fontSize: 12, fontWeight: '900' },
  pageChipTextActive: { color: '#111' },
  pageIndicatorDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#d8e1e5' },
  pageIndicatorDotActive: { backgroundColor: SOCIAL_POP.coral },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', color: '#111' },
  country: { fontSize: 15, color: '#666', marginTop: 3 },
  tripTagline: { color: '#333', fontSize: 15, lineHeight: 21, marginTop: 8, fontWeight: '600' },
  tripHeroTitle: { fontSize: 30, lineHeight: 34, fontWeight: '900', color: '#fff' },
  tripHeroTitleCollapsed: { fontSize: 22, lineHeight: 26 },
  tripHeroCountry: { fontSize: 13, color: 'rgba(255, 255, 255, 0.84)', marginTop: 3, fontWeight: '700' },
  tripHeroTagline: { color: 'rgba(255, 255, 255, 0.9)', fontSize: 13, lineHeight: 18, marginTop: 6, fontWeight: '700' },
  tripHeroStatusPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.26)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.34)',
  },
  tripHeroStatusText: { color: '#fff', fontSize: 12, fontWeight: '900', textTransform: 'capitalize' },
  statusPill: {
    backgroundColor: '#f1eee7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: { color: '#4d463c', fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  menuRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  menuChip: { backgroundColor: '#f3f6f7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  menuChipText: { color: '#445', fontSize: 12, fontWeight: '700' },
  metricLabel: { fontSize: 12, color: '#777', marginBottom: 5 },
  monitorButton: { backgroundColor: SOCIAL_POP.coral, padding: 14, borderRadius: 14, alignItems: 'center', marginTop: 14 },
  disabledButton: { opacity: 0.6 },
  monitorButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  monitorMeta: { color: '#777', fontSize: 12, textAlign: 'center', marginTop: 8 },
  section: { marginTop: 26 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12, color: '#111' },
  feedCard: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.56)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    shadowColor: '#263238',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.07,
    shadowRadius: 26,
  },
  feedHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
  feedKind: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  feedStatus: { flex: 1, color: '#777', fontSize: 11, fontWeight: '700', textAlign: 'right', textTransform: 'capitalize' },
  feedTitle: { color: '#111', fontSize: 17, fontWeight: '800', marginTop: 8 },
  feedSubtitle: { color: '#555', fontSize: 13, fontWeight: '700', marginTop: 4 },
  feedDetail: { color: '#555', lineHeight: 19, marginTop: 7, fontSize: 14 },
  feedFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 12 },
  feedTime: { flex: 1, color: '#777', fontSize: 12 },
  smallCta: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  smallCtaText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  compactCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.56)',
  },
  exploreCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderRadius: 20,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.56)',
  },
  exploreImageFrame: { height: 176, backgroundColor: '#111', overflow: 'hidden' },
  exploreImage: { width: '100%', height: '100%' },
  exploreKind: {
    position: 'absolute',
    left: 12,
    top: 12,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    color: '#111',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 6,
    textTransform: 'capitalize',
  },
  exploreBody: { padding: 14, backgroundColor: 'rgba(255, 255, 255, 0.34)' },
  exploreActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  explorePrimaryCta: {
    maxWidth: '100%',
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: SOCIAL_POP.coral,
    paddingHorizontal: 13,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  explorePrimaryCtaText: { color: '#fff', fontSize: 12, lineHeight: 14, fontWeight: '900', textAlign: 'center' },
  exploreSecondaryCta: {
    maxWidth: '100%',
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d6cec0',
    backgroundColor: 'rgba(255,255,255,0.46)',
    paddingHorizontal: 13,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exploreSecondaryCtaText: { color: '#5a5145', fontSize: 12, lineHeight: 14, fontWeight: '900', textAlign: 'center' },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
  },
  exploreSheet: {
    maxHeight: '86%',
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 14,
  },
  exploreSheetScroll: { marginTop: 12 },
  exploreSheetHero: { width: '100%', height: 260, borderRadius: 18, backgroundColor: '#222' },
  exploreSheetTitle: { color: '#f2dfb4', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginTop: 18 },
  exploreSheetText: { color: '#e7e1d7', fontSize: 14, lineHeight: 21, marginTop: 8 },
  sourceRail: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  sourcePill: { borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.12)', paddingHorizontal: 10, paddingVertical: 7 },
  sourcePillText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  detailMediaRail: { gap: 10, paddingTop: 10, paddingBottom: 4 },
  detailMediaImage: { width: 132, height: 176, borderRadius: 14, backgroundColor: '#222' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  compactTitle: { flex: 1, color: '#111', fontSize: 16, fontWeight: '800' },
  compactMeta: { color: '#8b6b34', fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  compactDetail: { color: '#555', lineHeight: 19, marginTop: 6, fontSize: 14 },
  peopleLine: { color: '#666', lineHeight: 18, marginTop: 6, fontSize: 13 },
  noteLine: { color: '#777', lineHeight: 18, marginTop: 6, fontSize: 12 },
  errorLine: { color: '#c53030', lineHeight: 18, marginTop: 6, fontSize: 12 },
  inlineButtonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'flex-start' },
  secondaryButton: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 34,
    borderWidth: 1,
    borderColor: SOCIAL_POP.coral,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonActive: { backgroundColor: SOCIAL_POP.coral },
  secondaryButtonText: { color: '#111', fontSize: 12, lineHeight: 15, fontWeight: '800', textAlign: 'center' },
  secondaryButtonTextActive: { color: '#fff', fontSize: 12, lineHeight: 15, fontWeight: '800', textAlign: 'center' },
  voteOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  votePill: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#e1e7eb' },
  votePillText: { color: '#333', fontSize: 12, fontWeight: '700' },
  mediaCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.56)',
    overflow: 'hidden',
  },
  mediaThumbFrame: { height: 190, backgroundColor: '#111', overflow: 'hidden' },
  mediaThumb: { width: '100%', height: '100%' },
  mediaThumbOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.18)' },
  mediaThumbType: {
    position: 'absolute',
    left: 12,
    top: 12,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
    color: '#111',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 6,
    textTransform: 'capitalize',
  },
  playBadge: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBadgeText: { color: '#111', fontSize: 13, fontWeight: '900' },
  mediaBody: { padding: 14, backgroundColor: 'rgba(255, 255, 255, 0.34)' },
  mediaSummaryCard: {
    backgroundColor: 'rgba(17, 17, 20, 0.86)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  mediaSummaryLabel: { color: '#f2dfb4', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  mediaSummaryTitle: { color: '#fff', fontSize: 18, fontWeight: '900', lineHeight: 23, marginTop: 7 },
  mediaSummaryDetail: { color: '#d7d2c8', fontSize: 14, lineHeight: 20, marginTop: 7 },
  mediaSummaryNote: { color: '#f2dfb4', fontSize: 12, lineHeight: 17, marginTop: 10 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  mediaGridItem: {
    width: '48%',
    aspectRatio: 0.78,
    borderRadius: 16,
    backgroundColor: 'rgba(17, 17, 20, 0.86)',
    overflow: 'hidden',
  },
  mediaGridImage: { width: '100%', height: '100%' },
  mediaGridOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.18)' },
  mediaGridLabel: {
    position: 'absolute',
    left: 10,
    top: 10,
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  mediaGridMeta: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    color: '#f2dfb4',
    fontSize: 11,
    fontWeight: '900',
  },
  storyViewer: {
    backgroundColor: 'rgba(17, 17, 20, 0.86)',
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  storyOwner: { color: '#fff', fontSize: 16, fontWeight: '900' },
  storyMeta: { color: '#d7d2c8', fontSize: 12, fontWeight: '700', marginTop: 3 },
  closePill: { borderRadius: 999, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 6 },
  closePillText: { color: '#111', fontSize: 12, fontWeight: '900' },
  storyFrame: { marginTop: 12, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000', aspectRatio: 9 / 16 },
  storyImage: { width: '100%', height: '100%' },
  storyVideo: { width: '100%', height: '100%', backgroundColor: '#000' },
  storyVideoPoster: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  storyVideoSurface: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  storyEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  storyEmptyText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  storyPlayOverlay: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  storyPlayText: { color: '#111', fontSize: 12, fontWeight: '900' },
  storyCaption: { color: '#fff', fontSize: 14, lineHeight: 20, marginTop: 12 },
  recapVideoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.56)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  socialPocCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.56)',
    borderRadius: 18,
    padding: 14,
    marginTop: 14,
  },
  paymentCard: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.56)',
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
  },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  paymentValue: { color: '#111', fontSize: 16, fontWeight: '800' },
  decisionCard: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.56)',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderRadius: 18,
    padding: 14,
  },
  decisionTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  decisionRecommendation: { color: '#333', lineHeight: 20, marginTop: 10, fontSize: 14 },
  valueRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 12 },
  valueLabel: { flex: 1, color: '#777', fontSize: 13 },
  valueAmount: { color: '#111', fontSize: 16, fontWeight: '800' },
  limitLine: { color: '#8a5a00', fontSize: 13, lineHeight: 18, marginTop: 6 },
  opportunityCard: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.56)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
  },
  opportunityHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  opportunityTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#111' },
  opportunityStatus: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  opportunityDetail: { color: '#555', lineHeight: 19, marginTop: 8, fontSize: 14 },
  deadline: { color: '#777', fontSize: 12, marginTop: 8 },
  segmentCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.56)',
  },
  segmentProvider: { color: '#8b6b34', fontSize: 12, fontWeight: '800' },
  segmentTitle: { fontSize: 16, fontWeight: '800', color: '#111', marginTop: 3 },
  segmentMeta: { color: '#666', fontSize: 13, marginTop: 5 },
  policySummary: { color: '#444', fontSize: 13, lineHeight: 18, marginTop: 10 },
  emptyLine: { color: '#777', fontSize: 14, lineHeight: 20 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  smartChatCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.56)',
    borderRadius: 18,
    padding: 14,
    marginTop: 18,
  },
  smartChatLabel: { color: '#8b6b34', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  smartChatTitle: { color: '#111', fontSize: 17, fontWeight: '900', marginTop: 7 },
  smartChatDetail: { color: '#555', fontSize: 14, lineHeight: 20, marginTop: 7 },
  chatActionRail: { gap: 10, paddingTop: 12, paddingRight: 16 },
  chatActionCard: {
    width: 228,
    backgroundColor: 'rgba(255, 79, 109, 0.82)',
    borderRadius: 18,
    padding: 14,
    minHeight: 154,
  },
  chatActionTitle: { color: '#fff', fontSize: 16, fontWeight: '900', lineHeight: 21, marginTop: 8 },
  chatActionDetail: { color: '#d7d2c8', fontSize: 13, lineHeight: 18, marginTop: 7 },
  chatActionButton: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 34,
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: '#fff',
    paddingHorizontal: 11,
    paddingVertical: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatActionButtonText: { color: '#111', fontSize: 12, lineHeight: 14, fontWeight: '900', textAlign: 'center' },
  messageBubble: {
    alignSelf: 'flex-start',
    maxWidth: '84%',
    backgroundColor: 'rgba(255, 255, 255, 0.64)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  messageBubbleUser: { alignSelf: 'flex-end', backgroundColor: 'rgba(255, 79, 109, 0.86)' },
  messageSender: { color: '#555', fontSize: 12, fontWeight: '800', marginBottom: 4 },
  messageSenderUser: { color: '#d9f0f6' },
  messageBody: { color: '#222', fontSize: 15, lineHeight: 20 },
  messageBodyUser: { color: '#fff' },
  messageTime: { color: '#777', fontSize: 11, marginTop: 6, alignSelf: 'flex-end' },
  messageTimeUser: { color: '#d9f0f6' },
  gifAttachment: {
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    minWidth: 170,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.56)',
  },
  gifImage: { width: 170, height: 96, borderRadius: 8, marginBottom: 8, backgroundColor: '#edf2f4' },
  gifBadge: { color: '#8b6b34', fontSize: 11, fontWeight: '900' },
  gifTitle: { color: '#111', fontSize: 14, fontWeight: '900', marginTop: 4 },
  gifProvider: { color: '#777', fontSize: 11, fontWeight: '700', marginTop: 3 },
  chatComposer: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.56)',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginTop: 22,
  },
  chatComposerText: { color: '#8a9499', fontSize: 15 },
});

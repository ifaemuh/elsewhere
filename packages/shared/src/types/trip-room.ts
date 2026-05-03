import type { TripMediaItem } from './trip-media';

export type TripFeedCardKind =
  | 'next_up'
  | 'today_plan'
  | 'open_slot'
  | 'planner_suggestion'
  | 'vote'
  | 'join_later'
  | 'assist'
  | 'deal'
  | 'media'
  | 'payment'
  | 'checklist'
  | 'document'
  | 'chat'
  | 'recap';

export type TripFeedCardPriority = 'urgent' | 'high' | 'normal' | 'quiet';
export type TripScheduleKind =
  | 'flight'
  | 'hotel'
  | 'restaurant'
  | 'event'
  | 'attraction'
  | 'experience'
  | 'rest'
  | 'free_time'
  | 'custom';
export type TripParticipationStatus =
  | 'interested'
  | 'going'
  | 'not_going'
  | 'maybe'
  | 'resting'
  | 'join_later'
  | 'needs_vote';
export type TripPlannerSuggestionKind =
  | 'restaurant'
  | 'event'
  | 'attraction'
  | 'experience'
  | 'rest'
  | 'hidden_gem';
export type TripActionItemKind = 'approval' | 'payment' | 'document' | 'checklist' | 'assist' | 'booking' | 'media';
export type TripActionItemStatus = 'open' | 'snoozed' | 'done';
export type TripNotificationPriority = 'urgent' | 'normal' | 'quiet';
export type TripChatProviderKind = 'mock' | 'stream' | 'sendbird' | 'twilio' | 'firebase';
export type TripMessageAttachmentType = 'gif' | 'image' | 'video' | 'link' | 'vote' | 'activity';
export type TripChatSuggestionKind = 'vote' | 'schedule_change' | 'activity' | 'payment' | 'join_later';

export interface TripFeedCard {
  id: string;
  tripId: string;
  kind: TripFeedCardKind;
  priority: TripFeedCardPriority;
  title: string;
  subtitle: string | null;
  detail: string;
  ctaLabel: string | null;
  relatedEntityId: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  statusLabel: string | null;
}

export interface TripParticipant {
  userId: string;
  name: string;
  status: TripParticipationStatus;
}

export interface TripPlace {
  name: string;
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface TripScheduleItem {
  id: string;
  tripId: string;
  title: string;
  kind: TripScheduleKind;
  startsAt: string;
  endsAt: string | null;
  place: TripPlace | null;
  participants: TripParticipant[];
  reservationStatus: 'none' | 'suggested' | 'vote_needed' | 'held' | 'booked';
  bookingUrl: string | null;
  costEstimate: number | null;
  notes: string | null;
}

export interface TripPlannerSuggestion {
  id: string;
  tripId: string;
  kind: TripPlannerSuggestionKind;
  title: string;
  summary: string;
  place: TripPlace;
  distanceText: string;
  travelTimeText: string;
  priceLevel: '$' | '$$' | '$$$' | '$$$$' | null;
  startsAt: string | null;
  availability: string;
  weatherFit: string | null;
  preferenceFit: string | null;
  bookable: boolean;
  source: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface TripVoteOption {
  id: string;
  label: string;
  votes: number;
}

export interface TripVote {
  id: string;
  tripId: string;
  title: string;
  detail: string;
  options: TripVoteOption[];
  requiredParticipantIds: string[];
  deadline: string | null;
  status: 'open' | 'closed';
}

export interface TripActionItem {
  id: string;
  tripId: string;
  kind: TripActionItemKind;
  title: string;
  detail: string;
  assignedUserIds: string[];
  dueAt: string | null;
  status: TripActionItemStatus;
  relatedEntityId: string | null;
  notificationState: 'enabled' | 'quiet' | 'sent';
}

export interface TripPaymentTravelerSummary {
  userId: string;
  name: string;
  totalDue: number;
  paid: number;
  nextDueAt: string | null;
  status: 'paid' | 'due' | 'pending';
}

export interface TripPaymentSummary {
  tripId: string;
  totalCost: number;
  paidAmount: number;
  dueAmount: number;
  monthlyPlanAmount: number | null;
  nextPaymentDueAt: string | null;
  travelCredits: number;
  refundsPending: number;
  travelers: TripPaymentTravelerSummary[];
}

export interface TripMessage {
  id: string;
  tripId: string;
  senderUserId: string;
  senderName: string;
  body: string;
  providerMessageId: string | null;
  relatedCardId: string | null;
  attachments: TripMessageAttachment[];
  intentSignals: string[];
  createdAt: string;
}

export interface TripMessageAttachment {
  id: string;
  type: TripMessageAttachmentType;
  title: string;
  url: string | null;
  thumbnailUrl: string | null;
  providerName: string | null;
  relatedEntityId: string | null;
}

export interface TripChatProvider {
  tripId: string;
  provider: TripChatProviderKind;
  channelId: string;
  configured: boolean;
  supportsGifs: boolean;
  supportsModeration: boolean;
  detail: string;
}

export interface TripChatSuggestion {
  id: string;
  tripId: string;
  kind: TripChatSuggestionKind;
  title: string;
  detail: string;
  confidence: 'low' | 'medium' | 'high';
  sourceMessageIds: string[];
  actionLabel: string;
  relatedEntityId: string | null;
}

export interface TripNotification {
  id: string;
  tripId: string;
  title: string;
  detail: string;
  priority: TripNotificationPriority;
  channel: 'in_app' | 'push' | 'email';
  relatedEntityId: string | null;
  createdAt: string;
}

export interface TripRoomData {
  feed: TripFeedCard[];
  schedule: TripScheduleItem[];
  suggestions: TripPlannerSuggestion[];
  votes: TripVote[];
  actionItems: TripActionItem[];
  paymentSummary: TripPaymentSummary;
  media: TripMediaItem[];
  chatProvider: TripChatProvider;
  chatSuggestions: TripChatSuggestion[];
  messages: TripMessage[];
  notifications: TripNotification[];
}

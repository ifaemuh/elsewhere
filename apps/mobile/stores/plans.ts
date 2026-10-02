import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type SavedPlanReason = 'liked' | 'planned' | 'interested' | 'watched';

export interface SavedPlanCard {
  id: string;
  title: string;
  location: string;
  cardType: string;
  detail: string;
  reason: SavedPlanReason;
  reasonLabel: string;
  imageUrl?: string;
  posterUrl?: string;
  valueLabel?: string | null;
  people: string[];
  musicLabel?: string | null;
  prompt: string;
  createdAt: string;
}

interface PlansState {
  likedPostIds: string[];
  plannedPostIds: string[];
  interestedPostIds: string[];
  watchedPostIds: string[];
  answeredPromptIds: string[];
  savedPlanCards: Record<string, SavedPlanCard>;
  toggleLike: (card: SavedPlanCard) => boolean;
  markPlanned: (card: SavedPlanCard) => void;
  markInterested: (card: SavedPlanCard, promptId?: string) => void;
  markWatched: (card: SavedPlanCard) => void;
  removePlanCard: (cardId: string) => void;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function remove(values: string[], value: string): string[] {
  return values.filter((item) => item !== value);
}

export const usePlansStore = create<PlansState>()(
  persist(
    (set, get) => ({
      likedPostIds: [],
      plannedPostIds: [],
      interestedPostIds: [],
      watchedPostIds: [],
      answeredPromptIds: [],
      savedPlanCards: {},

      toggleLike: (card) => {
        const isLiked = get().likedPostIds.includes(card.id);
        set((state) => {
          const savedPlanCards = { ...state.savedPlanCards };
          if (isLiked && savedPlanCards[card.id]?.reason === 'liked') {
            delete savedPlanCards[card.id];
          } else if (!isLiked) {
            savedPlanCards[card.id] = card;
          }
          return {
            likedPostIds: isLiked ? remove(state.likedPostIds, card.id) : unique([...state.likedPostIds, card.id]),
            savedPlanCards,
          };
        });
        return !isLiked;
      },

      markPlanned: (card) => {
        set((state) => ({
          plannedPostIds: unique([...state.plannedPostIds, card.id]),
          savedPlanCards: { ...state.savedPlanCards, [card.id]: card },
        }));
      },

      markInterested: (card, promptId) => {
        set((state) => ({
          interestedPostIds: unique([...state.interestedPostIds, card.id]),
          answeredPromptIds: promptId ? unique([...state.answeredPromptIds, promptId]) : state.answeredPromptIds,
          savedPlanCards: { ...state.savedPlanCards, [card.id]: card },
        }));
      },

      markWatched: (card) => {
        set((state) => ({
          watchedPostIds: unique([...state.watchedPostIds, card.id]),
          savedPlanCards: { ...state.savedPlanCards, [card.id]: card },
        }));
      },

      removePlanCard: (cardId) => {
        set((state) => {
          const savedPlanCards = { ...state.savedPlanCards };
          delete savedPlanCards[cardId];
          return {
            likedPostIds: remove(state.likedPostIds, cardId),
            plannedPostIds: remove(state.plannedPostIds, cardId),
            interestedPostIds: remove(state.interestedPostIds, cardId),
            watchedPostIds: remove(state.watchedPostIds, cardId),
            savedPlanCards,
          };
        });
      },
    }),
    {
      name: 'elsewhere-plans-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        likedPostIds: state.likedPostIds,
        plannedPostIds: state.plannedPostIds,
        interestedPostIds: state.interestedPostIds,
        watchedPostIds: state.watchedPostIds,
        answeredPromptIds: state.answeredPromptIds,
        savedPlanCards: state.savedPlanCards,
      }),
    },
  ),
);

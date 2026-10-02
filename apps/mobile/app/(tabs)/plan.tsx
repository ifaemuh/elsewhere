import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SOCIAL_POP } from '@/components/AppHeader';
import { api } from '@/services/api';
import { usePlansStore, type SavedPlanCard } from '@/stores/plans';
import { useHorizontalTabSwipe } from '@/hooks/useHorizontalTabSwipe';

function assetUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http') || path.startsWith('file:') || path.startsWith('ph:') || path.startsWith('assets-library:')) return path;
  return `${api.baseUrl}${path}`;
}

function PlanCard({
  card,
  index,
  onBook,
  onRemove,
}: {
  card: SavedPlanCard;
  index: number;
  onBook: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={[styles.card, index % 3 === 0 && styles.cardTall]}>
      {assetUrl(card.imageUrl) ? (
        <Image source={{ uri: assetUrl(card.imageUrl)! }} style={styles.cardImage} contentFit="cover" />
      ) : null}
      <View style={styles.cardShade} />
      <View style={styles.cardTop}>
        <Text style={styles.reason}>{card.reasonLabel}</Text>
        {card.valueLabel ? <Text style={styles.value}>{card.valueLabel}</Text> : null}
      </View>
      <View style={styles.cardCopy}>
        <Text style={styles.location} numberOfLines={1}>{card.location}</Text>
        <Text style={styles.title} numberOfLines={2}>{card.title}</Text>
        <Text style={styles.detail} numberOfLines={3}>{card.detail}</Text>
        {card.musicLabel ? <Text style={styles.music} numberOfLines={1}>{card.musicLabel}</Text> : null}
        <View style={styles.actions}>
          <Pressable style={styles.bookAction} onPress={onBook}>
            <Text style={styles.bookActionText}>book</Text>
          </Pressable>
          <Pressable style={styles.removeAction} onPress={onRemove}>
            <Text style={styles.removeActionText}>remove</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function PlanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tabSwipe = useHorizontalTabSwipe('plan');
  const savedPlanCards = usePlansStore((state) => state.savedPlanCards);
  const removePlanCard = usePlansStore((state) => state.removePlanCard);
  const ordered = Object.values(savedPlanCards)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <Animated.ScrollView
      style={[styles.screen, tabSwipe.animatedStyle]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 104 }]}
      {...tabSwipe.panHandlers}
    >
      <View style={styles.header}>
        <Text style={styles.headerKicker}>plan</Text>
        <Text style={styles.headerTitle}>Everything you liked before it becomes a trip.</Text>
      </View>

      {ordered.length ? (
        <View style={styles.grid}>
          {ordered.map((card, index) => (
            <PlanCard
              key={card.id}
              card={card}
              index={index}
              onRemove={() => removePlanCard(card.id)}
              onBook={() => {
                router.push({
                  pathname: '/trip/intake',
                  params: { initialText: card.prompt },
                });
              }}
            />
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing saved yet.</Text>
          <Text style={styles.emptyBody}>
            Like a reel, answer a prompt, or tap plan. It will land here until you book.
          </Text>
        </View>
      )}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070709' },
  content: { paddingHorizontal: 12 },
  header: {
    borderRadius: 28,
    padding: 18,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  headerKicker: {
    color: SOCIAL_POP.coral,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'lowercase',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    marginTop: 7,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '48.5%',
    minHeight: 260,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  cardTall: { minHeight: 318 },
  cardImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  cardShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.38)' },
  cardTop: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  reason: { flex: 1, color: '#fff', fontSize: 10, fontWeight: '900', textTransform: 'lowercase' },
  value: { color: '#ffdca8', fontSize: 10, fontWeight: '900' },
  cardCopy: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  location: { color: 'rgba(255,255,255,0.82)', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 16, lineHeight: 19, fontWeight: '900', marginTop: 5 },
  detail: { color: 'rgba(255,255,255,0.76)', fontSize: 11, lineHeight: 15, fontWeight: '800', marginTop: 5 },
  music: { color: 'rgba(255,255,255,0.72)', fontSize: 10, lineHeight: 12, fontWeight: '800', marginTop: 7 },
  actions: { flexDirection: 'row', gap: 7, marginTop: 10 },
  bookAction: { minHeight: 30, borderRadius: 999, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.88)' },
  bookActionText: { color: '#111114', fontSize: 11, fontWeight: '900' },
  removeAction: { minHeight: 30, borderRadius: 999, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  removeActionText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  empty: {
    borderRadius: 28,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  emptyBody: { color: 'rgba(255,255,255,0.74)', fontSize: 13, lineHeight: 19, fontWeight: '800', marginTop: 8 },
});

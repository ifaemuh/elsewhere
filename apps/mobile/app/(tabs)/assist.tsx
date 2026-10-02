import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AppHeader, SOCIAL_POP } from '@/components/AppHeader';
import { useDealRadar, useTripGuides } from '@/hooks/useTrip';
import type { TravelDealSignal } from '@elsewhere/shared';

function formatDealPrice(deal: TravelDealSignal): string {
  if (!deal.priceAmount) return 'Watch';
  return `${deal.currencyCode ?? 'USD'} ${deal.priceAmount.toLocaleString()}`;
}

export default function AssistScreen() {
  const router = useRouter();
  const { data: guides, isLoading: isLoadingGuides } = useTripGuides();
  const { data: dealRadar, isLoading: isLoadingDeals } = useDealRadar();
  const opportunities = (guides ?? [])
    .flatMap((guide) => guide.opportunities.map((opportunity) => ({ guide, opportunity })))
    .sort((a, b) => a.opportunity.priority - b.opportunity.priority);

  const protectedValue = (guides ?? []).reduce((sum, guide) => sum + guide.protectedValue, 0);
  const potentialSavings = (guides ?? []).reduce((sum, guide) => sum + guide.potentialSavings, 0);
  const topDeals = dealRadar?.deals.slice(0, 6) ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader
        pageLabel="Assist"
        tagline="rules, disruptions, credits, deals"
        actionLabel="Settings"
        onActionPress={() => router.push('/assist/settings')}
      />

      <View style={styles.summaryRow}>
        <View style={styles.summaryMetric}>
          <Text style={styles.metricLabel}>Savings found</Text>
          <Text style={styles.metricValue}>${potentialSavings.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryMetric}>
          <Text style={styles.metricLabel}>Value protected</Text>
          <Text style={styles.metricValue}>${protectedValue.toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Deal Radar</Text>
        {isLoadingDeals ? (
          <ActivityIndicator style={styles.loader} />
        ) : topDeals.length ? (
          topDeals.map((deal) => (
            <View key={deal.id} style={styles.dealCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.sourceName}>{deal.sourceName}</Text>
                <Text style={styles.sourceMeta}>{deal.confidence} confidence</Text>
              </View>
              <Text style={styles.cardTitle}>{deal.title}</Text>
              <Text style={styles.cardDetail} numberOfLines={3}>{deal.summary}</Text>
              <View style={styles.dealMetaRow}>
                <Text style={styles.price}>{formatDealPrice(deal)}</Text>
                <Text style={styles.score}>Deal {deal.dealScore} · Match {deal.relevanceScore}</Text>
              </View>
              <Text style={styles.limits} numberOfLines={2}>
                {deal.limitations[0] ?? 'Verify with official provider before action.'}
              </Text>
            </View>
          ))
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No deal signals yet</Text>
            <Text style={styles.emptyText}>Connect feeds or provider keys to expand the radar.</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trip Opportunities</Text>
        {isLoadingGuides ? (
          <ActivityIndicator style={styles.loader} />
        ) : opportunities.length ? (
          opportunities.map((item) => {
            const tone = item.opportunity.autoActionable ? SOCIAL_POP.coral : '#dd6b20';
            return (
              <Pressable
                key={item.opportunity.id}
                style={styles.card}
                onPress={() => router.push(`/trip/${item.guide.tripId}`)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.tripName}>{item.guide.tripName}</Text>
                  <Text style={[styles.status, { color: tone }]}>
                    {item.opportunity.status.replace('_', ' ')}
                  </Text>
                </View>
                <Text style={styles.cardTitle}>{item.opportunity.title}</Text>
                <Text style={styles.cardDetail} numberOfLines={3}>{item.opportunity.detail}</Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.actionLabel}>{item.opportunity.actionLabel}</Text>
                  <Text style={styles.value}>
                    ${(
                      item.opportunity.savingsAmount ??
                      item.opportunity.protectedValue ??
                      0
                    ).toLocaleString()}
                  </Text>
                </View>
              </Pressable>
            );
          })
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptyText}>No active trip opportunities. Assist is still monitoring.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SOCIAL_POP.background },
  content: { padding: 16, paddingBottom: 104 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 28, fontWeight: '800', color: '#111' },
  subtitle: { fontSize: 15, color: '#666', marginTop: 3 },
  settingsLink: { color: SOCIAL_POP.coral, fontSize: 15, fontWeight: '700', marginTop: 6 },
  summaryRow: { flexDirection: 'row', gap: 10, marginTop: 20, marginBottom: 18 },
  summaryMetric: { flex: 1, borderWidth: 1, borderColor: SOCIAL_POP.border, borderRadius: 16, padding: 14, backgroundColor: SOCIAL_POP.surface },
  metricLabel: { color: '#777', fontSize: 12, marginBottom: 5 },
  metricValue: { color: '#111', fontSize: 22, fontWeight: '800' },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 12 },
  loader: { marginVertical: 18 },
  emptyBox: { padding: 20, backgroundColor: SOCIAL_POP.surface, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: SOCIAL_POP.border },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginBottom: 6 },
  emptyText: { color: '#777', textAlign: 'center', lineHeight: 20 },
  card: { padding: 16, backgroundColor: SOCIAL_POP.surface, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: SOCIAL_POP.border },
  dealCard: { padding: 16, borderWidth: 1, borderColor: SOCIAL_POP.border, backgroundColor: SOCIAL_POP.surface, borderRadius: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  sourceName: { color: SOCIAL_POP.coral, fontSize: 12, fontWeight: '800' },
  sourceMeta: { color: '#777', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  tripName: { color: SOCIAL_POP.coral, fontSize: 12, fontWeight: '800' },
  status: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111' },
  cardDetail: { fontSize: 14, color: '#666', lineHeight: 19, marginTop: 5 },
  dealMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10 },
  price: { color: '#111', fontSize: 17, fontWeight: '800' },
  score: { color: '#777', fontSize: 12, fontWeight: '700' },
  limits: { color: '#8a5a00', fontSize: 12, lineHeight: 17, marginTop: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  actionLabel: { color: '#333', fontSize: 13, fontWeight: '700' },
  value: { color: '#111', fontSize: 15, fontWeight: '800' },
});

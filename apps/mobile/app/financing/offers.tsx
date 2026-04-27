import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { FinancingOffer } from '@elsewhere/shared';

export default function FinancingOffersScreen() {
  const { tripId, total } = useLocalSearchParams<{ tripId: string; total: string }>();
  const router = useRouter();
  const totalAmount = Number(total);

  const { data: offers, isLoading } = useQuery({
    queryKey: ['financing', 'offers', tripId],
    queryFn: () =>
      api.getFinancingOffers({
        tripId: tripId!,
        totalAmount,
        travelerCount: 1,
      }),
    enabled: !!tripId,
  });

  const handleSelect = (offer: FinancingOffer) => {
    router.push(
      `/financing/checkout?tripId=${tripId}&offerId=${offer.id}&provider=${offer.providerName}&months=${offer.months}&monthly=${offer.monthlyAmount}&total=${total}`,
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Payment Options</Text>
      <Text style={styles.total}>Trip total: ${totalAmount.toLocaleString()}</Text>

      {isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => handleSelect(item)}>
              <View style={styles.providerRow}>
                <Text style={styles.provider}>{item.providerName.toUpperCase()}</Text>
                {item.aprPercent === 0 && (
                  <View style={styles.zeroBadge}>
                    <Text style={styles.zeroText}>0% APR</Text>
                  </View>
                )}
              </View>
              <Text style={styles.monthly}>
                ${item.monthlyAmount.toFixed(2)}/mo
              </Text>
              <Text style={styles.terms}>
                {item.months} monthly payments
              </Text>
            </Pressable>
          )}
          ListFooterComponent={
            <Pressable
              style={styles.payFullButton}
              onPress={() => router.push(`/trip/checkout?tripId=${tripId}&total=${total}`)}
            >
              <Text style={styles.payFullText}>Pay in full — ${totalAmount.toLocaleString()}</Text>
            </Pressable>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  total: { fontSize: 16, color: '#666', marginBottom: 24 },
  loader: { marginTop: 40 },
  card: { padding: 20, backgroundColor: '#f8f9fa', borderRadius: 12, marginBottom: 12 },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  provider: { fontSize: 14, fontWeight: '700', color: '#333', letterSpacing: 1 },
  zeroBadge: { backgroundColor: '#38a16920', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  zeroText: { color: '#38a169', fontSize: 12, fontWeight: '600' },
  monthly: { fontSize: 28, fontWeight: '700' },
  terms: { fontSize: 14, color: '#666', marginTop: 4 },
  payFullButton: { padding: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, alignItems: 'center', marginTop: 8 },
  payFullText: { fontSize: 16, fontWeight: '600', color: '#333' },
});

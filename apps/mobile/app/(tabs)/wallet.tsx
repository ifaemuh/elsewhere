import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { Trip } from '@elsewhere/shared';

export default function WalletScreen() {
  const router = useRouter();
  const { data: trips, isLoading } = useQuery({
    queryKey: ['trips', 'list'],
    queryFn: () => api.listTrips(),
  });

  const bookedTrips = trips?.filter((t: Trip) => t.status === 'booked' || t.status === 'in_progress') ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wallet</Text>
      <Text style={styles.subtitle}>Payments and installments</Text>

      {isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : !bookedTrips.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No active trips with payments</Text>
        </View>
      ) : (
        <FlatList
          data={bookedTrips}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const raw = item as unknown as Record<string, unknown>;
            const dest = raw.destination as { name?: string } | undefined;
            return (
              <Pressable
                style={styles.card}
                onPress={() => router.push(`/financing/offers?tripId=${item.id}&total=${item.totalCost}`)}
              >
                <Text style={styles.cardTitle}>{dest?.name ?? 'Trip'}</Text>
                <View style={styles.row}>
                  <Text style={styles.label}>Total</Text>
                  <Text style={styles.amount}>
                    ${item.totalCost ? Number(item.totalCost).toLocaleString() : '—'}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Travelers</Text>
                  <Text style={styles.value}>{item.travelerCount}</Text>
                </View>
                <Text style={styles.cta}>View financing options</Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 24 },
  loader: { marginTop: 40 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 16 },
  card: { padding: 20, backgroundColor: '#f8f9fa', borderRadius: 12, marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  label: { fontSize: 14, color: '#666' },
  amount: { fontSize: 16, fontWeight: '700' },
  value: { fontSize: 14, fontWeight: '600' },
  cta: { color: '#0a7ea4', fontSize: 14, fontWeight: '600', marginTop: 12 },
});

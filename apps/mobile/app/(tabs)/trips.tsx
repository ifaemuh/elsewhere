import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export default function TripsScreen() {
  const router = useRouter();
  const { data: trips, isLoading } = useQuery({
    queryKey: ['trips', 'list'],
    queryFn: () => api.listTrips(),
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Trips</Text>
      {isLoading ? (
        <Text style={styles.loading}>Loading...</Text>
      ) : !trips?.length ? (
        <Text style={styles.empty}>No trips yet. Discover somewhere new!</Text>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/trip/${item.id}`)}
            >
              <Text style={styles.cardTitle}>{item.destinationId}</Text>
              <View style={styles.row}>
                <Text style={styles.status}>{item.status}</Text>
                <Text style={styles.cost}>
                  {item.totalCost ? `$${item.totalCost}` : 'Draft'}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 24 },
  loading: { color: '#999', marginTop: 40, textAlign: 'center' },
  empty: { color: '#999', marginTop: 40, textAlign: 'center' },
  card: { padding: 16, backgroundColor: '#f8f9fa', borderRadius: 12, marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  status: { fontSize: 14, color: '#0a7ea4', textTransform: 'capitalize' },
  cost: { fontSize: 14, fontWeight: '600' },
});

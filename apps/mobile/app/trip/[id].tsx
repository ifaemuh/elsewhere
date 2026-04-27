import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTrip } from '@/hooks/useTrip';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: trip, isLoading } = useTrip(id);

  if (isLoading || !trip) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Supabase returns joined data with snake_case keys
  const raw = trip as unknown as Record<string, unknown>;
  const destination = raw.destination as { name?: string; country?: string } | undefined;
  const statusColor = trip.status === 'booked' ? '#38a169' : trip.status === 'draft' ? '#dd6b20' : '#0a7ea4';

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{destination?.name ?? 'Trip'}</Text>
      <Text style={styles.country}>{destination?.country}</Text>

      <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>
          {trip.status.replace('_', ' ').toUpperCase()}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Travelers</Text>
          <Text style={styles.value}>{trip.travelerCount}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Total Cost</Text>
          <Text style={styles.value}>
            {trip.totalCost ? `$${Number(trip.totalCost).toLocaleString()}` : '—'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Booking State</Text>
          <Text style={styles.value}>{trip.bookingFlowState ?? (raw.booking_flow_state as string)}</Text>
        </View>
      </View>

      {trip.status === 'booked' && (
        <Pressable style={styles.roomButton} onPress={() => router.push(`/trip/room?tripId=${id}`)}>
          <Text style={styles.roomButtonText}>Open Trip House</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '700' },
  country: { fontSize: 16, color: '#666', marginTop: 4 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginTop: 16 },
  statusText: { fontWeight: '600', fontSize: 12, textTransform: 'uppercase' },
  section: { marginTop: 32 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  label: { fontSize: 14, color: '#666' },
  value: { fontSize: 14, fontWeight: '600' },
  roomButton: { backgroundColor: '#0a7ea4', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 32 },
  roomButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});

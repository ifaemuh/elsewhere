import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

interface IncidentRow {
  id: string;
  title: string;
  detail: string;
  severity: string;
  resolution_state: string;
  created_at: string;
  event?: { source: string; kind: string };
}

export default function AssistScreen() {
  const router = useRouter();
  const { data: incidents, isLoading } = useQuery({
    queryKey: ['assist', 'incidents'],
    queryFn: () => api.getAssistIncidents() as unknown as Promise<IncidentRow[]>,
  });

  const severityColor = (s: string) =>
    s === 'high' ? '#e53e3e' : s === 'medium' ? '#dd6b20' : '#38a169';

  const stateLabel = (s: string) =>
    s === 'auto_resolved' ? 'Resolved' :
    s === 'escalation_prepared' ? 'Escalated' : 'Monitoring';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Travel Assist</Text>
        <Pressable onPress={() => router.push('/assist/settings')}>
          <Text style={styles.settingsLink}>Settings</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>Real-time trip protection</Text>

      {isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : !incidents?.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>All clear</Text>
          <Text style={styles.emptyText}>No active disruptions. We're monitoring your trips.</Text>
        </View>
      ) : (
        <FlatList
          data={incidents}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/assist/${item.id}`)}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.severityDot, { backgroundColor: severityColor(item.severity) }]} />
                <Text style={styles.cardTitle}>{item.title}</Text>
              </View>
              <Text style={styles.cardDetail} numberOfLines={2}>{item.detail}</Text>
              <View style={styles.cardFooter}>
                <Text style={[styles.state, { color: severityColor(item.severity) }]}>
                  {stateLabel(item.resolution_state)}
                </Text>
                <Text style={styles.time}>
                  {new Date(item.created_at).toLocaleString()}
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '700' },
  settingsLink: { color: '#0a7ea4', fontSize: 16, fontWeight: '600' },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 24 },
  loader: { marginTop: 40 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  emptyText: { color: '#999', fontSize: 14, textAlign: 'center' },
  card: { padding: 16, backgroundColor: '#f8f9fa', borderRadius: 12, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  severityDot: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { fontSize: 16, fontWeight: '600', flex: 1 },
  cardDetail: { fontSize: 14, color: '#666', marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  state: { fontSize: 13, fontWeight: '600' },
  time: { fontSize: 12, color: '#999' },
});

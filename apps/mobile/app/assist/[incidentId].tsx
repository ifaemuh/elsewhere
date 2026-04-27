import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';

interface TimelineEntry {
  id: string;
  entry_type: string;
  title: string;
  detail: string;
  created_at: string;
}

interface Recommendation {
  id: string;
  action_type: string;
  status: string;
  reason: string;
  priority: number;
}

interface IncidentDetail {
  id: string;
  title: string;
  detail: string;
  severity: string;
  resolution_state: string;
  created_at: string;
  event?: { source: string; kind: string; reference_code: string; occurred_at: string };
  timeline?: TimelineEntry[];
  recommendations?: Recommendation[];
}

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function IncidentDetailScreen() {
  const { incidentId } = useLocalSearchParams<{ incidentId: string }>();
  const queryClient = useQueryClient();

  const { data: incidents, isLoading } = useQuery({
    queryKey: ['assist', 'incidents'],
    queryFn: async () => {
      const token = useAuthStore.getState().session?.access_token;
      const res = await fetch(`${API_BASE}/api/v1/assist/incidents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json() as Promise<IncidentDetail[]>;
    },
  });

  const incident = incidents?.find((i) => i.id === incidentId);

  const actionMutation = useMutation({
    mutationFn: async (action: 'resolve' | 'escalate') => {
      const token = useAuthStore.getState().session?.access_token;
      const res = await fetch(`${API_BASE}/api/v1/assist/incidents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ incidentId, action }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assist', 'incidents'] });
    },
  });

  if (isLoading || !incident) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const severityColor =
    incident.severity === 'high' ? '#e53e3e' :
    incident.severity === 'medium' ? '#dd6b20' : '#38a169';

  const isResolved = incident.resolution_state !== 'monitoring';
  const timeline = incident.timeline?.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  ) ?? [];

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={[styles.severityBanner, { backgroundColor: severityColor + '15' }]}>
        <Text style={[styles.severityText, { color: severityColor }]}>
          {incident.severity.toUpperCase()} SEVERITY
        </Text>
      </View>

      <Text style={styles.title}>{incident.title}</Text>
      <Text style={styles.detail}>{incident.detail}</Text>

      {/* Event info */}
      {incident.event && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Disruption Details</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Source</Text>
            <Text style={styles.value}>{incident.event.source}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Type</Text>
            <Text style={styles.value}>{incident.event.kind}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Reference</Text>
            <Text style={styles.value}>{incident.event.reference_code}</Text>
          </View>
        </View>
      )}

      {/* Recommendations */}
      {incident.recommendations?.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recommendations</Text>
          {incident.recommendations.map((rec) => (
            <View key={rec.id} style={styles.recCard}>
              <View style={styles.recHeader}>
                <Text style={styles.recAction}>{rec.action_type.replace('_', ' ')}</Text>
                <Text style={[styles.recStatus, { color: rec.status === 'allowed' ? '#38a169' : '#e53e3e' }]}>
                  {rec.status}
                </Text>
              </View>
              <Text style={styles.recReason}>{rec.reason}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Timeline</Text>
        {timeline.map((entry, i) => (
          <View key={entry.id} style={styles.timelineItem}>
            <View style={styles.timelineDot} />
            {i < timeline.length - 1 && <View style={styles.timelineLine} />}
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>{entry.title}</Text>
              <Text style={styles.timelineDetail}>{entry.detail}</Text>
              <Text style={styles.timelineTime}>
                {new Date(entry.created_at).toLocaleString()}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Actions */}
      {!isResolved && (
        <View style={styles.actions}>
          <Pressable
            style={styles.resolveButton}
            onPress={() => actionMutation.mutate('resolve')}
            disabled={actionMutation.isPending}
          >
            <Text style={styles.resolveText}>Mark Resolved</Text>
          </Pressable>
          <Pressable
            style={styles.escalateButton}
            onPress={() => actionMutation.mutate('escalate')}
            disabled={actionMutation.isPending}
          >
            <Text style={styles.escalateText}>Escalate</Text>
          </Pressable>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  severityBanner: { padding: 12, alignItems: 'center' },
  severityText: { fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: '700', padding: 16, paddingBottom: 4 },
  detail: { fontSize: 15, color: '#666', paddingHorizontal: 16, paddingBottom: 16 },
  section: { paddingHorizontal: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  label: { fontSize: 14, color: '#666' },
  value: { fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  recCard: { backgroundColor: '#f8f9fa', borderRadius: 8, padding: 12, marginBottom: 8 },
  recHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  recAction: { fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  recStatus: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  recReason: { fontSize: 13, color: '#666' },
  timelineItem: { flexDirection: 'row', paddingLeft: 4, minHeight: 60 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0a7ea4', marginTop: 4 },
  timelineLine: { position: 'absolute', left: 8, top: 14, width: 2, height: '100%', backgroundColor: '#ddd' },
  timelineContent: { flex: 1, marginLeft: 12, paddingBottom: 16 },
  timelineTitle: { fontSize: 14, fontWeight: '600' },
  timelineDetail: { fontSize: 13, color: '#666', marginTop: 2 },
  timelineTime: { fontSize: 11, color: '#999', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 12, padding: 16 },
  resolveButton: { flex: 1, backgroundColor: '#38a169', padding: 14, borderRadius: 10, alignItems: 'center' },
  resolveText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  escalateButton: { flex: 1, backgroundColor: '#dd6b20', padding: 14, borderRadius: 10, alignItems: 'center' },
  escalateText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});

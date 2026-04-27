import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

export default function FinancingCheckoutScreen() {
  const { tripId, offerId, provider, months, monthly, total } = useLocalSearchParams<{
    tripId: string;
    offerId: string;
    provider: string;
    months: string;
    monthly: string;
    total: string;
  }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const checkoutMutation = useMutation({
    mutationFn: () =>
      api.financingCheckout({
        offerId: offerId!,
        tripId: tripId!,
        totalAmount: Number(total),
        travelerCount: 1,
        policyVersion: '2026.04.v1',
        idempotencyKey: `fin-${tripId}-${offerId}-${Date.now()}`,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      router.replace(`/trip/${tripId}`);
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Confirm Financing</Text>

      <View style={styles.summary}>
        <View style={styles.providerBadge}>
          <Text style={styles.providerText}>{provider?.toUpperCase()}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Monthly payment</Text>
          <Text style={styles.monthlyAmount}>${Number(monthly).toFixed(2)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Duration</Text>
          <Text style={styles.value}>{months} months</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Total</Text>
          <Text style={styles.value}>${Number(total).toLocaleString()}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Interest</Text>
          <Text style={styles.zeroApr}>0%</Text>
        </View>
      </View>

      <Text style={styles.disclosure}>
        By confirming, you agree to the financing terms and authorize {provider} to
        process {months} monthly payments of ${Number(monthly).toFixed(2)}.
      </Text>

      <Pressable
        style={[styles.confirmButton, checkoutMutation.isPending && styles.buttonDisabled]}
        onPress={() => checkoutMutation.mutate()}
        disabled={checkoutMutation.isPending}
      >
        {checkoutMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.confirmText}>Confirm & Book</Text>
        )}
      </Pressable>

      {checkoutMutation.isError && (
        <Text style={styles.error}>{checkoutMutation.error?.message}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
  summary: { backgroundColor: '#f8f9fa', borderRadius: 12, padding: 20, marginBottom: 24 },
  providerBadge: { backgroundColor: '#0a7ea420', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, marginBottom: 16 },
  providerText: { color: '#0a7ea4', fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  label: { fontSize: 14, color: '#666' },
  monthlyAmount: { fontSize: 20, fontWeight: '700' },
  value: { fontSize: 14, fontWeight: '600' },
  zeroApr: { fontSize: 14, fontWeight: '700', color: '#38a169' },
  disclosure: { fontSize: 13, color: '#999', lineHeight: 18, marginBottom: 24 },
  confirmButton: { backgroundColor: '#0a7ea4', padding: 18, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  error: { color: '#e53e3e', fontSize: 14, textAlign: 'center', marginTop: 16 },
});

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

export default function CheckoutScreen() {
  const { tripId, total } = useLocalSearchParams<{ tripId: string; total: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'review' | 'paying' | 'confirming'>('review');

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      setStep('paying');
      // Create checkout session (advances booking: quote_created -> reserving_inventory -> payment_pending)
      await api.createCheckoutSession({ tripId: tripId! });

      // Simulate payment completion (in production, this would be a webhook callback)
      setStep('confirming');

      // Confirm the booking (payment_pending -> confirmed)
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1/trips/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tripId }),
        },
      );
      if (!res.ok) throw new Error('Confirmation failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      router.replace(`/trip/${tripId}`);
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Checkout</Text>

      <View style={styles.summary}>
        <Text style={styles.label}>Total</Text>
        <Text style={styles.total}>${Number(total).toLocaleString()}</Text>
      </View>

      <View style={styles.summary}>
        <Text style={styles.label}>Travelers</Text>
        <Text style={styles.value}>1</Text>
      </View>

      {step === 'review' && (
        <Pressable
          style={styles.payButton}
          onPress={() => checkoutMutation.mutate()}
        >
          <Text style={styles.payButtonText}>Pay Now</Text>
        </Pressable>
      )}

      {step === 'paying' && (
        <View style={styles.statusContainer}>
          <ActivityIndicator size="large" color="#0a7ea4" />
          <Text style={styles.statusText}>Processing payment...</Text>
        </View>
      )}

      {step === 'confirming' && (
        <View style={styles.statusContainer}>
          <ActivityIndicator size="large" color="#0a7ea4" />
          <Text style={styles.statusText}>Confirming booking...</Text>
        </View>
      )}

      {checkoutMutation.isError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {checkoutMutation.error?.message ?? 'Something went wrong'}
          </Text>
          <Pressable style={styles.retryButton} onPress={() => { setStep('review'); checkoutMutation.reset(); }}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 32 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  label: { fontSize: 16, color: '#666' },
  total: { fontSize: 24, fontWeight: '700' },
  value: { fontSize: 16, fontWeight: '600' },
  payButton: { backgroundColor: '#0a7ea4', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 32 },
  payButtonText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  statusContainer: { alignItems: 'center', marginTop: 40 },
  statusText: { fontSize: 16, color: '#666', marginTop: 16 },
  errorContainer: { alignItems: 'center', marginTop: 32 },
  errorText: { color: '#e53e3e', fontSize: 14, textAlign: 'center' },
  retryButton: { marginTop: 16, padding: 12, backgroundColor: '#f8f9fa', borderRadius: 8 },
  retryText: { color: '#0a7ea4', fontWeight: '600' },
});

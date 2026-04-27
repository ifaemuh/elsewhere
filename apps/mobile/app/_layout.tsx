import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 2,
    },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="trip/[id]" options={{ headerShown: true, title: 'Trip' }} />
        <Stack.Screen name="trip/checkout" options={{ headerShown: true, title: 'Checkout' }} />
        <Stack.Screen name="trip/room" options={{ headerShown: true, title: 'Trip House' }} />
        <Stack.Screen name="preview/[jobId]" options={{ headerShown: true, title: 'Preview' }} />
        <Stack.Screen name="selfie-capture" options={{ headerShown: true, title: 'Take a Selfie', presentation: 'modal' }} />
        <Stack.Screen name="financing/offers" options={{ headerShown: true, title: 'Financing' }} />
        <Stack.Screen name="financing/checkout" options={{ headerShown: true, title: 'Financing Checkout' }} />
        <Stack.Screen name="assist/[incidentId]" options={{ headerShown: true, title: 'Incident' }} />
        <Stack.Screen name="assist/settings" options={{ headerShown: true, title: 'Assist Settings' }} />
      </Stack>
    </QueryClientProvider>
  );
}

import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { usePreviewJob } from '@/hooks/usePreviewJob';
import { useReferencePhotos } from '@/hooks/useReferencePhotos';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useState } from 'react';

export default function PreviewScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const { data: job, isLoading } = usePreviewJob(jobId);
  const { photos } = useReferencePhotos();
  const [imageError, setImageError] = useState<string | null>(null);
  const referencePhoto = photos.find((photo) => photo.id === job?.referencePhotoIds?.[0]);

  const quoteMutation = useMutation({
    mutationFn: async () => {
      if (!job?.destinationId) throw new Error('No destination');
      const quote = await api.quoteTrip({
        destinationId: job.destinationId,
        travelerCount: 1,
      });
      return quote;
    },
    onSuccess: (data) => {
      router.push(`/trip/checkout?tripId=${data.tripId}&total=${data.total}`);
    },
  });

  if (isLoading || !job) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.statusText}>Loading...</Text>
      </View>
    );
  }

  if (job.status === 'pending' || job.status === 'processing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0a7ea4" />
        <Text style={styles.statusText}>
          {job.status === 'pending' ? 'Starting preview...' : 'Generating your preview...'}
        </Text>
        <Text style={styles.hint}>
          {job.referencePhotoIds?.length
            ? 'Personalizing your preview... this usually takes 30-60 seconds'
            : 'This usually takes 15-30 seconds'}
        </Text>
      </View>
    );
  }

  if (job.status === 'failed') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Preview Failed</Text>
        <Text style={styles.errorMessage}>{job.errorMessage ?? 'Unknown error'}</Text>
        <Pressable style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {job.playbackUrl && (
        <Image
          source={{ uri: job.playbackUrl }}
          style={styles.previewImage}
          contentFit="cover"
          transition={300}
          onError={() => setImageError(job.playbackUrl ?? 'Preview image failed to load')}
        />
      )}
      {imageError && (
        <View style={styles.imageError}>
          <Text style={styles.imageErrorText}>Preview image could not load.</Text>
          <Text style={styles.imageErrorUrl}>{imageError}</Text>
        </View>
      )}
      <View style={styles.content}>
        {job.referencePhotoIds?.length ? (
          <View style={styles.personalizedBadge}>
            <Text style={styles.personalizedBadgeText}>Personalized for you</Text>
          </View>
        ) : null}
        {referencePhoto ? (
          <View style={styles.referenceRow}>
            <Image
              source={{ uri: referencePhoto.url }}
              style={styles.referenceThumb}
              contentFit="cover"
            />
            <View style={styles.referenceTextBlock}>
              <Text style={styles.referenceLabel}>Reference used</Text>
              <Text style={styles.referenceMeta}>Compare this to the generated subject.</Text>
            </View>
          </View>
        ) : null}
        <Text style={styles.destination}>{job.destinationName}</Text>
        <Text style={styles.prompt}>{job.prompt}</Text>
        <Pressable
          style={[styles.bookButton, quoteMutation.isPending && styles.buttonDisabled]}
          onPress={() => quoteMutation.mutate()}
          disabled={quoteMutation.isPending}
        >
          {quoteMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.bookButtonText}>Plan This Trip</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  statusText: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  hint: { fontSize: 14, color: '#999', marginTop: 8 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: '#e53e3e' },
  errorMessage: { fontSize: 14, color: '#666', marginTop: 8, textAlign: 'center' },
  retryButton: { marginTop: 24, padding: 14, backgroundColor: '#0a7ea4', borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  previewImage: { width: '100%', height: '60%' },
  imageError: {
    position: 'absolute',
    top: 120,
    left: 20,
    right: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    padding: 12,
  },
  imageErrorText: { color: '#c53030', fontWeight: '700', fontSize: 14 },
  imageErrorUrl: { color: '#555', fontSize: 11, marginTop: 4 },
  content: { flex: 1, padding: 24, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24 },
  destination: { fontSize: 24, fontWeight: '700' },
  prompt: { fontSize: 14, color: '#666', marginTop: 8 },
  bookButton: { backgroundColor: '#0a7ea4', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.5 },
  bookButtonText: { color: '#fff', fontWeight: '600', fontSize: 18 },
  personalizedBadge: {
    backgroundColor: '#f0f7fa', alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginBottom: 8,
  },
  personalizedBadgeText: { color: '#0a7ea4', fontSize: 12, fontWeight: '600' },
  referenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  referenceThumb: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#eee' },
  referenceTextBlock: { flex: 1 },
  referenceLabel: { fontSize: 13, fontWeight: '700', color: '#333' },
  referenceMeta: { fontSize: 12, color: '#777', marginTop: 2 },
});

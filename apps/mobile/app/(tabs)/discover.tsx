import { useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { api } from '@/services/api';
import { useReferencePhotos } from '@/hooks/useReferencePhotos';
import type { Destination } from '@elsewhere/shared';
import { totalCost } from '@elsewhere/shared';

export default function DiscoverScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<Destination | null>(null);
  const [prompt, setPrompt] = useState('');
  const [identityConsentAccepted, setIdentityConsentAccepted] = useState(false);
  const { photos, hasPhotos } = useReferencePhotos();

  const { data: destinations, isLoading } = useQuery({
    queryKey: ['destinations', 'featured'],
    queryFn: () => api.getFeaturedDestinations(),
  });

  const consentMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('No destination selected');
      const consent = await api.submitConsent({
        destinationName: selected.name,
        prompt,
        hasIdentityConsent: hasPhotos && identityConsentAccepted,
        hasRightsConfirmation: true,
        hasReferenceMedia: hasPhotos,
        policyVersion: '2026.04.v1',
      });
      return consent;
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (consentId: string) => {
      if (!selected) throw new Error('No destination selected');
      return api.createPreviewJob({
        destinationId: selected.id,
        destinationName: selected.name,
        prompt,
        consentId,
        referencePhotoIds: hasPhotos && identityConsentAccepted
          ? photos.map((p) => p.id)
          : undefined,
      });
    },
    onSuccess: (data) => {
      router.push(`/preview/${data.jobId}`);
    },
  });

  const handleGeneratePreview = async () => {
    const consent = await consentMutation.mutateAsync();
    await previewMutation.mutateAsync(consent.consentId);
  };

  const isGenerating = consentMutation.isPending || previewMutation.isPending;
  const isPersonalized = hasPhotos && identityConsentAccepted;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Discover</Text>
      <Text style={styles.subtitle}>Where do you want to go?</Text>

      {isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={destinations}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            selected ? (
              <View style={styles.previewSection}>
                <Text style={styles.selectedName}>{selected.name}</Text>
                <Text style={styles.selectedCost}>
                  From ${totalCost(selected).toLocaleString()} per person
                </Text>

                {/* Selfie CTA */}
                {!hasPhotos ? (
                  <Pressable
                    style={styles.selfieCard}
                    onPress={() => router.push('/selfie-capture')}
                  >
                    <Text style={styles.selfieCardTitle}>Add your selfie</Text>
                    <Text style={styles.selfieCardSubtitle}>
                      See yourself in the preview
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.photosRow}>
                    {photos.slice(0, 3).map((photo) => (
                      <Image
                        key={photo.id}
                        source={{ uri: photo.url }}
                        style={styles.photoThumb}
                        contentFit="cover"
                      />
                    ))}
                    <Pressable onPress={() => router.push('/selfie-capture')}>
                      <Text style={styles.changeLink}>Change</Text>
                    </Pressable>
                  </View>
                )}

                <TextInput
                  style={styles.promptInput}
                  placeholder="Describe your dream trip..."
                  placeholderTextColor="#999"
                  value={prompt}
                  onChangeText={setPrompt}
                  multiline
                />

                {/* Identity consent disclosure */}
                {hasPhotos && (
                  <Pressable
                    style={styles.consentRow}
                    onPress={() => setIdentityConsentAccepted(!identityConsentAccepted)}
                  >
                    <View style={[styles.checkbox, identityConsentAccepted && styles.checkboxChecked]}>
                      {identityConsentAccepted && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.consentText}>
                      I consent to Elsewhere processing my facial likeness for the sole purpose of
                      creating this preview. My photos are encrypted at rest and can be deleted
                      anytime from my profile.
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  style={[styles.generateButton, (!prompt || isGenerating) && styles.buttonDisabled]}
                  onPress={handleGeneratePreview}
                  disabled={!prompt || isGenerating}
                >
                  {isGenerating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.generateButtonText}>
                      {isPersonalized ? 'Generate Personalized Preview' : 'Generate Preview'}
                    </Text>
                  )}
                </Pressable>
                <Pressable onPress={() => { setSelected(null); setIdentityConsentAccepted(false); }}>
                  <Text style={styles.backLink}>Choose different destination</Text>
                </Pressable>
              </View>
            ) : null
          }
          renderItem={({ item }) =>
            selected ? null : (
              <Pressable style={styles.card} onPress={() => setSelected(item)}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardCountry}>{item.country}</Text>
                <Text style={styles.cardTeaser}>{item.teaser}</Text>
                <Text style={styles.cardPrice}>
                  From ${totalCost(item).toLocaleString()}
                </Text>
              </Pressable>
            )
          }
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
  previewSection: { marginBottom: 24 },
  selectedName: { fontSize: 24, fontWeight: '700' },
  selectedCost: { fontSize: 16, color: '#0a7ea4', marginTop: 4, marginBottom: 16 },
  selfieCard: {
    backgroundColor: '#f0f7fa', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#0a7ea4', borderStyle: 'dashed', marginBottom: 16,
  },
  selfieCardTitle: { fontSize: 16, fontWeight: '600', color: '#0a7ea4' },
  selfieCardSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  photosRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  photoThumb: { width: 48, height: 48, borderRadius: 24 },
  changeLink: { color: '#0a7ea4', fontSize: 14, fontWeight: '600', marginLeft: 4 },
  promptInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16,
    fontSize: 16, minHeight: 100, textAlignVertical: 'top',
  },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12, gap: 10 },
  checkbox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#ccc',
    justifyContent: 'center', alignItems: 'center', marginTop: 2,
  },
  checkboxChecked: { backgroundColor: '#0a7ea4', borderColor: '#0a7ea4' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  consentText: { flex: 1, fontSize: 12, color: '#666', lineHeight: 18 },
  generateButton: {
    backgroundColor: '#0a7ea4', padding: 16, borderRadius: 12,
    alignItems: 'center', marginTop: 12,
  },
  buttonDisabled: { opacity: 0.5 },
  generateButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  backLink: { color: '#0a7ea4', textAlign: 'center', marginTop: 12, fontSize: 14 },
  card: { padding: 20, backgroundColor: '#f8f9fa', borderRadius: 12, marginBottom: 12 },
  cardTitle: { fontSize: 20, fontWeight: '600' },
  cardCountry: { fontSize: 14, color: '#666', marginTop: 2 },
  cardTeaser: { fontSize: 14, color: '#444', marginTop: 8 },
  cardPrice: { fontSize: 14, fontWeight: '600', color: '#0a7ea4', marginTop: 8 },
});

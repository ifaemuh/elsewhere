import { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useReferencePhotos } from '@/hooks/useReferencePhotos';

type CameraRef = InstanceType<typeof CameraView>;

export default function SelfieCaptureScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraRef>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const { photos, uploadPhoto, deletePhoto, isUploading, uploadError } = useReferencePhotos();

  const photoCount = photos.length;
  const maxPhotos = 8;

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera Access Needed</Text>
        <Text style={styles.subtitle}>
          We need camera access to take your selfie for personalized vacation previews.
        </Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Grant Access</Text>
        </Pressable>
      </View>
    );
  }

  // Review captured photo
  if (capturedUri) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: capturedUri }} style={styles.previewImage} contentFit="cover" />
        <View style={styles.reviewActions}>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => setCapturedUri(null)}
            disabled={isUploading}
          >
            <Text style={styles.secondaryButtonText}>Retake</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, isUploading && styles.buttonDisabled]}
            onPress={async () => {
              try {
                setError(null);
                await uploadPhoto(capturedUri);
                setCapturedUri(null);
                if (photoCount + 1 >= maxPhotos) {
                  router.back();
                }
              } catch (err) {
                setError((err as Error).message);
              }
            }}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Use This Photo</Text>
            )}
          </Pressable>
        </View>
        {(error || uploadError) && (
          <Text style={styles.errorText}>{error ?? uploadError}</Text>
        )}
      </View>
    );
  }

  // Camera capture
  return (
    <View style={styles.container}>
      <View style={styles.cameraWrap}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="front"
          mirror
        />
        <View pointerEvents="none" style={styles.overlay}>
          <View style={styles.faceGuide} />
        </View>
        <View pointerEvents="none" style={styles.guidance}>
          <Text style={styles.guidanceText}>Build your reference library</Text>
          <Text style={styles.guidanceSubtext}>Selfies, half-body, full-body, good lighting</Text>
          <Text style={styles.photoCounter}>{photoCount}/{maxPhotos} photos</Text>
        </View>
      </View>

      {photoCount > 0 && (
        <View style={styles.savedStrip}>
          <Text style={styles.savedStripTitle}>Saved references</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.savedScroller}
          >
            {photos.map((photo) => (
              <View key={photo.id} style={styles.savedPhotoWrap}>
                <Image source={{ uri: photo.url }} style={styles.savedPhoto} contentFit="cover" />
                <Pressable
                  style={styles.deletePhotoButton}
                  disabled={deletingPhotoId === photo.id}
                  onPress={async () => {
                    try {
                      setError(null);
                      setDeletingPhotoId(photo.id);
                      await deletePhoto(photo.id);
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setDeletingPhotoId(null);
                    }
                  }}
                >
                  <Text style={styles.deletePhotoText}>
                    {deletingPhotoId === photo.id ? '...' : '×'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.captureBar}>
        <Pressable
          style={styles.captureButton}
          onPress={async () => {
            if (photoCount >= maxPhotos) return;
            const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
            if (photo?.uri) setCapturedUri(photo.uri);
          }}
          disabled={photoCount >= maxPhotos}
        >
          <View style={styles.captureInner} />
        </Pressable>
        {photoCount >= maxPhotos && (
          <Text style={styles.maxPhotosText}>Delete one saved photo to add another.</Text>
        )}
      </View>

      {photoCount > 0 && (
        <Pressable style={styles.doneButton} onPress={() => router.back()}>
          <Text style={styles.doneButtonText}>Done ({photoCount} photo{photoCount !== 1 ? 's' : ''})</Text>
        </Pressable>
      )}
      {(error || uploadError) && (
        <Text style={styles.cameraErrorText}>{error ?? uploadError}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  cameraWrap: { flex: 1 },
  camera: { ...StyleSheet.absoluteFillObject },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  faceGuide: {
    width: 220, height: 280, borderRadius: 110,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderStyle: 'dashed',
  },
  guidance: { position: 'absolute', bottom: 120, left: 0, right: 0, alignItems: 'center' },
  guidanceText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  guidanceSubtext: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 4 },
  photoCounter: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 8 },
  savedStrip: {
    position: 'absolute',
    top: 112,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 14,
    padding: 10,
  },
  savedStripTitle: { color: '#fff', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  savedScroller: { gap: 8, paddingRight: 8 },
  savedPhotoWrap: { width: 56, height: 56 },
  savedPhoto: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#222' },
  deletePhotoButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletePhotoText: { color: '#111', fontSize: 16, fontWeight: '800', lineHeight: 18 },
  captureBar: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' },
  captureButton: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  maxPhotosText: { color: '#fff', fontSize: 12, marginTop: 10 },
  previewImage: { flex: 1 },
  reviewActions: {
    flexDirection: 'row', justifyContent: 'space-around',
    padding: 24, backgroundColor: '#000',
  },
  primaryButton: { backgroundColor: '#0a7ea4', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  primaryButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  secondaryButton: { backgroundColor: '#333', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  secondaryButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },
  errorText: { color: '#ffb4b4', paddingHorizontal: 24, paddingBottom: 16, textAlign: 'center' },
  doneButton: {
    position: 'absolute', top: 60, right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  doneButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  cameraErrorText: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 128,
    color: '#ffb4b4',
    textAlign: 'center',
  },
});

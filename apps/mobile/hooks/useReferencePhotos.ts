import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import * as ImageManipulator from 'expo-image-manipulator';
import type { ReferencePhoto } from '@elsewhere/shared';

export function useReferencePhotos() {
  const queryClient = useQueryClient();

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ['reference-photos'],
    queryFn: () => api.listReferencePhotos(),
  });

  const uploadMutation = useMutation({
    mutationFn: async (uri: string) => {
      // Compress to max 1MB WebP
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.WEBP },
      );

      const fileName = `selfie-${Date.now()}.webp`;
      const formData = new FormData();
      formData.append('file', {
        uri: manipulated.uri,
        name: fileName,
        type: 'image/webp',
      } as unknown as Blob);
      formData.append('fileName', fileName);
      formData.append('contentType', 'image/webp');

      return api.uploadReferencePhoto(formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-photos'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => api.deleteReferencePhoto(photoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-photos'] });
    },
  });

  return {
    photos: photos as ReferencePhoto[],
    hasPhotos: photos.length > 0,
    isLoading,
    uploadPhoto: uploadMutation.mutateAsync,
    deletePhoto: deleteMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
  };
}

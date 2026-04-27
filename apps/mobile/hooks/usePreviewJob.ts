import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { PreviewJob } from '@elsewhere/shared';

export function usePreviewJob(jobId: string | undefined) {
  return useQuery<PreviewJob>({
    queryKey: ['preview-jobs', jobId],
    queryFn: () => api.getPreviewJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'pending' || status === 'processing') return 2000;
      return false;
    },
  });
}

export interface SocialPublishingProviderStatus {
  provider: 'instagram' | 'tiktok';
  configured: boolean;
  nativeShareSupported: boolean;
  apiPostingSupported: boolean;
  statusLabel: string;
  limitation: string;
  requiredSetup: string[];
}

export interface SocialPublishingStatus {
  generatedAt: string;
  providers: SocialPublishingProviderStatus[];
}

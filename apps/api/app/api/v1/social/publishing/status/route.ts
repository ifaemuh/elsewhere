import { NextResponse } from 'next/server';
import type { SocialPublishingStatus } from '@elsewhere/shared';

export async function GET() {
  const tiktokConfigured = Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
  const instagramConfigured = Boolean(process.env.META_APP_ID || process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN);

  const status: SocialPublishingStatus = {
    generatedAt: new Date().toISOString(),
    providers: [
      {
        provider: 'instagram',
        configured: instagramConfigured,
        nativeShareSupported: true,
        apiPostingSupported: Boolean(process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN),
        statusLabel: instagramConfigured ? 'Ready for native share testing' : 'Native share only',
        limitation: 'Personal Instagram saved-story/highlight automation is treated as assisted export first. Graph publishing requires eligible app/account setup.',
        requiredSetup: [
          'Meta app ID for native story/share flows',
          'Eligible Instagram professional account for Graph publishing',
          'Explicit user consent before publishing or linking posts back to a trip',
        ],
      },
      {
        provider: 'tiktok',
        configured: tiktokConfigured,
        nativeShareSupported: true,
        apiPostingSupported: tiktokConfigured,
        statusLabel: tiktokConfigured ? 'Developer credentials detected' : 'Developer credentials missing',
        limitation: 'TikTok direct posting requires developer app setup, Content Posting API access, creator authorization, and video.publish approval.',
        requiredSetup: [
          'TikTok client key and client secret',
          'Content Posting API enabled',
          'video.publish scope approval before direct posting',
          'User-facing caption, privacy, and consent controls',
        ],
      },
    ],
  };

  return NextResponse.json(status);
}

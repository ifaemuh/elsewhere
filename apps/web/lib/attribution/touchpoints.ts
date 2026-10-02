import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PostLink } from './link';

export async function recordTouchpoint(anonymousId: string, link: PostLink): Promise<void> {
  // Links live in published posts: a failed insert must never break the redirect.
  try {
    const { error } = await createAdminClient().from('attribution_touchpoints').insert({
      anonymous_id: anonymousId,
      post_id: link.postId,
      platform: link.platform,
      landing_path: link.landingPath,
      utm: link.utm,
    });
    if (error) console.error('touchpoint failed', error.message);
  } catch (error) {
    console.error('touchpoint failed', error instanceof Error ? error.message : 'unknown error');
  }
}

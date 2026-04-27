import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { previewConsentRequestSchema } from '@elsewhere/shared';
import { errorResponse } from '@lib/utils/errors';
import { isLocalDev } from '@lib/storage';
import { consentStore } from '@lib/stores/memory';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(req);
    const body = await req.json();
    const validated = previewConsentRequestSchema.parse(body);

    const consentId = `consent-${randomUUID()}`;
    const now = new Date().toISOString();

    if (isLocalDev()) {
      consentStore.create({
        id: consentId,
        user_id: user.id,
        destination_name: validated.destinationName,
        prompt: validated.prompt,
        has_identity_consent: validated.hasIdentityConsent,
        has_rights_confirmation: validated.hasRightsConfirmation,
        has_reference_media: validated.hasReferenceMedia,
        policy_version: validated.policyVersion,
      });
      return NextResponse.json({ consentId, storedAt: now });
    }

    const { error } = await supabase.from('consent_audit_entries').insert({
      user_id: user.id,
      consent_id: consentId,
      destination_name: validated.destinationName,
      prompt: validated.prompt,
      has_identity_consent: validated.hasIdentityConsent,
      has_rights_confirmation: validated.hasRightsConfirmation,
      has_reference_media: validated.hasReferenceMedia,
      policy_version: validated.policyVersion,
      occurred_at: now,
    });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to record consent', message: error.message, statusCode: 500 },
        { status: 500 },
      );
    }

    return NextResponse.json({ consentId, storedAt: now });
  } catch (error) {
    return errorResponse(error);
  }
}

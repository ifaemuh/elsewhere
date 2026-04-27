export interface PreviewConsentRequest {
  destinationName: string;
  prompt: string;
  hasIdentityConsent: boolean;
  hasRightsConfirmation: boolean;
  hasReferenceMedia: boolean;
  policyVersion: string;
}

export interface PreviewConsentResult {
  consentId: string;
  storedAt: string;
}

export interface ConsentAuditEntry {
  id: string;
  userId: string;
  consentId: string;
  destinationName: string;
  prompt: string;
  hasIdentityConsent: boolean;
  hasRightsConfirmation: boolean;
  hasReferenceMedia: boolean;
  policyVersion: string;
  occurredAt: string;
  createdAt: string;
}

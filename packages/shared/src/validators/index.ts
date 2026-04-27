import { z } from 'zod';

// Trip
export const tripQuoteRequestSchema = z.object({
  destinationId: z.string().uuid(),
  travelerCount: z.number().int().min(1).max(20),
});

export const checkoutRequestSchema = z.object({
  tripId: z.string().uuid(),
  financingOfferId: z.string().uuid().optional(),
});

// Financing
export const financingOfferRequestSchema = z.object({
  tripId: z.string().uuid(),
  totalAmount: z.number().positive(),
  travelerCount: z.number().int().min(1),
});

export const financingCheckoutRequestSchema = z.object({
  offerId: z.string().uuid(),
  tripId: z.string().uuid(),
  totalAmount: z.number().positive(),
  travelerCount: z.number().int().min(1),
  policyVersion: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

// Consent
export const previewConsentRequestSchema = z.object({
  destinationName: z.string().min(1),
  prompt: z.string().min(1).max(2000),
  hasIdentityConsent: z.boolean(),
  hasRightsConfirmation: z.boolean(),
  hasReferenceMedia: z.boolean(),
  policyVersion: z.string().min(1),
});

// Preview
export const createPreviewJobRequestSchema = z.object({
  destinationId: z.string().min(1),
  destinationName: z.string().min(1),
  prompt: z.string().min(1).max(2000),
  consentId: z.string().min(1),
  mediaType: z.enum(['image', 'video']).default('image'),
  referencePhotoIds: z.array(z.string()).max(3).optional(),
});

// Reference Photos
export const uploadReferencePhotoSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

// Travel Admin
export const travelAdminApplicationRequestSchema = z.object({
  documentType: z.enum(['passport', 'tsa_pre_check', 'global_entry']),
  partnerName: z.string().min(1),
});

// Support Override
export const supportOverrideRequestSchema = z.object({
  kind: z.enum(['rebook', 'protect_credit', 'payment_extension', 'expedite_admin']),
  targetReference: z.string().min(1),
  reason: z.string().min(1),
});

// Trip Room Message
export const sendMessageRequestSchema = z.object({
  tripId: z.string().uuid(),
  text: z.string().min(1).max(5000),
});

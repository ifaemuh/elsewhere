export type TravelDocumentType = 'passport' | 'tsa_pre_check' | 'global_entry';
export type PartnerRouteMode = 'referral' | 'api';

export interface TravelDocumentRecord {
  id: string;
  userId: string;
  documentType: TravelDocumentType;
  encryptedReference: string;
  expirationDate: string | null;
  lastVerifiedAt: string;
  createdAt: string;
}

export interface TravelAdminPartnerRoute {
  id: string;
  documentType: TravelDocumentType;
  partnerName: string;
  mode: PartnerRouteMode;
  actionUrl: string;
  isActive: boolean;
  createdAt: string;
}

export interface TravelAdminApplication {
  id: string;
  userId: string;
  documentType: TravelDocumentType;
  applicationId: string;
  status: string;
  partnerName: string;
  createdAt: string;
}

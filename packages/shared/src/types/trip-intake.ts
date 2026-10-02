export type TripIntakeSourceKind = 'mock' | 'provider_api' | 'public_research';
export type TripAddOnKind = 'hotel' | 'airbnb' | 'car_rental' | 'activity';

export interface TripIntakeRequest {
  text: string;
  travelerCount?: number;
  origin?: string;
}

export interface ParsedTripIntent {
  origin: string | null;
  destination: string | null;
  dateWindow: string | null;
  purpose: string | null;
  travelerCount: number;
  flexibility: 'fixed' | 'flexible' | 'unknown';
  confidence: number;
}

export interface FlightOption {
  id: string;
  label: string;
  summary: string;
  priceAmount: number;
  currencyCode: string;
  departureWindow: string;
  returnWindow: string;
  stops: number;
  sourceKind: TripIntakeSourceKind;
  confidence: number;
  limitation: string;
}

export interface TripAddOnSuggestion {
  id: string;
  kind: TripAddOnKind;
  title: string;
  summary: string;
  estimatedPriceAmount: number;
  currencyCode: string;
  sourceKind: TripIntakeSourceKind;
  confidence: number;
}

export interface TripIntakeResult {
  id: string;
  parsedIntent: ParsedTripIntent;
  assumptions: string[];
  missingFields: string[];
  flightOptions: FlightOption[];
  addOns: TripAddOnSuggestion[];
  providerCoverage: Array<{
    provider: string;
    sourceKind: TripIntakeSourceKind;
    status: string;
  }>;
  createdAt: string;
}

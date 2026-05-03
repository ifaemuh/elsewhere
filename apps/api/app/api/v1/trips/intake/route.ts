import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';
import type { ParsedTripIntent, TripIntakeResult } from '@elsewhere/shared';

const tripIntakeSchema = z.object({
  text: z.string().min(3),
  travelerCount: z.number().int().min(1).max(12).optional(),
  origin: z.string().optional(),
});

const DESTINATION_PATTERNS = [
  'atlanta',
  'new york',
  'tokyo',
  'paris',
  'bali',
  'santorini',
  'london',
  'miami',
  'los angeles',
  'san francisco',
  'chicago',
  'las vegas',
];

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
}

function detectDestination(text: string): string | null {
  const lower = text.toLowerCase();
  return DESTINATION_PATTERNS.find((place) => lower.includes(place))?.split(' ').map(titleCase).join(' ') ?? null;
}

function detectPurpose(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes('wedding')) return 'wedding';
  if (lower.includes('birthday')) return 'birthday';
  if (lower.includes('conference') || lower.includes('work')) return 'work';
  if (lower.includes('funeral')) return 'family emergency';
  if (lower.includes('anniversary')) return 'anniversary';
  return null;
}

function detectDateWindow(text: string): string | null {
  const lower = text.toLowerCase();
  const month = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/);
  if (lower.includes('friday') && lower.includes('monday') && month) return `Friday to Monday in ${titleCase(month[1])}`;
  if (month) return titleCase(month[1]);
  if (lower.includes('next weekend')) return 'Next weekend';
  if (lower.includes('three day') || lower.includes('3-day')) return 'Next 3-day weekend';
  return null;
}

function parseIntent(text: string, travelerCount?: number, origin?: string): ParsedTripIntent {
  const lower = text.toLowerCase();
  const destination = detectDestination(text);
  const dateWindow = detectDateWindow(text);
  const purpose = detectPurpose(text);
  const parsedOrigin = origin ?? (lower.includes('from la') || lower.includes('from lax') ? 'Los Angeles' : null);
  const flexibility = lower.includes('maybe') || lower.includes('flex') || lower.includes('probably')
    ? 'flexible'
    : dateWindow
      ? 'fixed'
      : 'unknown';
  const confidenceParts = [destination, dateWindow, purpose, parsedOrigin].filter(Boolean).length;

  return {
    origin: parsedOrigin,
    destination,
    dateWindow,
    purpose,
    travelerCount: travelerCount ?? 1,
    flexibility,
    confidence: Math.min(0.92, 0.42 + confidenceParts * 0.12),
  };
}

export async function POST(req: NextRequest) {
  try {
    await getAuthUser(req);
    const input = tripIntakeSchema.parse(await req.json());
    const parsedIntent = parseIntent(input.text, input.travelerCount, input.origin);
    const destination = parsedIntent.destination ?? 'Atlanta';
    const origin = parsedIntent.origin ?? 'Los Angeles';
    const assumptions = [
      ...(!parsedIntent.origin ? ['Assuming Los Angeles as origin.'] : []),
      ...(!parsedIntent.destination ? ['Assuming Atlanta until destination is confirmed.'] : []),
      ...(!parsedIntent.dateWindow ? ['Using a flexible weekend window until exact dates are known.'] : []),
      'Flight results are mock-ranked until live provider APIs are configured.',
    ];
    const missingFields = [
      ...(!parsedIntent.origin ? ['origin'] : []),
      ...(!parsedIntent.destination ? ['destination'] : []),
      ...(!parsedIntent.dateWindow ? ['exact dates'] : []),
    ];
    const basePrice = destination === 'Tokyo' || destination === 'Paris' ? 860 : 280;
    const now = new Date().toISOString();

    const result: TripIntakeResult = {
      id: `intake-${randomUUID()}`,
      parsedIntent,
      assumptions,
      missingFields,
      flightOptions: [
        {
          id: 'flight-best',
          label: 'Best default',
          summary: `${origin} to ${destination}, balanced departure times with one checked-bag friendly fare.`,
          priceAmount: basePrice + 80,
          currencyCode: 'USD',
          departureWindow: parsedIntent.dateWindow ?? 'Flexible Friday afternoon',
          returnWindow: parsedIntent.dateWindow?.includes('Monday') ? 'Monday evening' : 'Flexible return',
          stops: destination === 'Tokyo' ? 1 : 0,
          sourceKind: 'mock',
          confidence: 0.72,
          limitation: 'Mock flight option. Verify with Amadeus/Duffel before booking.',
        },
        {
          id: 'flight-cheapest',
          label: 'Cheapest reasonable',
          summary: `Lower fare with less ideal timing, still avoiding painful layovers where possible.`,
          priceAmount: basePrice,
          currencyCode: 'USD',
          departureWindow: 'Early morning',
          returnWindow: 'Late evening',
          stops: destination === 'Tokyo' ? 1 : 0,
          sourceKind: 'mock',
          confidence: 0.66,
          limitation: 'Mock price signal, not live inventory.',
        },
        {
          id: 'flight-flex',
          label: 'Flexible-date savings',
          summary: 'Shift by 1-2 days if your calendar allows to reduce fare pressure.',
          priceAmount: Math.max(140, basePrice - 70),
          currencyCode: 'USD',
          departureWindow: 'Nearby cheaper date',
          returnWindow: 'Nearby cheaper return',
          stops: 0,
          sourceKind: 'mock',
          confidence: 0.61,
          limitation: 'Requires calendar/provider verification.',
        },
      ],
      addOns: [
        {
          id: 'hotel-default',
          kind: 'hotel',
          title: `${destination} hotel shortlist`,
          summary: 'Cancellable hotel options near the main event area or easiest transit zone.',
          estimatedPriceAmount: 190,
          currencyCode: 'USD',
          sourceKind: 'mock',
          confidence: 0.62,
        },
        {
          id: 'airbnb-default',
          kind: 'airbnb',
          title: 'Airbnb-style stay search',
          summary: 'A whole-place stay if the trip has multiple travelers or needs a kitchen/laundry.',
          estimatedPriceAmount: 220,
          currencyCode: 'USD',
          sourceKind: 'mock',
          confidence: 0.56,
        },
        {
          id: 'car-default',
          kind: 'car_rental',
          title: 'Car rental check',
          summary: parsedIntent.purpose === 'wedding'
            ? 'Useful if events are spread across suburbs or venues.'
            : 'Only suggested if transit is weak for the itinerary.',
          estimatedPriceAmount: 58,
          currencyCode: 'USD',
          sourceKind: 'mock',
          confidence: 0.5,
        },
        {
          id: 'activity-default',
          kind: 'activity',
          title: 'One open-slot activity',
          summary: 'A low-commitment local idea if there is downtime after the required event.',
          estimatedPriceAmount: 45,
          currencyCode: 'USD',
          sourceKind: 'mock',
          confidence: 0.52,
        },
      ],
      providerCoverage: [
        { provider: 'Amadeus', sourceKind: 'provider_api', status: 'missing credentials' },
        { provider: 'Duffel', sourceKind: 'provider_api', status: 'missing credentials' },
        { provider: 'Hotelbeds / Airbnb placeholder', sourceKind: 'mock', status: 'mock add-ons' },
      ],
      createdAt: now,
    };

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

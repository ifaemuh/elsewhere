import type {
  ActiveTripGuide,
  DealRadarResult,
  TravelDealSignal,
  TravelIntelConfidence,
  TravelIntelFinding,
  TravelIntelSourceKind,
  TravelProviderCoverage,
} from '@elsewhere/shared';

type ProviderCategory = TravelProviderCoverage['category'];

export interface TravelIntelProvider {
  id: string;
  name: string;
  category: ProviderCategory;
  sourceKind: TravelIntelSourceKind;
  liveCapable: boolean;
  isConfigured(): boolean;
  getCoverage(): TravelProviderCoverage;
  fetchDeals(context?: TravelIntelContext): Promise<TravelDealSignal[]>;
  fetchFindings?(context: TravelIntelContext): Promise<TravelIntelFinding[]>;
}

interface TravelIntelContext {
  guide?: ActiveTripGuide;
}

interface RawDealInput {
  id: string;
  sourceKind: TravelIntelSourceKind;
  sourceName: string;
  sourceUrl: string | null;
  title: string;
  summary: string;
  origin?: string | null;
  destination?: string | null;
  priceAmount?: number | null;
  currencyCode?: string | null;
  travelWindowStart?: string | null;
  travelWindowEnd?: string | null;
  bookingWindowEndsAt?: string | null;
  observedAt?: string;
  tags?: string[];
  limitations?: string[];
}

function hasValue(value: string | undefined): boolean {
  return !!value && value.trim().length > 0;
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function stableId(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(i) | 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function sourceScore(kind: TravelIntelSourceKind): number {
  switch (kind) {
    case 'provider_api':
    case 'official_policy':
    case 'booking_record':
      return 34;
    case 'fare_rule':
      return 31;
    case 'deal_feed':
      return 26;
    case 'reddit':
      return 18;
    case 'public_research':
      return 16;
    case 'mock':
    default:
      return 12;
  }
}

function confidenceFor(kind: TravelIntelSourceKind, score: number): TravelIntelConfidence {
  if (kind === 'provider_api' || kind === 'booking_record' || kind === 'official_policy') return 'high';
  if (score >= 74) return 'medium';
  return 'low';
}

function recencyScore(observedAt: string): number {
  const ageHours = Math.max(0, (Date.now() - new Date(observedAt).getTime()) / (60 * 60 * 1000));
  if (ageHours <= 6) return 24;
  if (ageHours <= 24) return 18;
  if (ageHours <= 72) return 10;
  if (ageHours <= 168) return 4;
  return -12;
}

function priceScore(price: number | null): number {
  if (!price) return 0;
  if (price <= 250) return 22;
  if (price <= 400) return 16;
  if (price <= 650) return 10;
  if (price <= 900) return 5;
  return 0;
}

function keywordScore(title: string, summary: string, tags: string[]): number {
  const haystack = normalizeText(`${title} ${summary} ${tags.join(' ')}`);
  let score = 0;
  if (haystack.includes('mistake fare') || haystack.includes('error fare')) score += 24;
  if (haystack.includes('flash sale') || haystack.includes('fare sale')) score += 14;
  if (haystack.includes('nonstop')) score += 5;
  if (haystack.includes('business class')) score += 7;
  if (haystack.includes('expires') || haystack.includes('limited')) score += 6;
  if (haystack.includes('ymmv') || haystack.includes('dead')) score -= 12;
  return score;
}

function relevanceScore(deal: RawDealInput, guide?: ActiveTripGuide): number {
  if (!guide) return 0;
  const guideTerms = [
    guide.destinationName,
    guide.destinationCountry,
    ...guide.segments.flatMap((segment) => [segment.title, segment.routeSummary ?? '', segment.providerName]),
  ].map(normalizeText).filter(Boolean);
  const dealText = normalizeText([
    deal.title,
    deal.summary,
    deal.origin ?? '',
    deal.destination ?? '',
    deal.tags?.join(' ') ?? '',
  ].join(' '));

  let score = 0;
  for (const term of guideTerms) {
    const pieces = term.split(' ').filter((piece) => piece.length > 3);
    for (const piece of pieces) {
      if (dealText.includes(piece)) score += 8;
    }
  }

  const destination = normalizeText(deal.destination ?? '');
  if (destination && normalizeText(guide.destinationName).includes(destination)) score += 30;
  if (destination && normalizeText(guide.destinationCountry).includes(destination)) score += 24;

  return clampScore(score);
}

function normalizeDeal(input: RawDealInput, guide?: ActiveTripGuide): TravelDealSignal {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const tags = input.tags ?? [];
  const relevance = relevanceScore(input, guide);
  const score = clampScore(
    sourceScore(input.sourceKind) +
    recencyScore(observedAt) +
    priceScore(input.priceAmount ?? null) +
    keywordScore(input.title, input.summary, tags) +
    Math.round(relevance * 0.25),
  );

  return {
    id: input.id,
    sourceKind: input.sourceKind,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    title: input.title,
    summary: input.summary,
    origin: input.origin ?? null,
    destination: input.destination ?? null,
    priceAmount: input.priceAmount ?? null,
    currencyCode: input.currencyCode ?? null,
    travelWindowStart: input.travelWindowStart ?? null,
    travelWindowEnd: input.travelWindowEnd ?? null,
    bookingWindowEndsAt: input.bookingWindowEndsAt ?? null,
    observedAt,
    confidence: confidenceFor(input.sourceKind, score),
    dealScore: score,
    relevanceScore: relevance,
    tags,
    limitations: input.limitations ?? [
      'Public deal signal only. Verify price, fare rules, and availability through an official booking provider before acting.',
    ],
    citations: [
      {
        label: input.sourceName,
        detail: input.sourceUrl ?? 'Fixture-backed source; connect live feed/API for production validation.',
      },
    ],
  };
}

function coverage(
  id: string,
  name: string,
  category: ProviderCategory,
  configured: boolean,
  liveCapable: boolean,
  detail: string,
): TravelProviderCoverage {
  return {
    id,
    name,
    category,
    configured,
    liveCapable,
    status: configured ? 'connected' : liveCapable ? 'missing_credentials' : 'not_configured',
    detail,
  };
}

class StubProvider implements TravelIntelProvider {
  constructor(
    public id: string,
    public name: string,
    public category: ProviderCategory,
    public sourceKind: TravelIntelSourceKind,
    private configured: () => boolean,
    private detail: string,
  ) {}

  liveCapable = true;

  isConfigured(): boolean {
    return this.configured();
  }

  getCoverage(): TravelProviderCoverage {
    return coverage(this.id, this.name, this.category, this.isConfigured(), this.liveCapable, this.detail);
  }

  async fetchDeals(): Promise<TravelDealSignal[]> {
    return [];
  }
}

class FixtureDealProvider implements TravelIntelProvider {
  id = 'fixture-deals';
  name = 'Elsewhere Deal Fixtures';
  category: ProviderCategory = 'deal_feed';
  sourceKind: TravelIntelSourceKind = 'deal_feed';
  liveCapable = false;

  isConfigured(): boolean {
    return true;
  }

  getCoverage(): TravelProviderCoverage {
    return coverage(
      this.id,
      this.name,
      this.category,
      true,
      false,
      'Local RSS-style samples used when live deal feeds are unavailable.',
    );
  }

  async fetchDeals(context?: TravelIntelContext): Promise<TravelDealSignal[]> {
    const fixtures: RawDealInput[] = [
      {
        id: 'fixture-secretflying-japan',
        sourceKind: 'deal_feed',
        sourceName: 'Secret Flying',
        sourceUrl: 'https://www.secretflying.com/',
        title: 'Mistake fare: San Francisco to Tokyo from $287 roundtrip',
        summary: 'Spring Tokyo fare alert with a short booking window. Elsewhere watches nearby dates, airports, and fare rules before recommending action.',
        origin: 'SFO',
        destination: 'Tokyo',
        priceAmount: 287,
        currencyCode: 'USD',
        travelWindowStart: daysFromNow(30),
        travelWindowEnd: daysFromNow(90),
        bookingWindowEndsAt: daysFromNow(2),
        observedAt: daysAgo(0.2),
        tags: ['mistake fare', 'flight', 'tokyo', 'japan'],
      },
      {
        id: 'fixture-flightdeal-paris',
        sourceKind: 'deal_feed',
        sourceName: 'The Flight Deal',
        sourceUrl: 'https://www.theflightdeal.com/',
        title: 'Fare sale: New York to Paris from $398 roundtrip',
        summary: 'Shoulder-season Paris fare alert with nonstop and one-stop options. Elsewhere is tracking whether better dates open around your calendar.',
        origin: 'NYC',
        destination: 'Paris',
        priceAmount: 398,
        currencyCode: 'USD',
        travelWindowStart: daysFromNow(45),
        travelWindowEnd: daysFromNow(120),
        bookingWindowEndsAt: daysFromNow(5),
        observedAt: daysAgo(0.8),
        tags: ['fare sale', 'flight', 'paris', 'france'],
      },
      {
        id: 'fixture-reddit-bali',
        sourceKind: 'reddit',
        sourceName: 'r/travel community signal',
        sourceUrl: 'https://www.reddit.com/r/travel/',
        title: 'Community alert: Bali shoulder-season fares dropping from West Coast',
        summary: 'Travelers are seeing Bali fare drops from the West Coast. Elsewhere treats this as early chatter until an official fare source confirms it.',
        origin: 'LAX',
        destination: 'Bali',
        priceAmount: 612,
        currencyCode: 'USD',
        travelWindowStart: daysFromNow(35),
        travelWindowEnd: daysFromNow(110),
        bookingWindowEndsAt: null,
        observedAt: daysAgo(1.4),
        tags: ['reddit', 'deal chatter', 'bali'],
        limitations: [
          'Community signal only. Confirm with official fare pricing and ticketing rules before recommending changes.',
        ],
      },
      {
        id: 'fixture-expired-santorini',
        sourceKind: 'deal_feed',
        sourceName: 'Archived fare signal',
        sourceUrl: 'https://example.com/expired-santorini',
        title: 'Old fare: Athens to Santorini island hopper sale',
        summary: 'Older island-hopper fare signal. Kept low in the feed because the booking window has passed.',
        origin: 'ATH',
        destination: 'Santorini',
        priceAmount: 89,
        currencyCode: 'USD',
        travelWindowStart: daysFromNow(60),
        travelWindowEnd: daysFromNow(80),
        bookingWindowEndsAt: daysAgo(4),
        observedAt: daysAgo(10),
        tags: ['expired', 'island flight'],
      },
      {
        id: 'fixture-airbnb-kyoto-stay',
        sourceKind: 'mock',
        sourceName: 'Airbnb partner watch',
        sourceUrl: 'https://www.airbnb.com/terms/api',
        title: 'Stay watch: Kyoto homes near transit under $180/night',
        summary: 'Kyoto home-style stays near transit are being watched for group-friendly pricing, cancellation terms, and guest-fit rules.',
        origin: null,
        destination: 'Kyoto',
        priceAmount: 180,
        currencyCode: 'USD',
        travelWindowStart: daysFromNow(35),
        travelWindowEnd: daysFromNow(95),
        bookingWindowEndsAt: null,
        observedAt: daysAgo(0.5),
        tags: ['airbnb', 'stay', 'vacation rental', 'kyoto', 'partner watch'],
        limitations: [
          'Airbnb access is partner-program based. Do not scrape login, checkout, paywalled, or CAPTCHA-protected Airbnb pages.',
        ],
      },
    ];

    return fixtures
      .map((deal) => normalizeDeal(deal, context?.guide))
      .sort(compareDeals);
  }
}

class RssDealProvider implements TravelIntelProvider {
  id = 'rss-deal-feeds';
  name = 'Allowlisted RSS deal feeds';
  category: ProviderCategory = 'deal_feed';
  sourceKind: TravelIntelSourceKind = 'deal_feed';
  liveCapable = true;

  isConfigured(): boolean {
    return rssUrls().length > 0;
  }

  getCoverage(): TravelProviderCoverage {
    return coverage(
      this.id,
      this.name,
      this.category,
      this.isConfigured(),
      this.liveCapable,
      'Optional allowlisted RSS/public deal feeds. No login, paywall, or CAPTCHA sources are fetched.',
    );
  }

  async fetchDeals(context?: TravelIntelContext): Promise<TravelDealSignal[]> {
    const urls = rssUrls();
    if (!urls.length) return [];

    const nested = await Promise.all(urls.map(async (url) => fetchRssDeals(url, context?.guide)));
    return nested.flat().sort(compareDeals);
  }
}

class RedditProvider extends StubProvider {
  constructor() {
    super(
      'reddit-api',
      'Reddit API',
      'reddit',
      'reddit',
      () => hasValue(process.env.REDDIT_CLIENT_ID) && hasValue(process.env.REDDIT_CLIENT_SECRET),
      'Monitors approved travel subreddits for deal, cancellation, and pricing-error signals when Reddit API credentials are configured.',
    );
  }
}

function rssUrls(): string[] {
  const configured = process.env.ELSEWHERE_DEAL_FEED_URLS?.split(',').map((url) => url.trim()).filter(Boolean) ?? [];
  const defaults = process.env.ELSEWHERE_ENABLE_DEFAULT_DEAL_FEEDS === 'true'
    ? [
        'https://www.secretflying.com/feed/',
        'https://www.theflightdeal.com/feed/',
      ]
    : [];
  return [...configured, ...defaults].filter(isAllowedFeedUrl);
}

function isAllowedFeedUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return ['www.secretflying.com', 'secretflying.com', 'www.theflightdeal.com', 'theflightdeal.com']
      .includes(url.hostname);
  } catch {
    return false;
  }
}

async function fetchRssDeals(url: string, guide?: ActiveTripGuide): Promise<TravelDealSignal[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ElsewhereBot/0.1 (+https://elsewhere.app; compliant deal feed research)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return parseRssItems(xml, url, guide);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function parseRssItems(xml: string, feedUrl: string, guide?: ActiveTripGuide): TravelDealSignal[] {
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const sourceName = feedUrl.includes('secretflying') ? 'Secret Flying RSS' :
    feedUrl.includes('theflightdeal') ? 'The Flight Deal RSS' : 'Deal RSS';

  return itemMatches.slice(0, 10).map((item, index) => {
    const title = xmlValue(item, 'title') || 'Untitled travel deal';
    const link = xmlValue(item, 'link') || feedUrl;
    const description = stripHtml(xmlValue(item, 'description') || xmlValue(item, 'content:encoded') || '');
    const observedAt = parseDate(xmlValue(item, 'pubDate')) ?? new Date().toISOString();
    const price = parsePrice(`${title} ${description}`);
    const route = inferRoute(`${title} ${description}`);

    return normalizeDeal({
      id: `rss-${stableId(`${feedUrl}-${link}-${index}`)}`,
      sourceKind: 'deal_feed',
      sourceName,
      sourceUrl: link,
      title,
      summary: description.slice(0, 240) || 'Public deal feed item. Verify availability before action.',
      origin: route.origin,
      destination: route.destination,
      priceAmount: price.amount,
      currencyCode: price.currency,
      observedAt,
      tags: inferTags(`${title} ${description}`),
    }, guide);
  });
}

function xmlValue(item: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = item.match(pattern);
  if (!match?.[1]) return null;
  return decodeXml(match[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim());
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8211;/g, '-')
    .replace(/&#8217;/g, "'");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseDate(value: string | null): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function parsePrice(text: string): { amount: number | null; currency: string | null } {
  const match = text.match(/(?:\$|USD\s*)(\d{2,5})(?:\b|[^\d])/i);
  if (!match?.[1]) return { amount: null, currency: null };
  return { amount: Number(match[1]), currency: 'USD' };
}

function inferRoute(text: string): { origin: string | null; destination: string | null } {
  const cleaned = stripHtml(text);
  const cityPair = cleaned.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+to\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
  if (cityPair) return { origin: cityPair[1], destination: cityPair[2] };
  const airportPair = cleaned.match(/\b([A-Z]{3})\s*(?:-|to|\/)\s*([A-Z]{3})\b/);
  if (airportPair) return { origin: airportPair[1], destination: airportPair[2] };
  return { origin: null, destination: null };
}

function inferTags(text: string): string[] {
  const normalized = normalizeText(text);
  const tags: string[] = [];
  for (const [needle, tag] of [
    ['mistake fare', 'mistake fare'],
    ['error fare', 'error fare'],
    ['business class', 'business class'],
    ['flash sale', 'flash sale'],
    ['fare sale', 'fare sale'],
    ['nonstop', 'nonstop'],
  ] as const) {
    if (normalized.includes(needle)) tags.push(tag);
  }
  return tags;
}

function compareDeals(a: TravelDealSignal, b: TravelDealSignal): number {
  return b.relevanceScore - a.relevanceScore ||
    b.dealScore - a.dealScore ||
    new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime();
}

export function getTravelIntelProviders(): TravelIntelProvider[] {
  return [
    new StubProvider(
      'amadeus',
      'Amadeus Self-Service',
      'flight_search',
      'provider_api',
      () => hasValue(process.env.AMADEUS_CLIENT_ID) && hasValue(process.env.AMADEUS_CLIENT_SECRET),
      'Flight shopping, offer pricing, fare rules, and hotel search/order policy data.',
    ),
    new StubProvider(
      'duffel',
      'Duffel',
      'flight_search',
      'provider_api',
      () => hasValue(process.env.DUFFEL_ACCESS_TOKEN),
      'Flight offers, orders, cancellations, schedule changes, and order management.',
    ),
    new StubProvider(
      'flightaware',
      'FlightAware AeroAPI',
      'flight_status',
      'provider_api',
      () => hasValue(process.env.FLIGHTAWARE_API_KEY),
      'Live flight status, cancellation, delay, diversion, ETA, and alerting data.',
    ),
    new StubProvider(
      'expedia-rapid',
      'Expedia Rapid',
      'hotel_policies',
      'provider_api',
      () => hasValue(process.env.EXPEDIA_RAPID_API_KEY) && hasValue(process.env.EXPEDIA_RAPID_SHARED_SECRET),
      'Hotel shopping, rate repricing, cancellation penalties, refund windows, and manage-booking data.',
    ),
    new StubProvider(
      'hotelbeds',
      'Hotelbeds',
      'hotel_rates',
      'provider_api',
      () => hasValue(process.env.HOTELBEDS_API_KEY) && hasValue(process.env.HOTELBEDS_SECRET),
      'Hotel availability, prices, cancellation policies, and booking management.',
    ),
    new StubProvider(
      'airbnb-partner',
      'Airbnb Partner API',
      'vacation_rentals',
      'provider_api',
      () => hasValue(process.env.AIRBNB_PARTNER_API_KEY) || process.env.AIRBNB_PARTNER_ENABLED === 'true',
      'Partner-program lodging and experiences access. Elsewhere treats this as approved-partner/API-only, never login or checkout scraping.',
    ),
    new RssDealProvider(),
    new FixtureDealProvider(),
    new RedditProvider(),
    new StubProvider(
      'public-search',
      'Public travel research',
      'web_research',
      'public_research',
      () => hasValue(process.env.SERPAPI_API_KEY) || hasValue(process.env.TAVILY_API_KEY),
      'Fallback public research for official airline/hotel policy pages and advisories.',
    ),
    new StubProvider(
      'ai-gateway',
      'AI Gateway',
      'ai_decisioning',
      'provider_api',
      () => hasValue(process.env.AI_GATEWAY_API_KEY) || hasValue(process.env.VERCEL),
      'Ranks evidence and explains the best action. Deterministic scoring remains the fallback.',
    ),
  ];
}

export function getTravelProviderCoverage(): TravelProviderCoverage[] {
  return getTravelIntelProviders().map((provider) => provider.getCoverage());
}

export async function buildDealRadar(context?: TravelIntelContext): Promise<DealRadarResult> {
  const providers = getTravelIntelProviders();
  const nestedDeals = await Promise.all(providers.map((provider) => provider.fetchDeals(context)));
  const dealsById = new Map<string, TravelDealSignal>();

  for (const deal of nestedDeals.flat()) {
    const existing = dealsById.get(deal.id);
    if (!existing || deal.dealScore + deal.relevanceScore > existing.dealScore + existing.relevanceScore) {
      dealsById.set(deal.id, deal);
    }
  }

  const deals = [...dealsById.values()].sort(compareDeals).slice(0, 25);
  return {
    generatedAt: new Date().toISOString(),
    providerCoverage: providers.map((provider) => provider.getCoverage()),
    deals,
  };
}

export function dealToFinding(deal: TravelDealSignal, tripId: string): TravelIntelFinding {
  return {
    id: `finding-deal-${deal.id}`,
    tripId,
    sourceKind: deal.sourceKind,
    sourceName: deal.sourceName,
    sourceUrl: deal.sourceUrl,
    confidence: deal.confidence,
    title: deal.title,
    detail: deal.summary,
    observedAt: deal.observedAt,
    appliesToSegmentId: null,
    impactAmount: null,
    protectedValue: null,
    citations: deal.citations,
  };
}

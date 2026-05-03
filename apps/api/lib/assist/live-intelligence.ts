import { generateText } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import type {
  ActiveTripGuide,
  AssistDecision,
  LiveTripIntelligence,
  TravelIntelFinding,
  TravelProviderCoverage,
} from '@elsewhere/shared';
import { models } from '../ai/providers';
import { buildDealRadar, dealToFinding, getTravelProviderCoverage } from './travel-intel';

function hasAiGateway(): boolean {
  return !!process.env.AI_GATEWAY_API_KEY || !!process.env.VERCEL;
}

function opportunityFindings(guide: ActiveTripGuide): TravelIntelFinding[] {
  const observedAt = new Date().toISOString();
  return guide.opportunities.map((opportunity) => ({
    id: `finding-${opportunity.id}`,
    tripId: guide.tripId,
    sourceKind: 'mock',
    sourceName: 'Elsewhere mock rule engine',
    sourceUrl: null,
    confidence: opportunity.autoActionable ? 'medium' : 'low',
    title: opportunity.title,
    detail: opportunity.detail,
    observedAt,
    appliesToSegmentId: null,
    impactAmount: opportunity.savingsAmount,
    protectedValue: opportunity.protectedValue,
    citations: opportunity.citations,
  }));
}

function cancellationFinding(guide: ActiveTripGuide): TravelIntelFinding {
  return {
    id: `finding-${guide.tripId}-cancellation-impact`,
    tripId: guide.tripId,
    sourceKind: 'mock',
    sourceName: 'Elsewhere cancellation impact engine',
    sourceUrl: null,
    confidence: 'low',
    title: 'Cancellation impact estimated',
    detail: guide.cancellation.summary,
    observedAt: new Date().toISOString(),
    appliesToSegmentId: null,
    impactAmount: null,
    protectedValue: guide.cancellation.travelCreditAmount,
    citations: [
      {
        label: 'Current limitation',
        detail: 'This estimate is based on seeded trip rules until a booking provider order is connected.',
      },
    ],
  };
}

function fallbackDecision(
  guide: ActiveTripGuide,
  findings: TravelIntelFinding[],
  coverage: TravelProviderCoverage[],
): AssistDecision {
  const sorted = [...guide.opportunities].sort((a, b) => {
    const aValue = (a.savingsAmount ?? 0) + (a.protectedValue ?? 0);
    const bValue = (b.savingsAmount ?? 0) + (b.protectedValue ?? 0);
    return a.priority - b.priority || bValue - aValue;
  });
  const top = sorted[0];
  const connectedProviders = coverage.filter((provider) => provider.status === 'connected');
  const estimatedSavings = findings.reduce((sum, finding) => sum + (finding.impactAmount ?? 0), 0);
  const protectedValue = findings.reduce((sum, finding) => sum + (finding.protectedValue ?? 0), 0);
  const hasDeadlineToday = sorted.some((opportunity) => {
    if (!opportunity.deadlineAt) return false;
    return new Date(opportunity.deadlineAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;
  });

  return {
    tripId: guide.tripId,
    title: top?.title ?? 'Keep monitoring',
    recommendation: top
      ? `${top.actionLabel}: ${top.detail}`
      : 'No action is recommended right now. Continue monitoring provider rules, prices, and trip status.',
    confidence: connectedProviders.length ? 'medium' : 'low',
    urgency: hasDeadlineToday || top?.status === 'action_available' ? 'high' : 'medium',
    estimatedSavings,
    protectedValue,
    rationale: top
      ? top.citations.map((citation) => `${citation.label}: ${citation.detail}`)
      : ['No active opportunity outranks the current itinerary.'],
    nextSteps: top
      ? [
          top.autoActionable
            ? `Prepare to execute "${top.actionLabel}" after confirming live provider data.`
            : `Explain "${top.actionLabel}" options to the traveler before taking action.`,
          'Refresh flight status, fare rules, hotel penalties, and repricing before execution.',
        ]
      : ['Continue monitoring on a schedule and refresh when provider credentials are connected.'],
    limitations: connectedProviders.length
      ? ['Some provider adapters are still missing credentials, so the decision may not include every supplier.']
      : ['No live travel provider credentials are configured, so this decision is based on mock rules only.'],
    usedAi: false,
  };
}

function parseAiDecision(
  tripId: string,
  text: string,
  fallback: AssistDecision,
): AssistDecision {
  try {
    const parsed = JSON.parse(text) as Partial<AssistDecision>;
    return {
      ...fallback,
      ...parsed,
      tripId,
      estimatedSavings: Number(parsed.estimatedSavings ?? fallback.estimatedSavings),
      protectedValue: Number(parsed.protectedValue ?? fallback.protectedValue),
      rationale: Array.isArray(parsed.rationale) ? parsed.rationale : fallback.rationale,
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : fallback.nextSteps,
      limitations: Array.isArray(parsed.limitations) ? parsed.limitations : fallback.limitations,
      usedAi: true,
    };
  } catch {
    return fallback;
  }
}

async function aiDecision(
  guide: ActiveTripGuide,
  findings: TravelIntelFinding[],
  coverage: TravelProviderCoverage[],
  fallback: AssistDecision,
): Promise<AssistDecision> {
  if (!hasAiGateway()) return fallback;

  try {
    const { text } = await generateText({
      model: gateway(models.text),
      prompt: `You are Elsewhere Assist, a rules-aware travel optimization engine.
Choose the best allowed action for this trip using only the evidence provided.
Return compact JSON with these keys:
title, recommendation, confidence ("low"|"medium"|"high"), urgency ("low"|"medium"|"high"),
estimatedSavings, protectedValue, rationale (string[]), nextSteps (string[]), limitations (string[]).

Trip:
${JSON.stringify(guide, null, 2)}

Provider coverage:
${JSON.stringify(coverage, null, 2)}

Findings:
${JSON.stringify(findings, null, 2)}`,
      providerOptions: {
        gateway: {
          tags: ['feature:assist', 'step:decision'],
          models: [models.textFallback],
        },
      },
    });

    return parseAiDecision(guide.tripId, text, fallback);
  } catch {
    return fallback;
  }
}

export async function buildLiveTripIntelligence(
  guide: ActiveTripGuide,
): Promise<LiveTripIntelligence> {
  const providerCoverage = getTravelProviderCoverage();
  const dealRadar = await buildDealRadar({ guide });
  const relevantDeals = dealRadar.deals.filter((deal) => deal.relevanceScore >= 20).slice(0, 5);
  const findings = [
    ...opportunityFindings(guide),
    cancellationFinding(guide),
    ...relevantDeals.map((deal) => dealToFinding(deal, guide.tripId)),
  ];
  const fallback = fallbackDecision(guide, findings, providerCoverage);
  const decision = await aiDecision(guide, findings, providerCoverage, fallback);

  return {
    tripId: guide.tripId,
    generatedAt: new Date().toISOString(),
    providerCoverage,
    findings,
    deals: relevantDeals,
    decision,
  };
}

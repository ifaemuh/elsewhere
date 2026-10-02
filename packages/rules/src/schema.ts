import { z } from 'zod';
import { FACT_NAMES, type FactName } from './facts';

export const RULE_STATUSES = ['draft', 'verified', 'needs_review', 'retired'] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const DOMAINS = ['flights', 'documents', 'money', 'hotels'] as const;
export type Domain = (typeof DOMAINS)[number];

export const CHARACTERS = ['capybara', 'owl', 'raccoon', 'pigeon'] as const;
export type Character = (typeof CHARACTERS)[number];

export const ENTITLEMENT_KINDS = [
  'refund', 'compensation', 'care', 'rebooking', 'requirement', 'perk', 'protection',
] as const;

export const SOURCE_KINDS = [
  'regulation', 'agency_guidance', 'government_page',
  'contract_of_carriage', 'customer_service_plan', 'issuer_benefit_guide',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export type Primitive = string | number | boolean;

export type Condition =
  | { fact: FactName; eq: Primitive }
  | { fact: FactName; in: Primitive[] }
  | { fact: FactName; gte: number }
  | { fact: FactName; lte: number }
  | { fact: FactName; gt: number }
  | { fact: FactName; lt: number }
  | { fact: FactName; exists: boolean };

export type ConditionGroup = { all: ConditionNode[] } | { any: ConditionNode[] };
export type ConditionNode = Condition | ConditionGroup;

export interface Quote {
  text: string;
  supports: string[];
}

export interface RuleSourceRef {
  id: string;
  source: string;
  quotes: Quote[];
}

export interface Rule {
  id: string;
  version: number;
  status: RuleStatus;
  domain: Domain;
  jurisdiction: string;
  title: string;
  summary: string;
  applies_when: ConditionGroup;
  entitlement: {
    kind: (typeof ENTITLEMENT_KINDS)[number];
    amount?: Record<string, Primitive | Primitive[]>;
    timing?: string;
  };
  how_to_claim: { steps: string[]; templates: string[] };
  exceptions: string[];
  sources: RuleSourceRef[];
  lead_character: Character;
  tags: string[];
  last_verified: string | null;
  verified_by: string | null;
  review_by: string | null;
  replaced_by?: string;
  history: RuleHistoryEntry[];
}

export interface RuleHistoryEntry {
  version: number;
  status: RuleStatus;
  date: string;
  note?: string;
}

export type Detector =
  | { ota: { service: string; terms_type: string } }
  | { ecfr: { title: number; part: number } }
  | { changedetection: { watch_uuid: string } };

export interface Source {
  key: string;
  url: string;
  kind: SourceKind;
  detector: Detector;
}

export const JURISDICTION_PATTERN =
  /^(US-DOT|US-FTC|US-TSA|US-STATE|EU-261|UK-261|carrier:[A-Z0-9]{2}|issuer:[a-z0-9-]+|country:[A-Z]{2})$/;

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const PrimitiveSchema = z.union([z.string(), z.number(), z.boolean()]);
const FactSchema = z.enum(FACT_NAMES);

const ConditionSchema: z.ZodType<Condition> = z.union([
  z.strictObject({ fact: FactSchema, eq: PrimitiveSchema }),
  z.strictObject({ fact: FactSchema, in: z.array(PrimitiveSchema).min(1) }),
  z.strictObject({ fact: FactSchema, gte: z.number() }),
  z.strictObject({ fact: FactSchema, lte: z.number() }),
  z.strictObject({ fact: FactSchema, gt: z.number() }),
  z.strictObject({ fact: FactSchema, lt: z.number() }),
  z.strictObject({ fact: FactSchema, exists: z.boolean() }),
]);

const ConditionNodeSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.union([ConditionSchema, ConditionGroupSchema]),
);

const ConditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(ConditionNodeSchema).min(1) }),
    z.strictObject({ any: z.array(ConditionNodeSchema).min(1) }),
  ]),
);

const RuleObjectSchema = z.strictObject({
  id: z.string().regex(KEBAB, 'must be kebab-case'),
  version: z.number().int().min(1),
  status: z.enum(RULE_STATUSES),
  domain: z.enum(DOMAINS),
  jurisdiction: z.string().regex(JURISDICTION_PATTERN, 'is not a known jurisdiction'),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(400),
  applies_when: ConditionGroupSchema,
  entitlement: z.strictObject({
    kind: z.enum(ENTITLEMENT_KINDS),
    amount: z.record(z.string(), z.union([PrimitiveSchema, z.array(PrimitiveSchema)])).optional(),
    timing: z.string().min(1).optional(),
  }),
  how_to_claim: z.strictObject({
    steps: z.array(z.string().min(1)).min(1),
    templates: z.array(z.string().regex(/^[a-z0-9_]+$/, 'must be snake_case')),
  }),
  exceptions: z.array(z.string().min(1)),
  sources: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        source: z.string().regex(KEBAB, 'must be a kebab-case source key'),
        quotes: z
          .array(z.strictObject({ text: z.string().min(1), supports: z.array(z.string().min(1)).min(1) }))
          .min(1),
      }),
    )
    .min(1),
  lead_character: z.enum(CHARACTERS),
  tags: z.array(z.string().min(1)),
  last_verified: z.iso.date().nullable(),
  verified_by: z.string().min(1).nullable(),
  review_by: z.iso.date().nullable(),
  replaced_by: z.string().regex(KEBAB, 'must be a rule id').optional(),
  history: z
    .array(
      z.strictObject({
        version: z.number().int().min(1),
        status: z.enum(RULE_STATUSES),
        date: z.iso.date(),
        note: z.string().min(1).max(200).optional(),
      }),
    )
    .min(1),
});

export const RuleSchema: z.ZodType<Rule> = RuleObjectSchema.superRefine((rule, ctx) => {
  if (rule.status !== 'draft') {
    for (const key of ['last_verified', 'verified_by', 'review_by'] as const) {
      if (rule[key] === null) {
        ctx.addIssue({ code: 'custom', path: [key], message: `is required when status is ${rule.status}` });
      }
    }
  }
  if (rule.replaced_by !== undefined && rule.status !== 'retired') {
    ctx.addIssue({ code: 'custom', path: ['replaced_by'], message: 'only retired rules may set replaced_by' });
  }
  const last = rule.history.at(-1);
  if (last && (last.version !== rule.version || last.status !== rule.status)) {
    ctx.addIssue({
      code: 'custom',
      path: ['history', rule.history.length - 1],
      message: `last history entry must be version ${rule.version}, status ${rule.status}`,
    });
  }
  rule.history.forEach((entry, index) => {
    const previous = rule.history[index - 1];
    if (previous && entry.version < previous.version) {
      ctx.addIssue({ code: 'custom', path: ['history', index, 'version'], message: 'history versions never decrease' });
    }
  });
  const seen = new Set<string>();
  rule.sources.forEach((ref, index) => {
    if (seen.has(ref.id)) {
      ctx.addIssue({ code: 'custom', path: ['sources', index, 'id'], message: `duplicate source id "${ref.id}"` });
    }
    seen.add(ref.id);
  });
});

const DetectorSchema: z.ZodType<Detector> = z.union([
  z.strictObject({ ota: z.strictObject({ service: z.string().min(1), terms_type: z.string().min(1) }) }),
  z.strictObject({ ecfr: z.strictObject({ title: z.number().int().min(1), part: z.number().int().min(1) }) }),
  z.strictObject({ changedetection: z.strictObject({ watch_uuid: z.string().min(1) }) }),
]);

export const SourceSchema: z.ZodType<Source> = z.strictObject({
  key: z.string().regex(KEBAB, 'must be kebab-case'),
  url: z.url({ protocol: /^https$/ }),
  kind: z.enum(SOURCE_KINDS),
  detector: DetectorSchema,
});

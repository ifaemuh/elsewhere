import type {
  RuleChange,
  RuleStatus,
  RulesLibrary,
} from "@elsewhere/rules/core";
import { isPublic } from "./projection";

export type ChangeKind = "added" | "changed" | "needs_review" | "retired";

export interface PublicChange {
  rule_id: string;
  kind: ChangeKind;
  from_version: number | null;
  from_status: Exclude<RuleStatus, "draft"> | null;
  to_version: number;
  status: Exclude<RuleStatus, "draft">;
  date: string;
}

export function changeKind(change: RuleChange): ChangeKind {
  // First public appearance, whatever status it arrives in.
  if (change.from_status === null || change.from_status === "draft")
    return "added";
  if (change.to_status === "retired") return "retired";
  if (change.to_status === "needs_review") return "needs_review";
  return "changed";
}

/** A real calendar date: 2026-02-30 is rejected (Date.parse would roll it over). */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function defaultSince(now: Date = new Date()): string {
  return new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
}

/** Changes safe to expose: only for public rules, and never a transition into draft. Shared with rules.json. */
export function publicChanges(library: RulesLibrary): RuleChange[] {
  const publicIds = new Set(library.rules.filter(isPublic).map((r) => r.id));
  return library.changes.filter(
    (c) => publicIds.has(c.rule_id) && c.to_status !== "draft",
  );
}

/** Newest first, ties keep the library's order. */
export function publicChangesSince(
  library: RulesLibrary,
  since: string,
): PublicChange[] {
  return publicChanges(library)
    .filter((c) => c.date.slice(0, 10) >= since)
    .map((c) => {
      // Never hint that a rule had an unpublished draft past.
      const fromDraft = c.from_status === "draft";
      return {
        rule_id: c.rule_id,
        kind: changeKind(c),
        from_version: fromDraft ? null : c.from_version,
        from_status: fromDraft
          ? null
          : (c.from_status as PublicChange["from_status"]),
        to_version: c.to_version,
        status: c.to_status as PublicChange["status"],
        date: c.date.slice(0, 10),
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

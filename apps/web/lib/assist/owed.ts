import type { Playbook } from './playbook-schema';

/** What the page shows for an owed item whose rules are being re-checked: no amount, no claim. */
export const RECHECK_TEXT = 'This item is being re-checked';

export interface ShownOwed {
  text: string;
  rule_ids: string[];
  rechecking: boolean;
}

/**
 * The owed items the page may show. A playbook is saved with the rules that were verified then; if every rule an item
 * cites has since left `verified`, the item is replaced by a neutral line rather than shown as something owed.
 */
export function shownOwed(owed: Playbook['owed'], isVerified: (ruleId: string) => boolean): ShownOwed[] {
  return owed.map((item) =>
    item.rule_ids.length > 0 && !item.rule_ids.some(isVerified)
      ? { text: RECHECK_TEXT, rule_ids: [], rechecking: true }
      : { ...item, rechecking: false },
  );
}

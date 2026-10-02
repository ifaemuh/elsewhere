import { isMap, type Document } from 'yaml';
import type { RuleHistoryEntry } from './schema';

/** Appends one history entry to a rule file's YAML document, written as a one-line flow map. */
export function appendHistory(doc: Document, entry: RuleHistoryEntry): void {
  const node = doc.createNode(entry);
  if (isMap(node)) node.flow = true;
  doc.addIn(['history'], node);
}

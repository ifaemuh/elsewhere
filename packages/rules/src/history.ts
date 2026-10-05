import { Document, isMap, isScalar, isSeq, parseDocument, stringify } from 'yaml';
import type { RuleHistoryEntry } from './schema';

/** Appends one history entry to a rule file's YAML document, written as a one-line flow map. */
export function appendHistory(doc: Document, entry: RuleHistoryEntry): void {
  const node = doc.createNode(entry);
  if (isMap(node)) node.flow = true;
  doc.addIn(['history'], node);
}

/**
 * Sets a rule file's status to needs_review and appends a history entry, editing the text in place
 * so everything else in the file (comments, folded scalars, line breaks) stays byte-identical.
 */
export function markNeedsReview(text: string, entry: RuleHistoryEntry): string {
  return editInPlace(text, entry, { status: 'needs_review' });
}

/**
 * Replaces the values of existing top-level scalars (key to new string value) and appends one
 * history entry, all as range edits on the original text.
 */
export function editInPlace(text: string, entry: RuleHistoryEntry, scalars: Record<string, string>): string {
  const doc = parseDocument(text);
  const history = doc.get('history', true);
  if (!isSeq(history) || !history.range || history.flow) {
    throw new Error('rule file must have a block-style history list');
  }
  const scratch = new Document({ history: [] });
  appendHistory(scratch, entry);
  const flowMap = scratch.toString({ lineWidth: 0 }).trimEnd().split('\n').at(-1)!.replace(/^\s*- /, '');
  const first = history.items[0] as { range?: [number, number, number] } | undefined;
  const lineStart = first?.range ? text.lastIndexOf('\n', first.range[0]) + 1 : 0;
  const indent = first?.range ? /^\s*/.exec(text.slice(lineStart))![0] : '  ';
  let end = history.range[1];
  const insert = `${text.endsWith('\n') || end < text.length ? '' : '\n'}${indent}- ${flowMap}\n`;
  if (end > 0 && text[end - 1] !== '\n') end = text.indexOf('\n', end) + 1 || text.length;
  const edits = [
    { at: end, del: 0, put: insert },
    ...Object.entries(scalars).map(([key, value]) => {
      const node = doc.get(key, true);
      if (!isScalar(node) || !node.range) throw new Error(`rule file must have a scalar ${key}`);
      return { at: node.range[0], del: node.range[1] - node.range[0], put: stringify(value, { lineWidth: 0 }).trimEnd() };
    }),
  ].sort((a, b) => b.at - a.at);
  let out = text;
  for (const e of edits) out = out.slice(0, e.at) + e.put + out.slice(e.at + e.del);
  return out;
}

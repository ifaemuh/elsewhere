import { parseDocument } from 'yaml';
import { editInPlace } from './history';
import { addDays } from './stale';

/**
 * Marks one rule file's YAML as verified by `by` on `date`, with review due 90 days later.
 * Edits in place so the rest of the file stays byte-identical.
 */
export function markVerified(yamlText: string, opts: { by: string; date: string }): string {
  const doc = parseDocument(yamlText);
  if (doc.get('status') === 'retired') throw new Error(`${String(doc.get('id'))} is retired and cannot be verified`);
  return editInPlace(
    yamlText,
    { version: Number(doc.get('version')), status: 'verified', date: opts.date },
    { status: 'verified', last_verified: opts.date, verified_by: opts.by, review_by: addDays(opts.date, 90) },
  );
}

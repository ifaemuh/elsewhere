import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ecfrXmlToText, fetchEcfrPart, type FetchLike } from '../src/ecfr';
import { FIXTURES } from './helpers';

const xml = readFileSync(join(FIXTURES, 'ecfr/title-14-part-260.xml'), 'utf8');

test('ecfrXmlToText keeps headings and paragraphs, drops notes and markup', () => {
  assert.equal(
    ecfrXmlToText(xml),
    [
      '## PART 260—REFUNDS FOR AIRLINE FARE AND ANCILLARY SERVICE FEES',
      '## § 260.1 Purpose.',
      'The purpose of this part is to ensure that carriers promptly refund consumers for:',
      '(a) Fees for ancillary services related to air travel that consumers paid for but were not provided;',
      '(c) Airfare including nonrefundable airfare for a flight that is cancelled or significantly changed where the consumer does not accept the significantly changed flight & rebooking.',
      '## § 260.2 Definitions.',
      'Air carrier means a citizen of the United States undertaking by any means to provide air transportation.',
    ].join('\n\n'),
  );
});

test('fetchEcfrPart asks for the title date, the part meta, then the compressed XML', async () => {
  const calls: { url: string; headers?: Record<string, string> }[] = [];
  const fake: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    const body: unknown = url.endsWith('/titles.json')
      ? { titles: [{ number: 14, up_to_date_as_of: '2026-09-30' }] }
      : url.includes('/versions/')
        ? { meta: { latest_amendment_date: '2024-08-12' } }
        : xml;
    return { ok: true, status: 200, text: async () => body as string, json: async () => body };
  };
  const part = await fetchEcfrPart({ title: 14, part: 260 }, fake);
  assert.deepEqual(calls.map((c) => c.url), [
    'https://www.ecfr.gov/api/versioner/v1/titles.json',
    'https://www.ecfr.gov/api/versioner/v1/versions/title-14.json?part=260',
    'https://www.ecfr.gov/api/versioner/v1/full/2026-09-30/title-14.xml?part=260',
  ]);
  assert.equal(calls[2]?.headers?.['Accept-Encoding'], 'gzip');
  assert.equal(part.amendedOn, '2024-08-12');
  assert.ok(part.text.startsWith('# 14 CFR Part 260 (amended 2024-08-12)\n\n## PART 260'));
});

test('fetchEcfrPart surfaces HTTP errors', async () => {
  const fake: FetchLike = async () => ({ ok: false, status: 503, text: async () => '', json: async () => ({}) });
  await assert.rejects(fetchEcfrPart({ title: 14, part: 260 }, fake), /eCFR 503/);
});

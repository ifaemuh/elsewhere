import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ecfrXmlToText, fetchEcfrPart, guardTruncated, type FetchLike } from '../src/ecfr';
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

test('ecfrXmlToText keeps table cells and rows apart', () => {
  const table =
    '<DIV5><HEAD>PART 1</HEAD><TABLE><CAPTION>Fees</CAPTION><TR><TH>Fee</TH><TH>Amount</TH></TR><TR><TD>Bag</TD><TD>$30</TD></TR></TABLE></DIV5>';
  assert.equal(ecfrXmlToText(table), '## PART 1\n\nFees\n\nFee Amount\nBag $30');
});

test('ecfrXmlToText drops footnote markers without fusing words, keeps footnote text', () => {
  const doc =
    '<DIV5><HEAD>PART 1</HEAD><P>A misleading word<SU>1</SU> here<FTREF/> again.</P><FTNT><P><SU>1</SU> The footnote text.</P></FTNT></DIV5>';
  assert.equal(ecfrXmlToText(doc), '## PART 1\n\nA misleading word here again.\n\nThe footnote text.');
});

test('ecfrXmlToText treats non-breaking spaces as ordinary spaces', () => {
  assert.equal(ecfrXmlToText('<DIV5><HEAD>H</HEAD><P>a&#xA0;&#xA0;b</P></DIV5>'), '## H\n\na b');
});

function respond(overrides: { versions?: unknown; xml?: string; versionsStatus?: number; xmlStatus?: number }): FetchLike {
  return async (url) => {
    const isXml = url.includes('/full/');
    const isVersions = url.includes('/versions/');
    const status = isXml ? (overrides.xmlStatus ?? 200) : isVersions ? (overrides.versionsStatus ?? 200) : 200;
    const body: unknown = url.endsWith('/titles.json')
      ? { titles: [{ number: 14, up_to_date_as_of: '2026-09-30' }] }
      : isVersions
        ? (overrides.versions ?? { meta: { latest_amendment_date: '2024-08-12' } })
        : (overrides.xml ?? xml);
    return { ok: status < 400, status, text: async () => body as string, json: async () => body };
  };
}

const ref = { title: 14, part: 260 };

test('fetchEcfrPart rejects bad 200 bodies instead of returning them', async () => {
  await assert.rejects(fetchEcfrPart(ref, respond({ xml: '<html><body>Maintenance</body></html>' })), /no regulation text/);
  await assert.rejects(fetchEcfrPart(ref, respond({ xml: '' })), /no regulation text/);
});

test('fetchEcfrPart rejects a versions response without latest_amendment_date', async () => {
  await assert.rejects(fetchEcfrPart(ref, respond({ versions: {} })), /latest_amendment_date/);
  await assert.rejects(fetchEcfrPart(ref, respond({ versions: { meta: {} } })), /latest_amendment_date/);
});

test('fetchEcfrPart surfaces non-OK versions and XML responses', async () => {
  await assert.rejects(fetchEcfrPart(ref, respond({ versionsStatus: 500 })), /eCFR 500/);
  await assert.rejects(fetchEcfrPart(ref, respond({ xmlStatus: 406 })), /eCFR 406/);
  await assert.rejects(fetchEcfrPart(ref, respond({ xmlStatus: 503 })), /eCFR 503/);
});

test('fetchEcfrPart aborts a stalled request instead of hanging (#22)', async () => {
  const fake: FetchLike = async (_url, init) => {
    assert.ok(init?.signal, 'every request carries an abort signal');
    return new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
  };
  await assert.rejects(fetchEcfrPart({ title: 14, part: 260 }, fake, { timeoutMs: 20 }), /aborted|timed out/);
});

test('guardTruncated refuses a body under half the previous one (#23)', () => {
  const previous = 'x'.repeat(1000);
  assert.throws(() => guardTruncated(previous, 'x'.repeat(499)), /truncated/);
  assert.doesNotThrow(() => guardTruncated(previous, 'x'.repeat(500)));
  assert.doesNotThrow(() => guardTruncated('', 'tiny'));
});

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }>;

const API = 'https://www.ecfr.gov/api/versioner/v1';
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return String.fromCodePoint(code);
    }
    return NAMED[entity.toLowerCase()] ?? `&${entity};`;
  });
}

/** eCFR XML → plain text: headings as `## `, one paragraph per <P>, citations and authority notes dropped. */
export function ecfrXmlToText(xml: string): string {
  const stripped = xml
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<(CITA|AUTH|SOURCE|EDNOTE|SECAUTH)\b[^>]*>[\s\S]*?<\/\1>/g, '')
    .replace(/<SU\b[^>]*>[\s\S]*?<\/SU>/g, '')
    .replace(/<FTREF\b[^>]*\/>|<FTREF\b[^>]*>[\s\S]*?<\/FTREF>/g, '')
    .replace(/<HEAD>/g, '\n\n## ')
    .replace(/<\/HEAD>/g, '\n\n')
    .replace(/<\/?(CAPTION|HD\d)\b[^>]*>/g, '\n\n')
    .replace(/<\/?(DIV\d*|TABLE|THEAD|TBODY|TFOOT)\b[^>]*>/g, '\n')
    .replace(/<\/TR>/g, '\n')
    .replace(/<(TD|TH)\b[^>]*>/g, ' ')
    .replace(/<(P|FP)\b[^>]*>/g, '\n\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(stripped)
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const ECFR_TIMEOUT_MS = 60_000;

/** Refuse a replacement body under half the size of the one on record: eCFR occasionally returns a cut-off document. */
export function guardTruncated(previous: string, next: string): void {
  if (previous.length > 0 && next.length < previous.length * 0.5) {
    throw new Error(`new eCFR text is ${next.length} chars against ${previous.length} on record (under 50%); treating it as truncated and keeping the old text`);
  }
}

async function getJson<T>(fetchImpl: FetchLike, url: string, timeoutMs: number): Promise<T> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`eCFR ${response.status} for ${url}`);
  return (await response.json()) as T;
}

export interface EcfrPart {
  text: string;
  amendedOn: string;
  asOf: string;
}

/** Current text of one CFR part, as of the title's latest published date. */
export async function fetchEcfrPart(
  ref: { title: number; part: number },
  fetchImpl: FetchLike = fetch,
  { timeoutMs = ECFR_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<EcfrPart> {
  const titles = await getJson<{ titles: { number: number; up_to_date_as_of: string }[] }>(fetchImpl, `${API}/titles.json`, timeoutMs);
  const asOf = titles.titles.find((t) => t.number === ref.title)?.up_to_date_as_of;
  if (!asOf) throw new Error(`eCFR has no title ${ref.title}`);

  const versions = await getJson<{ meta?: { latest_amendment_date?: string } }>(
    fetchImpl,
    `${API}/versions/title-${ref.title}.json?part=${ref.part}`,
    timeoutMs,
  );

  const url = `${API}/full/${asOf}/title-${ref.title}.xml?part=${ref.part}`;
  const response = await fetchImpl(url, { headers: { 'Accept-Encoding': 'gzip' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`eCFR ${response.status} for ${url}`);
  const amendedOn = versions.meta?.latest_amendment_date;
  if (!amendedOn) throw new Error(`eCFR versions response for title ${ref.title} part ${ref.part} has no latest_amendment_date`);
  const body = ecfrXmlToText(await response.text());
  if (!body.includes('## ')) throw new Error(`eCFR returned no regulation text for title ${ref.title} part ${ref.part}`);
  return { text: `# ${ref.title} CFR Part ${ref.part} (amended ${amendedOn})\n\n${body}\n`, amendedOn, asOf };
}

// Prints the weekly rules API report as Markdown.
// Local: node --env-file=.env.local --conditions=react-server --import tsx scripts/rules-api-report.ts
import { createAdminClient } from '../lib/supabase/admin';
import { aggregateReport, type FunnelRow, type ReportRow } from '../lib/rules-api/report';

async function main(): Promise<void> {
  const until = new Date();
  const since = new Date(until.getTime() - 7 * 86_400_000);
  const db = createAdminClient();

  const events = await db
    .from('rules_api_events')
    .select('surface, endpoint, client_name, rule_ids, missing_facts, query, result_count, status')
    .gte('created_at', since.toISOString())
    .limit(50_000);
  if (events.error) throw events.error;

  // Track C records UTM parameters in funnel_telemetry_events.metadata.
  const funnel = await db
    .from('funnel_telemetry_events')
    .select('event_name, metadata')
    .gte('created_at', since.toISOString())
    .in('metadata->>utm_source', ['mcp', 'api'])
    .limit(50_000);
  if (funnel.error) throw funnel.error;

  process.stdout.write(
    aggregateReport(events.data as ReportRow[], funnel.data as FunnelRow[], {
      since: since.toISOString().slice(0, 10),
      until: until.toISOString().slice(0, 10),
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

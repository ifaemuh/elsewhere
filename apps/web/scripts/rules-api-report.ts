// Prints the weekly rules API report as Markdown. Read-only.
// Local: node --env-file=.env.local --conditions=react-server --import tsx scripts/rules-api-report.ts
import { createAdminClient } from '../lib/supabase/admin';
import { aggregateReport, fetchReportData } from '../lib/rules-api/report';

async function main(): Promise<void> {
  const until = new Date();
  const since = new Date(until.getTime() - 7 * 86_400_000);
  const { rows, funnel } = await fetchReportData(createAdminClient(), { since, until });
  process.stdout.write(
    aggregateReport(rows, funnel, { since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) }),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

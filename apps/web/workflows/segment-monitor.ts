export async function segmentMonitorWorkflow(segmentId: string) {
  'use workflow';
  return { segmentId, status: 'not-monitored-yet' as const };
}

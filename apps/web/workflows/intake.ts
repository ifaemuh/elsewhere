import { start } from 'workflow/api';
import { segmentMonitorWorkflow } from './segment-monitor';

export async function intakeWorkflow(messageId: string) {
  'use workflow';
  const result = await processInboundStep(messageId);
  if ('monitorSegmentIds' in result) {
    for (const segmentId of result.monitorSegmentIds) await start(segmentMonitorWorkflow, [segmentId]);
  }
  return result;
}

async function processInboundStep(messageId: string) {
  'use step';
  const { processInboundMessage } = await import('@/lib/intake/process');
  const { liveIntakeDeps } = await import('@/lib/intake/live-deps');
  return processInboundMessage(messageId, liveIntakeDeps());
}

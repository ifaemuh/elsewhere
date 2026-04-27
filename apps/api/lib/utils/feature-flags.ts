export interface FeatureFlags {
  enableFunnelTelemetry: boolean;
  enableAssistAutoExecution: boolean;
}

export function getFeatureFlags(): FeatureFlags {
  return {
    enableFunnelTelemetry: process.env.ELSEWHERE_ENABLE_FUNNEL_TELEMETRY !== 'false',
    enableAssistAutoExecution: process.env.ELSEWHERE_ENABLE_ASSIST_AUTO_EXECUTION !== 'false',
  };
}

export function getEnvironment(): string {
  return process.env.ELSEWHERE_ENVIRONMENT ?? 'dev';
}

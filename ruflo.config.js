export default {
  project: 'elsewhere',
  agents: {
    'trip-researcher': {
      type: 'researcher',
      description: 'Research destination data, pricing, seasonal patterns',
      memory: { namespace: 'destinations' },
    },
    'api-coder': {
      type: 'coder',
      description: 'Implement API routes following existing patterns',
      memory: { namespace: 'api-patterns' },
    },
    'policy-author': {
      type: 'planner',
      description: 'Author and validate assist policy rules',
      memory: { namespace: 'policies' },
    },
    'test-writer': {
      type: 'tester',
      description: 'Generate integration and e2e tests',
      memory: { namespace: 'tests' },
    },
  },
  swarms: {
    'build-api-route': {
      agents: ['api-coder', 'test-writer'],
      coordination: 'sequential',
      description: 'Build an API route with tests',
    },
    'build-assist-policy': {
      agents: ['trip-researcher', 'policy-author'],
      coordination: 'sequential',
      description: 'Research disruption patterns and create policy rules',
    },
  },
  memory: {
    backend: 'local',
    persistPath: '.ruflo/memory',
  },
};

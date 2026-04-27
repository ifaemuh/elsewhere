// AI Gateway routes all model calls through Vercel's unified API.
// Authentication via OIDC (auto on Vercel) or AI_GATEWAY_API_KEY env var.
// No provider-specific API keys needed in production.

// Model slugs for AI Gateway
export const models = {
  // Text generation — prompt enhancement, itinerary planning
  text: 'anthropic/claude-sonnet-4.6',

  // Image generation — cinematic travel previews (generic, no face)
  image: 'google/gemini-3.1-flash-image-preview',

  // Face-personalized image generation (via Replicate, not AI Gateway)
  personalized: 'black-forest-labs/flux-kontext-pro',

  // Fallback text model
  textFallback: 'openai/gpt-5.4',
} as const;

export function buildPreviewPrompt(
  destinationName: string,
  userPrompt: string,
): string {
  return `Create a cinematic, photorealistic travel image of ${destinationName}.
The scene should feel immersive and aspirational — like a frame from a travel documentary.
User vision: ${userPrompt}
Style: golden hour lighting, rich colors, high detail, editorial travel photography.
No text overlays or watermarks.`;
}

export function buildPersonalizedPreviewPrompt(
  destinationName: string,
  enhancedPrompt: string,
): string {
  return `Place the person from the reference photo into a cinematic travel scene at ${destinationName}.
${enhancedPrompt}
The person should look natural in the scene, wearing appropriate vacation attire.
Style: golden hour lighting, rich colors, editorial travel photography.
Maintain the person's exact facial features and likeness.
No text overlays or watermarks.`;
}

export function buildItinerarySystemPrompt(): string {
  return `You are an expert travel planner for Elsewhere. Create structured, day-by-day itineraries
that balance must-see experiences with authentic local discoveries. Include specific activity names,
estimated times, and practical logistics. Be opinionated about the best experiences.`;
}

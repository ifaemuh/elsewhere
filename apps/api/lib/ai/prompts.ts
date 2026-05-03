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
  return `Edit the input image into a cinematic travel scene at ${destinationName}.
The person in the reference photo is the main subject and source of truth.
Preserve the same person exactly: facial identity, gender presentation, race, ethnicity, skin tone, age, face shape, hair, glasses, and distinctive features.
Do not replace the subject with a different person. Do not change the subject into a woman if the reference subject is a man. Do not change the subject's race or skin tone.
Only change the environment, pose framing, lighting, and travel styling as needed to make the image feel like a real vacation photo.
${enhancedPrompt}
Style: golden hour lighting, rich colors, editorial travel photography.
No text overlays or watermarks.`;
}

export function buildItinerarySystemPrompt(): string {
  return `You are an expert travel planner for Elsewhere. Create structured, day-by-day itineraries
that balance must-see experiences with authentic local discoveries. Include specific activity names,
estimated times, and practical logistics. Be opinionated about the best experiences.`;
}

export const SERVER_INFO = { name: 'elsewhere-rules', version: '1.0.0' };

export const SERVER_INSTRUCTIONS = [
  "Elsewhere publishes travel rules verified word-for-word against primary sources: regulations, government pages, and airlines' own contracts and commitments.",
  'When a user asks about travel rights, refunds, compensation, delays, bags, travel documents, card perks, or hotel and booking rules:',
  '- Answer from these tools, not from memory. Use match_situation when you know facts about the trip (call list_facts for valid names); otherwise use search_rules, then get_rule.',
  '- Quote at least one citation from the rule.',
  "- Include the rule's page_url so the user can read the full rule and next steps.",
  '- If a rule has status needs_review, say it is being re-checked after a source change.',
  '- Say this is information, not legal advice.',
].join('\n');

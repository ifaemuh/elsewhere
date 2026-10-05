import { z } from 'zod';

const Cited = z.object({ text: z.string(), rule_ids: z.array(z.string()) });

export const PlaybookSchema = z.object({
  summary: z.string().describe('Two sentences at most: what happened and the headline of what you can do.'),
  owed: z.array(Cited).describe('What the travelers are owed. Every item cites the rule ids it comes from.'),
  steps: z.array(Cited).describe('What to do, in order.'),
  messages: z
    .array(
      z.object({
        to: z.enum(['airline', 'hotel', 'ota', 'group']),
        channel: z.enum(['email', 'chat', 'phone', 'in_person']),
        body: z.string(),
        rule_ids: z.array(z.string()),
      }),
    )
    .describe('Messages we drafted for the travelers to send themselves.'),
  caveats: z.array(z.string()),
});

export type Playbook = z.infer<typeof PlaybookSchema>;

// Replays real past disruptions through the live playbook model. Data stays OUTSIDE the repo.
//   npm run rules:build -w @elsewhere/rules
//   AI_GATEWAY_API_KEY=... npm run eval:replay -- ~/elsewhere-evals/incidents
// Every playbook is written to <dir>/out/ for the founder to read before launch.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { AssessmentInput } from '@/lib/assist/assess';

type ReplayCase = Omit<AssessmentInput, 'asked' | 'rules'> & { expected_rule_ids: string[] };

const USAGE = `Usage: AI_GATEWAY_API_KEY=<key> npm run eval:replay -- <dir>
  <dir>  a folder of <case>.json files, each { incident, segment, booking, offers, airports, expected_rule_ids }
         (the data lives outside the repo, for example ~/elsewhere-evals/incidents)
Run \`npm run rules:build -w @elsewhere/rules\` first. This calls the live playbook model through AI Gateway and spends credit.`;

function usage(problem: string): never {
  console.error(`${problem}\n\n${USAGE}`);
  process.exit(2);
}

const dirArg = process.argv[2];
if (!dirArg) usage('No case directory given.');
if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) usage('AI_GATEWAY_API_KEY is not set.');
const root = path.resolve(dirArg.replace(/^~/, homedir()));
if (!existsSync(root) || !statSync(root).isDirectory()) usage(`${root} is not a directory.`);
const files = readdirSync(root).filter((file) => file.endsWith('.json')).sort();
if (files.length === 0) usage(`No cases in ${root}.`);

// Loaded only after the arguments check out, so a bad invocation never touches the model code.
const { assess } = await import('@/lib/assist/assess');
const { checkCitations } = await import('@/lib/assist/citation-check');
const { generatePlaybook } = await import('@/lib/assist/playbook');
const { ASK_ORDER } = await import('@/lib/assist/questions');
const { getLibrary } = await import('@/lib/rules/library');

const outDir = path.join(root, 'out');
mkdirSync(outDir, { recursive: true });

const rules = getLibrary().rules;
let drafted = 0;
let fellBack = 0;
let noRule = 0;
let wrongRules = 0;
for (const file of files) {
  const { expected_rule_ids: expectedRuleIds, ...replay } = JSON.parse(readFileSync(path.join(root, file), 'utf8')) as ReplayCase;
  // Every question counts as asked: the case already carries the planner's answers.
  const assessment = assess({ ...replay, asked: [...ASK_ORDER], rules });
  const matched = assessment.applying.map((r) => r.id).sort();
  const expected = [...expectedRuleIds].sort();
  if (matched.join(',') !== expected.join(',')) {
    wrongRules += 1;
    console.log(`RULES    ${file}: expected ${expected.join(', ') || 'none'}, matched ${matched.join(', ') || 'none'}`);
  }
  if (assessment.applying.length === 0) {
    noRule += 1;
    console.log(`no rule  ${file}: no verified rule applies, so it gets the template`);
    continue;
  }
  const result = await generatePlaybook(assessment);
  const recheck = result.model === 'template' ? [] : checkCitations(result.playbook, assessment.applying, assessment.extraNumbers);
  writeFileSync(path.join(outDir, file), JSON.stringify({ eventSummary: assessment.eventSummary, applying: assessment.applying.map((r) => r.id), ...result }, null, 2));
  if (result.model === 'template' || recheck.length > 0) {
    fellBack += 1;
    console.log(`FALLBACK ${file}: ${recheck.map((i) => `${i.path} ${i.problem}`).join('; ') || 'failed the citation check twice'}`);
  } else {
    drafted += 1;
    console.log(`passed   ${file}: cites ${result.rulesCited.map((r) => r.rule_id).join(', ')}`);
  }
}

console.log(`\n${files.length} cases · ${drafted} drafted and cited · ${fellBack} fell back to the template · ${noRule} with no verified rule · ${wrongRules} rule mismatches`);
console.log(`Read every playbook in ${outDir} before launch.`);
process.exitCode = fellBack === 0 && wrongRules === 0 && drafted > 0 ? 0 : 1;

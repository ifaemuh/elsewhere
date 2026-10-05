import { parseArgs } from 'node:util';
import { DEFAULT_DATA_DIR, DEFAULT_SOURCES_FILE, loadRules, loadSources } from '../load';
import { rulesDueForReview, staleReport } from '../stale';

const { values } = parseArgs({
  options: {
    within: { type: 'string', default: '14' },
    'data-dir': { type: 'string', default: DEFAULT_DATA_DIR },
    sources: { type: 'string', default: DEFAULT_SOURCES_FILE },
  },
});

const rules = loadRules({ dataDir: values['data-dir'], sources: loadSources(values.sources) });
const report = staleReport(rulesDueForReview(rules, new Date(), Number(values.within)));
if (report) console.log(report);

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';
import { retiredRedirects } from './lib/rules/accessors';
import { parseLibrary } from './lib/rules/parse-library';

const nextConfig: NextConfig = {
  cacheComponents: true,
  transpilePackages: ['@elsewhere/rules'],
  // The app imports packages/rules/dist/rules.json from the monorepo root.
  turbopack: { root: path.join(__dirname, '../..') },
  // Retired rules answer with a real 308: crawlers and link-preview bots ignore the client-side
  // redirect a mid-stream permanentRedirect() becomes.
  async redirects() {
    const raw = JSON.parse(readFileSync(path.join(__dirname, '../../packages/rules/dist/rules.json'), 'utf8'));
    return retiredRedirects(parseLibrary(raw));
  },
};

export default withWorkflow(nextConfig);

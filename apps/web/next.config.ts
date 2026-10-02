import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  transpilePackages: ['@elsewhere/rules'],
  // The app imports packages/rules/dist/rules.json from the monorepo root.
  turbopack: { root: path.join(__dirname, '../..') },
  // next/og routes read character art from disk.
  outputFileTracingIncludes: { '/**': ['./public/characters/**/*'] },
};

export default nextConfig;

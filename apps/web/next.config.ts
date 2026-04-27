import type { NextConfig } from 'next';

const API_TARGET = process.env.API_INTERNAL_URL ?? 'http://localhost:3002';

const nextConfig: NextConfig = {
  transpilePackages: ['@elsewhere/shared'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${API_TARGET}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;

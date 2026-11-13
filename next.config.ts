import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pages publishes static files; normal builds retain the Next.js server.
  output: process.env.NEXT_STATIC_EXPORT === 'true' ? 'export' : undefined,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
};

export default nextConfig;

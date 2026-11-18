import type { NextConfig } from 'next';

const staticExport = process.env.NEXT_STATIC_EXPORT === 'true';

const nextConfig: NextConfig = {
  // Pages publishes static files; normal builds retain the Next.js server.
  output: staticExport ? 'export' : undefined,
  // Give each exported route an index.html for direct GitHub Pages visits.
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  // GitHub Pages serves directory indexes directly. Match that in Next dev/start.
  ...(staticExport ? {} : {
    async rewrites() {
      return [{ source: '/challenge', destination: '/challenge/index.html' }];
    },
  }),
};

export default nextConfig;

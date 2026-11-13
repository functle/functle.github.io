import type { NextConfig } from 'next';

const staticExport = process.env.NEXT_STATIC_EXPORT === 'true';

const nextConfig: NextConfig = {
  // Pages publishes static files; normal builds retain the Next.js server.
  output: staticExport ? 'export' : undefined,
  // Give each exported route an index.html for direct GitHub Pages visits.
  trailingSlash: staticExport,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
};

export default nextConfig;

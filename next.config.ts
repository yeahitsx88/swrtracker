import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Server-side only packages — not bundled for the browser
  serverExternalPackages: ['pg', 'bcrypt', 'jsonwebtoken'],
  ...(process.env.SWR_PREVIEW_DIST_DIR ? { distDir: process.env.SWR_PREVIEW_DIST_DIR } : {}),
};

export default nextConfig;

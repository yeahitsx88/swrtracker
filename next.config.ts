import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Server-side only packages — not bundled for the browser
  serverExternalPackages: ['pg', 'bcrypt', 'jsonwebtoken'],
};

export default nextConfig;

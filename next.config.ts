import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Let attachment routes enforce their 30 MiB file / 31 MiB multipart bounds.
  experimental: { middlewareClientMaxBodySize: 32 * 1024 * 1024 },
  // Server-side only packages — not bundled for the browser
  serverExternalPackages: ['pg', 'bcrypt', 'jsonwebtoken'],
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Without this, Next blocks its dev resources (including HMR) for the sandboxed
  // preview host and the live preview only updates on a manual reload.
  allowedDevOrigins: ['*.e2b.app'],
};

export default nextConfig;

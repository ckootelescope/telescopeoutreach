/** @type {import('next').NextConfig} */
const nextConfig = {
  // Every page reads live outreach state, so nothing here should be
  // statically rendered at build time.
  experimental: { staleTimes: { dynamic: 0 } },
};

export default nextConfig;

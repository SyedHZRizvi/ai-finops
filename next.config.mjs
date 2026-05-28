/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required for the Electron shell to embed the server. `standalone` emits a
  // self-contained `.next/standalone/server.js` we can spawn from the main
  // process without needing a Node install on the user's machine.
  output: 'standalone',
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
};
export default nextConfig;

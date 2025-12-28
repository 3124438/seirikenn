/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // ↓↓↓ ここが今回の修正ポイントです ↓↓↓
  transpilePackages: ['undici', 'firebase', '@firebase/auth'],
}

module.exports = nextConfig

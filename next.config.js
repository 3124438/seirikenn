/** @type {import('next').NextConfig} */
const nextConfig = {
  // エラーチェックを無視
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // "undici" という部品を強制的に読み込ませる設定
  transpilePackages: ['undici', 'firebase', '@firebase/auth'],
  
  // さらに、スマホ用の画面を作るときは "undici" を完全に無視させる設定（ここが最強！）
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias['undici'] = false;
    }
    return config;
  },
}

module.exports = nextConfig

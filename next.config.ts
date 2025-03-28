// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disabling strict mode can help with socket connections
  swcMinify: true,
  webpack: (config, { isServer }) => {
    // Add polyfills for Socket.IO, if needed
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        http: require.resolve('stream-http'),
        https: require.resolve('https-browserify'),
        zlib: require.resolve('browserify-zlib'),
      };
    }
    return config;
  },
  // Allow larger payloads for audio data
  api: {
    responseLimit: '8mb',
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

module.exports = nextConfig;
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['app.gridge.ai', 'console.gridge.ai', 'localhost:3000', 'localhost:3001'],
    },
  },
}

module.exports = nextConfig

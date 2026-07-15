/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // ⚠️ PLAYWRIGHT CONFIGURATION - Must NOT externalize since we use static import
  // Webpack should bundle playwright normally for Vercel serverless
};

export default nextConfig;

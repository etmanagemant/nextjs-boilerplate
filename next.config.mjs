/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // ⚠️ REMOVED WEBPACK EXTERNALS - Let Next.js bundle Playwright normally
  // Playwright MUST be installed on Vercel via npm install + postinstall script
};

export default nextConfig;

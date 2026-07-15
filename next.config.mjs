/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // ⚠️ PLAYWRIGHT CONFIGURATION FOR VERCEL
  webpack: (config, { isServer }) => {
    // Handle Playwright on serverless - externalize modules that can't be bundled
    if (isServer) {
      config.externals = config.externals || [];
      
      // Playwright modules that should NOT be bundled (too large, platform-specific)
      const playwrightExternals = [
        'playwright',
        'playwright-core',
        '@playwright/test',
      ];
      
      // Mark as external to prevent bundling
      playwrightExternals.forEach(pkg => {
        if (!config.externals.includes(pkg)) {
          config.externals.push(pkg);
        }
      });
    }
    
    return config;
  },
  
  // Increase serverless function timeout and memory hints
  onDemandEntries: {
    maxInactiveAge: 15000,
    pagesBufferLength: 2,
  },
};

export default nextConfig;

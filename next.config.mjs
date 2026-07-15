/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // ⚠️ CRITICAL: Mark Playwright as external to prevent Turbopack from bundling it
  // This is required because Playwright-core tries to load browsers.json during bundling
  // Even though we don't use local browsers (Browserless.io), Turbopack still processes the import
  serverComponentsExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;

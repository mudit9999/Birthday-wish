import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@family-wishes/core", "@family-wishes/db"],
  serverExternalPackages: ["@electric-sql/pglite"],
  // Keep the dev badge off the sidebar's account row.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;

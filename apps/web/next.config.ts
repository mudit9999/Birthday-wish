import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@family-wishes/core", "@family-wishes/db"],
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cursor identity helpers import .js paths that resolve to sibling .ts sources.
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
  // Keep the duty-manager UI clean during Try Live demos.
  devIndicators: false,
};

export default nextConfig;

import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@tubeforge/core"],
  serverExternalPackages: ["googleapis", "@neondatabase/serverless"],
  webpack: (cfg) => {
    // Let the TS core's ".js" ESM import specifiers resolve to ".ts" source.
    cfg.resolve.extensionAlias = {
      ...(cfg.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return cfg;
  },
};

export default config;

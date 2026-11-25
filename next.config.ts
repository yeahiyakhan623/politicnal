import type { NextConfig } from "next";

const stagingE2eDistDir =
  process.env.STAGING_E2E === "1" &&
  /^\.next-staging-e2e-[a-f0-9-]+$/.test(process.env.STAGING_E2E_DIST_DIR ?? "")
    ? process.env.STAGING_E2E_DIST_DIR
    : undefined;

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: "security",
  },
  ...(stagingE2eDistDir ? { distDir: stagingE2eDistDir } : {}),
  poweredByHeader: false,
};

export default nextConfig;

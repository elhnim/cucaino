import path from "node:path";
import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
  },
});

const nextConfig: NextConfig = {
  // Pin the tracing root to THIS app. A stray package-lock.json in a parent
  // folder otherwise makes Next/Netlify treat the app as a monorepo package,
  // which generates broken Windows-path imports in the deployed server handler.
  outputFileTracingRoot: path.resolve(__dirname),
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.COMMIT_REF?.slice(0, 7) ?? "dev",
  },
};

export default withPWA(nextConfig);

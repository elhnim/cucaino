import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.COMMIT_REF?.slice(0, 7) ?? "dev",
  },
};

export default nextConfig;

import dns from "node:dns";
import type { NextConfig } from "next";

// Workaround for IPv6/IPv4 ordering on some Windows networks.
// Without this, Node 18+ tries IPv6 first and may stall 10s before
// falling back to IPv4 when the AAAA path is unroutable, which shows up
// as `fetch failed` with `ConnectTimeoutError` against Supabase.
dns.setDefaultResultOrder("ipv4first");

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // One 5 MB image plus multipart overhead; six-photo limits are enforced in SQL.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;

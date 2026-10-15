import type { NextConfig } from "next";
import { MAX_SERVER_ACTION_BYTES } from "./src/lib/upload-limits.mjs";

const nextConfig: NextConfig = {
  // One 3 MB image plus form fields; total stays below Vercel's 4.5 MB limit.
  experimental: { serverActions: { bodySizeLimit: MAX_SERVER_ACTION_BYTES } },
};

export default nextConfig;

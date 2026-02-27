import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@clapps/core", "@clapps/renderer", "@clapps/transport"],
};

export default nextConfig;

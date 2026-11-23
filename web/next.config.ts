import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // small production image for Docker
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
};

export default nextConfig;

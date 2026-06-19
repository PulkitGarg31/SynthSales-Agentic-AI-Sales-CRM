import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a minimal self-contained server (.next/standalone/server.js) for a lean
  // production Docker image — see Dockerfile. Next.js 16 traces only the files
  // each route needs, so node_modules isn't shipped wholesale.
  output: "standalone",
};

export default nextConfig;

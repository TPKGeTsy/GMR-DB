import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained `.next/standalone` server (only the files
  // actually needed at runtime) — what the Docker build below copies into
  // the final image. Vercel doesn't need this (it builds its own way), but
  // self-hosting does.
  output: "standalone",
  // modbus-serial optionally requires native serial-port bindings; keep it out
  // of the bundle so Node loads it normally.
  serverExternalPackages: ["modbus-serial"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow ngrok and other dev origins
  allowedDevOrigins: ["humbly-emerging-terrapin.ngrok-free.app"],
  // Enable Turbopack (default in Next.js 16+)
  turbopack: {},
  // Silence webpack warning since we're using turbopack
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  // CORS headers for Safe Apps SDK
  async headers() {
    return [
      {
        source: "/manifest.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET" },
          { key: "Access-Control-Allow-Headers", value: "X-Requested-With, Content-Type, Accept" },
        ],
      },
      {
        source: "/:path*/manifest.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET" },
          { key: "Access-Control-Allow-Headers", value: "X-Requested-With, Content-Type, Accept" },
        ],
      },
      {
        source: "/logo.svg",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
  // Rewrites to serve manifest.json from any path
  async rewrites() {
    return [
      {
        source: "/:path*/manifest.json",
        destination: "/manifest.json",
      },
    ];
  },
};

export default nextConfig;

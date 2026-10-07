import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.OUTPUT_STANDALONE === 'true' ? 'standalone' : undefined,
  allowedDevOrigins: [
    'kangaroo-slab-quarterly.ngrok-free.dev',
    '*.ngrok-free.dev',
  ],
};

export default nextConfig;

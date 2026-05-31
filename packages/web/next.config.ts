import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_DAEMON_URL: process.env.NEXT_PUBLIC_DAEMON_URL ?? "http://127.0.0.1:3738",
  },
};

export default nextConfig;

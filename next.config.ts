import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Electron 桌面版会把 .next/standalone 作为内置服务打包，
  // 浏览器部署时该选项不影响正常使用。
  output: "standalone",
  // Fully dynamic app (downloads / tasks / API): keep route segment configs valid.
  cacheComponents: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Electron 桌面版会把 .next/standalone 作为内置服务打包，
  // 浏览器部署时该选项不影响正常使用。
  output: "standalone",
  // Fully dynamic app (downloads / tasks / API): keep route segment configs valid.
  cacheComponents: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // 浏览器端 ffmpeg.wasm 资源较大（约 31MB），让浏览器缓存一天，
  // 手机网页端第二次合并/刷新页面时无需重新下载。
  async headers() {
    return [
      {
        source: "/ffmpeg/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
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

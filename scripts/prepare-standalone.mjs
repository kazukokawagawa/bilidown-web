import fs from "node:fs";
import path from "node:path";

/**
 * Next.js standalone 产物默认不包含静态资源，Electron 内置服务需要
 * 把 .next/static 与 public 复制进 .next/standalone 后再打包。
 */
const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("[prepare-standalone] 未找到 .next/standalone/server.js，请先运行 next build");
  process.exit(1);
}

fs.mkdirSync(path.join(standalone, ".next"), { recursive: true });

const staticSource = path.join(root, ".next", "static");
if (fs.existsSync(staticSource)) {
  fs.cpSync(staticSource, path.join(standalone, ".next", "static"), { recursive: true, force: true });
}

const publicSource = path.join(root, "public");
if (fs.existsSync(publicSource)) {
  fs.cpSync(publicSource, path.join(standalone, "public"), { recursive: true, force: true });
}

console.log("[prepare-standalone] 静态资源已复制到 .next/standalone");

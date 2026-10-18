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

// Turbopack 遇到动态路径访问时会把整个项目 trace 进 standalone（构建警告可见），
// 其中包含 release/downloads/data/screenshots 等运行期不需要的目录。这里清掉它们：
// 1) 避免打包版体积膨胀（release 里的安装包会被二次打包）；
// 2) 避免把本机下载文件、以及 data/settings.json 里的登录 Cookie 打进安装包。
const pruneDirs = ["release", "downloads", "data", "screenshots", "docs"];
const pruneFiles = ["start.log", "build.log", "lint.log", "electron-smoke.log", "tsconfig.tsbuildinfo"];
for (const dir of pruneDirs) {
  fs.rmSync(path.join(standalone, dir), { recursive: true, force: true });
}
for (const file of pruneFiles) {
  fs.rmSync(path.join(standalone, file), { force: true });
}

console.log("[prepare-standalone] 静态资源已复制，无关目录已清理");

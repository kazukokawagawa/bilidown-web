import fs from "node:fs";
import path from "node:path";

/**
 * 把 @ffmpeg/ffmpeg（浏览器端封装）与 @ffmpeg/core（WASM 核心）的 ESM 产物
 * 复制到 public/ffmpeg/，让浏览器从本站点同源懒加载，而不是依赖外部 CDN。
 *
 * 为什么复制到 public 而不是用 `import "@ffmpeg/ffmpeg"`：
 * - @ffmpeg/ffmpeg 内部用 `new Worker(new URL("./worker.js", import.meta.url))` 创建
 *   module worker，打包器（Turbopack/webpack）处理该写法容易踩坑；
 * - 复制后前端用原生 `import("/ffmpeg/classes.js")` 懒加载，构建链完全无感；
 * - 手机网页端/Electron 桌面版都能离线使用，不依赖 CDN 与 SharedArrayBuffer
 *   （这里使用单线程 core，无需 COOP/COEP 跨源隔离头）。
 *
 * 资源约 32MB（ffmpeg-core.wasm），只在用户点击“浏览器合并”时才下载。
 * 该脚本在 postinstall / predev / prebuild 时执行；已是最新版本时直接跳过。
 */
const root = process.cwd();
const targetDir = path.join(root, "public", "ffmpeg");
const markerFile = path.join(targetDir, "prepared.json");

/** 需要复制的包与文件（保持同名，worker 的 ./const.js 等相对导入才能成立）。 */
const PACKAGES = [
  {
    name: "@ffmpeg/ffmpeg",
    dir: "node_modules/@ffmpeg/ffmpeg/dist/esm",
    files: ["classes.js", "const.js", "errors.js", "utils.js", "types.js", "worker.js", "index.js"],
  },
  {
    name: "@ffmpeg/core",
    dir: "node_modules/@ffmpeg/core/dist/esm",
    files: ["ffmpeg-core.js", "ffmpeg-core.wasm"],
  },
];

function readPackageVersion(name) {
  try {
    const raw = fs.readFileSync(path.join(root, "node_modules", name, "package.json"), "utf8");
    return JSON.parse(raw).version ?? null;
  } catch {
    return null;
  }
}

function fail(message) {
  console.error("[prepare-ffmpeg-wasm] " + message);
  process.exit(1);
}

const plan = [];
for (const pkg of PACKAGES) {
  const version = readPackageVersion(pkg.name);
  if (!version) fail(`缺少依赖 ${pkg.name}，请先运行 pnpm install（或 npm install）`);
  for (const file of pkg.files) {
    const source = path.join(root, pkg.dir, file);
    if (!fs.existsSync(source)) fail(`缺少文件 ${path.relative(root, source)}，依赖可能损坏，请重新安装`);
    plan.push({ source, target: path.join(targetDir, file), name: pkg.name, version });
  }
}

// 已准备且版本/文件大小一致时跳过，避免每次 dev/build 重复拷贝 32MB。
const signature = {
  packages: Object.fromEntries(PACKAGES.map((pkg) => [pkg.name, readPackageVersion(pkg.name)])),
  files: Object.fromEntries(plan.map((item) => [path.basename(item.target), fs.statSync(item.source).size])),
};
try {
  const previous = JSON.parse(fs.readFileSync(markerFile, "utf8"));
  const sameSignature = JSON.stringify(previous) === JSON.stringify(signature);
  if (sameSignature && plan.every((item) => fs.existsSync(item.target))) {
    console.log("[prepare-ffmpeg-wasm] public/ffmpeg 已是最新，跳过");
    process.exit(0);
  }
} catch {
  // 标记文件不存在或损坏：重新复制
}

fs.mkdirSync(targetDir, { recursive: true });
for (const item of plan) {
  fs.copyFileSync(item.source, item.target);
}
fs.writeFileSync(markerFile, JSON.stringify(signature, null, 2) + "\n", "utf8");

const totalBytes = plan.reduce((sum, item) => {
  try {
    return sum + fs.statSync(item.target).size;
  } catch {
    return sum;
  }
}, 0);
console.log(
  "[prepare-ffmpeg-wasm] 已复制 " +
    plan.length +
    " 个文件到 public/ffmpeg（" +
    (totalBytes / 1024 / 1024).toFixed(1) +
    " MB）：" +
    plan.map((item) => path.basename(item.target)).join(", "),
);

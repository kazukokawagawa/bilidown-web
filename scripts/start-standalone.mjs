import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * 生产模式启动器。
 * Next.js 配置了 output: "standalone" 后不能再使用 next start，
 * 这里加载 .next/standalone/server.js，同时把数据/下载目录指回项目根目录。
 */
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const standaloneDir = path.join(root, ".next", "standalone");
const serverEntry = path.join(standaloneDir, "server.js");

if (!fs.existsSync(serverEntry)) {
  console.error("[start] 未找到 .next/standalone/server.js，请先运行 npm run build");
  process.exit(1);
}

const args = process.argv.slice(2);
function readOption(name) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : undefined;
}

const port = readOption("--port") || process.env.PORT || "3000";
const hostname = readOption("--hostname") || process.env.HOSTNAME || "127.0.0.1";

process.env.NODE_ENV = "production";
process.env.PORT = port;
process.env.HOSTNAME = hostname;
if (!process.env.BILIDOWN_DATA_DIR) process.env.BILIDOWN_DATA_DIR = path.join(root, "data");
if (!process.env.BILIDOWN_DOWNLOAD_DIR) process.env.BILIDOWN_DOWNLOAD_DIR = path.join(root, "downloads");

process.chdir(standaloneDir);
await import(pathToFileURL(serverEntry).href);
console.log("[start] bilidown-web web 服务已启动：http://" + hostname + ":" + port);

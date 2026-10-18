"use strict";

const {
  app,
  BrowserWindow,
  Notification,
  Tray,
  Menu,
  clipboard,
  dialog,
  ipcMain,
  shell,
  nativeImage,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { spawn } = require("node:child_process");

const APP_TITLE = "bilidown";
const DEV_URL = "http://127.0.0.1:3100";
const SMOKE_TEST = process.argv.includes("--smoke-test");
const EMBEDDED = app.isPackaged || process.env.BILIDOWN_EMBEDDED === "1";
const PROJECT_ROOT = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");

let mainWindow = null;
let serverProcess = null;
let tray = null;
let trayEnabled = false;
let quitting = false;
let clipboardTimer = null;
let lastClipboardText = "";
let pendingProtocolLink = null;

/* --------------------------------------------------------------- utilities */

function log() {
  console.log("[bilidown]", ...arguments);
}

function getAsset(name) {
  const candidates = [
    path.join(PROJECT_ROOT, "electron", "assets", name),
    path.join(__dirname, "assets", name),
    path.join(PROJECT_ROOT, "app", "public", name),
    path.join(PROJECT_ROOT, "public", name),
    path.join(app.getAppPath(), "electron", "assets", name),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = require("node:http").get(url, (response) => {
        response.resume();
        resolve(true);
      });
      request.on("error", () => {
        if (Date.now() > deadline) reject(new Error("服务启动超时：" + url));
        else setTimeout(attempt, 300);
      });
      request.setTimeout(2000, () => request.destroy());
    };
    attempt();
  });
}

function findProtocolArg(argv) {
  if (!Array.isArray(argv)) return null;
  for (const arg of argv) {
    if (typeof arg === "string" && /^bilidown:\/\//i.test(arg)) return arg;
  }
  return null;
}

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function dispatchProtocolLink(link) {
  pendingProtocolLink = link;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("protocol:link", link);
    focusMainWindow();
  }
}

/* ---------------------------------------------------------------- embedded */

async function startEmbeddedServer() {
  const appDir = app.isPackaged
    ? path.join(process.resourcesPath, "app")
    : path.join(PROJECT_ROOT, ".next", "standalone");
  const serverEntry = path.join(appDir, "server.js");
  if (!fs.existsSync(serverEntry)) {
    throw new Error("找不到内置服务：" + serverEntry + "（请先运行 npm run build）");
  }

  const port = await getFreePort();
  const dataDir = path.join(app.getPath("userData"), "data");
  const downloadDir = path.join(app.getPath("downloads"), "bilidown");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(downloadDir, { recursive: true });

  const env = Object.assign({}, process.env, {
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    BILIDOWN_DATA_DIR: dataDir,
    BILIDOWN_DOWNLOAD_DIR: downloadDir,
  });

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: appDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  serverProcess.stdout.on("data", (chunk) => log("server:", chunk.toString().trim()));
  serverProcess.stderr.on("data", (chunk) => log("server error:", chunk.toString().trim()));
  serverProcess.on("exit", (code) => {
    log("内置服务退出，code=" + code);
    serverProcess = null;
    if (!quitting) {
      dialog.showErrorBox(APP_TITLE, "本地服务已退出（code " + code + "），应用即将关闭。");
      app.quit();
    }
  });

  const url = "http://127.0.0.1:" + port;
  await waitForHttp(url + "/api/system/info", 45000);
  log("内置服务就绪：" + url);
  return url;
}

/* ------------------------------------------------------------------ window */

async function resolveAppUrl() {
  if (!EMBEDDED) {
    await waitForHttp(DEV_URL + "/api/system/info", 60000).catch(() => undefined);
    return DEV_URL;
  }
  return startEmbeddedServer();
}

async function createWindow() {
  const icon = getAsset("logo.ico");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0b0b0f",
    title: APP_TITLE,
    icon: icon || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (!SMOKE_TEST) mainWindow.show();
  });

  mainWindow.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) log("renderer console:", message);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log("renderer process gone:", JSON.stringify(details));
  });

  mainWindow.on("close", (event) => {
    if (trayEnabled && !quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  let appUrl;
  try {
    appUrl = await resolveAppUrl();
  } catch (error) {
    dialog.showErrorBox(APP_TITLE, String(error && error.message ? error.message : error));
    app.quit();
    return;
  }

  await mainWindow.loadURL(appUrl);

  if (pendingProtocolLink) {
    mainWindow.webContents.send("protocol:link", pendingProtocolLink);
    pendingProtocolLink = null;
  }

  if (SMOKE_TEST) {
    // loadURL 已 resolve，直接轮询执行脚本，等待桌面桥接对象注入完成
    (async () => {
      try {
        let result = null;
        for (let attempt = 0; attempt < 30; attempt++) {
          result = await mainWindow.webContents.executeJavaScript(
            "({ title: document.title, desktop: !!(window.bilidownDesktop && window.bilidownDesktop.isDesktop), headings: Array.from(document.querySelectorAll('h1')).map(function (h) { return h.textContent; }), textLength: (document.body ? document.body.innerText : '').length })",
          );
          if (result && result.desktop && result.textLength > 50) break;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        log("SMOKE_RESULT " + JSON.stringify(result));
        const ok = Boolean(result && result.desktop && result.textLength > 50 && result.headings.length > 0);
        quitting = true;
        app.exit(ok ? 0 : 1);
      } catch (error) {
        log("SMOKE_ERROR " + String(error));
        quitting = true;
        app.exit(1);
      }
    })();
    setTimeout(() => {
      log("SMOKE_TIMEOUT");
      quitting = true;
      app.exit(1);
    }, 30000);
  }
}

/* ------------------------------------------------------------------- tray */

function setTrayEnabled(enabled) {
  trayEnabled = Boolean(enabled);
  if (trayEnabled && !tray) {
    const iconPath = getAsset("logo.ico");
    if (!iconPath) return { enabled: false };
    let image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) image = image.resize({ width: 16, height: 16 });
    tray = new Tray(image);
    tray.setToolTip(APP_TITLE);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "显示主窗口", click: focusMainWindow },
        {
          label: "打开下载目录",
          click: () => {
            const dir = path.join(app.getPath("downloads"), "bilidown");
            shell.openPath(dir);
          },
        },
        { type: "separator" },
        {
          label: "退出",
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on("click", focusMainWindow);
  } else if (!trayEnabled && tray) {
    tray.destroy();
    tray = null;
  }
  return { enabled: trayEnabled };
}

/* -------------------------------------------------------------- clipboard */

function setClipboardWatch(enabled) {
  const value = Boolean(enabled);
  if (clipboardTimer) {
    clearInterval(clipboardTimer);
    clipboardTimer = null;
  }
  if (value) {
    lastClipboardText = clipboard.readText();
    clipboardTimer = setInterval(() => {
      const text = clipboard.readText();
      if (text && text !== lastClipboardText) {
        lastClipboardText = text;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("clipboard:change", text);
        }
      }
    }, 600);
  }
  return { enabled: value };
}

/* -------------------------------------------------------------------- IPC */

function registerIpc() {
  ipcMain.handle("desktop:info", () => ({
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
    userDataDir: app.getPath("userData"),
    downloadDir: path.join(app.getPath("downloads"), "bilidown"),
  }));

  ipcMain.handle("dialog:select-directory", async (_event, options) => {
    const result = await dialog.showOpenDialog(mainWindow || undefined, {
      title: (options && options.title) || "选择目录",
      defaultPath: (options && options.defaultPath) || app.getPath("downloads"),
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("dialog:select-file", async (_event, options) => {
    const kind = (options && options.kind) || "any";
    const filters =
      kind === "audio"
        ? [{ name: "音频", extensions: ["aac", "m4a", "m4s", "mp3", "flac", "wav", "ogg"] }]
        : kind === "video"
          ? [{ name: "视频", extensions: ["m4s", "mp4", "flv", "mkv", "mov"] }]
          : kind === "subtitle"
            ? [{ name: "字幕", extensions: ["json", "srt"] }]
            : [{ name: "所有文件", extensions: ["*"] }];
    const result = await dialog.showOpenDialog(mainWindow || undefined, {
      title: (options && options.title) || "选择文件",
      defaultPath: (options && options.defaultPath) || app.getPath("downloads"),
      properties: ["openFile"],
      filters,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("shell:open-path", async (_event, target) => {
    if (typeof target !== "string" || !target) return { ok: false, error: "路径为空" };
    const error = await shell.openPath(target);
    return error ? { ok: false, error } : { ok: true };
  });

  ipcMain.handle("shell:show-item", (_event, target) => {
    if (typeof target !== "string" || !target) return { ok: false, error: "路径为空" };
    shell.showItemInFolder(target);
    return { ok: true };
  });

  ipcMain.handle("shell:open-external", async (_event, url) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return { ok: false, error: "仅支持 http(s) 链接" };
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle("clipboard:read", () => clipboard.readText());
  ipcMain.handle("clipboard:write", (_event, text) => {
    clipboard.writeText(typeof text === "string" ? text : "");
    return { ok: true };
  });
  ipcMain.handle("clipboard:watch", (_event, enabled) => setClipboardWatch(enabled));

  ipcMain.handle("notify", (_event, payload) => {
    if (!Notification.isSupported()) return { ok: false };
    const title = (payload && payload.title) || APP_TITLE;
    const body = (payload && payload.body) || "";
    const notification = new Notification({ title, body, icon: getAsset("logo.ico") || undefined });
    notification.on("click", focusMainWindow);
    notification.show();
    return { ok: true };
  });

  ipcMain.handle("power:shutdown", async () => {
    const result = await dialog.showMessageBox(mainWindow || undefined, {
      type: "warning",
      title: "自动关机",
      message: "所有下载任务已完成，是否立即关机？",
      detail: "你可以在设置中关闭「全部完成后自动关机」。",
      buttons: ["取消", "立即关机"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (result.response !== 1) return { confirmed: false, shutdown: false };
    quitting = true;
    if (process.platform === "win32") {
      spawn("shutdown", ["/s", "/t", "0"], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("osascript", ["-e", 'tell app "System Events" to shut down'], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("shutdown", ["-h", "now"], { detached: true, stdio: "ignore" }).unref();
    }
    return { confirmed: true, shutdown: true };
  });

  ipcMain.handle("tray:set-enabled", (_event, enabled) => setTrayEnabled(enabled));

  ipcMain.handle("protocol:take", () => {
    const link = pendingProtocolLink;
    pendingProtocolLink = null;
    return link;
  });

  ipcMain.handle("window:minimize", () => mainWindow && mainWindow.minimize());
  ipcMain.handle("window:toggle-maximize", () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
}

/* ---------------------------------------------------------------- startup */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const link = findProtocolArg(argv);
    if (link) dispatchProtocolLink(link);
    else focusMainWindow();
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    dispatchProtocolLink(url);
  });

  app.whenReady().then(async () => {
    const protocolArgs = process.defaultApp
      ? process.argv.length >= 2
        ? [process.execPath, [path.resolve(process.argv[1])]]
        : null
      : [process.execPath];
    try {
      if (protocolArgs) app.setAsDefaultProtocolClient("bilidown", protocolArgs[0], protocolArgs[1]);
    } catch (error) {
      log("注册协议失败（可忽略）：" + String(error));
    }

    const link = findProtocolArg(process.argv);
    if (link) pendingProtocolLink = link;

    registerIpc();
    await createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
      else focusMainWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      if (!trayEnabled) app.quit();
    }
  });

  app.on("before-quit", () => {
    quitting = true;
    if (clipboardTimer) clearInterval(clipboardTimer);
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });

  app.on("will-quit", () => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch {
        /* ignore */
      }
      serverProcess = null;
    }
  });
}
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const handler = (_event, payload) => {
    try {
      callback(payload);
    } catch (error) {
      console.error("[bilidown] desktop event handler error", error);
    }
  };
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("bilidownDesktop", {
  isDesktop: true,
  platform: process.platform,
  getInfo: () => ipcRenderer.invoke("desktop:info"),
  selectDirectory: (options) => ipcRenderer.invoke("dialog:select-directory", options || {}),
  selectFile: (options) => ipcRenderer.invoke("dialog:select-file", options || {}),
  openPath: (target) => ipcRenderer.invoke("shell:open-path", target),
  showItemInFolder: (target) => ipcRenderer.invoke("shell:show-item", target),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  readClipboard: () => ipcRenderer.invoke("clipboard:read"),
  writeClipboard: (text) => ipcRenderer.invoke("clipboard:write", text),
  setClipboardWatch: (enabled) => ipcRenderer.invoke("clipboard:watch", enabled),
  notify: (payload) => ipcRenderer.invoke("notify", payload),
  requestShutdown: () => ipcRenderer.invoke("power:shutdown"),
  setTrayEnabled: (enabled) => ipcRenderer.invoke("tray:set-enabled", enabled),
  takePendingLink: () => ipcRenderer.invoke("protocol:take"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  onClipboardChange: (callback) => subscribe("clipboard:change", callback),
  onProtocolLink: (callback) => subscribe("protocol:link", callback),
});

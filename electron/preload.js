const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("urlinc", {
  getUserDataPath: () => ipcRenderer.invoke("get-user-data-path"),
  platform: process.platform,
  version: process.env.npm_package_version || "0.1.0",
});

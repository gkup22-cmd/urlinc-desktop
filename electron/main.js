const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const { startServer } = require("../server/index");

const PORT = 3847;
const isDev = process.env.NODE_ENV === "development";

let mainWindow;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0f",
    show: false,
    icon: path.join(__dirname, "../assets/icon.png"),
  });

  // Start the local Express server
  await startServer(PORT);

  const url = isDev
    ? "http://localhost:5173"          // Vite dev server
    : `http://localhost:${PORT}`;      // Express serves the built app

  mainWindow.loadURL(url);

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Open external links in the system browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Let renderer ask for the userData path (where DB and files live)
ipcMain.handle("get-user-data-path", () => app.getPath("userData"));

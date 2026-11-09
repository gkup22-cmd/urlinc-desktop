const express = require("express");
const cors = require("cors");
const path = require("path");
const { app: electronApp } = require("electron");
const { initDb } = require("./db");

const videosRouter = require("./routes/videos");
const storageRouter = require("./routes/storage");
const authRouter = require("./routes/auth");

let serverInstance = null;

async function startServer(port) {
  const app = express();

  // userData path: where Electron stores app data (DB, uploaded files)
  const userDataPath = electronApp.getPath("userData");

  app.use(cors());
  app.use(express.json());

  // Make userDataPath available to route handlers
  app.locals.userDataPath = userDataPath;
  app.locals.filesDir = path.join(userDataPath, "files");

  // Initialize SQLite database
  await initDb(userDataPath);

  // API routes
  app.use("/api/videos", videosRouter);
  app.use("/api/storage", storageRouter);
  app.use("/api/auth", authRouter);

  app.get("/api/health", (_req, res) => res.json({ ok: true, mode: "local" }));

  // Serve built React app in production
  const rendererDist = path.join(__dirname, "../renderer/dist");
  app.use(express.static(rendererDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(rendererDist, "index.html"));
  });

  return new Promise((resolve, reject) => {
    serverInstance = app.listen(port, "127.0.0.1", () => {
      console.log(`URLinc local server running on http://127.0.0.1:${port}`);
      resolve();
    });
    serverInstance.on("error", reject);
  });
}

function stopServer() {
  if (serverInstance) serverInstance.close();
}

module.exports = { startServer, stopServer };

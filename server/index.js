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

  // ── Stub routes for features not yet ported to desktop ──────────────────────
  app.get("/api/playlists", (_req, res) => res.json([]));
  app.post("/api/playlists", (req, res) => res.status(201).json({ id: `pl-${Date.now()}`, name: req.body?.name || "Playlist", isShow: false, videoCount: 0, createdAt: Math.floor(Date.now() / 1000) }));
  app.get("/api/playlists/find-or-create-show", (_req, res) => res.json({ id: `show-${Date.now()}`, name: "New Show", isShow: true }));
  app.post("/api/playlists/find-or-create-show", (_req, res) => res.json({ id: `show-${Date.now()}`, name: "New Show", isShow: true }));
  app.get("/api/playlists/:id", (req, res) => res.status(404).json({ error: "Not found" }));
  app.delete("/api/playlists/:id", (_req, res) => res.json({ ok: true }));

  app.get("/api/photos/stats", (_req, res) => res.json({ total: 0, byCategory: [] }));
  app.get("/api/music/count", (_req, res) => res.json({ count: 0, total: 0 }));
  app.get("/api/messages/unread-count", (_req, res) => res.json({ count: 0 }));

  app.get("/api/tab-headers", (_req, res) => res.json({}));
  app.put("/api/admin/tab-headers/:key", (_req, res) => res.json({ ok: true }));
  app.delete("/api/admin/tab-headers/:key", (_req, res) => res.json({ ok: true }));

  app.get("/api/radio-favorites", (_req, res) => res.json([]));
  app.post("/api/radio-favorites", (_req, res) => res.status(201).json({ ok: true }));
  app.delete("/api/radio-favorites/:id", (_req, res) => res.json({ ok: true }));
  app.get("/api/radio-favorites/wish-list/predictions", (_req, res) => res.json([]));

  app.get("/api/integrations/library-index", (_req, res) => res.json({ preferredPlayer: null, videoCount: 0, lastSync: null }));
  app.post("/api/integrations/library-index/sync", (_req, res) => res.json({ ok: true, count: 0 }));
  app.get("/api/integrations/custom-sources", (_req, res) => res.json({ items: [] }));
  app.get("/api/integrations/vault-builtins", (_req, res) => res.json({ items: [] }));
  app.post("/api/integrations/library-check", (_req, res) => res.json({ inLibrary: [] }));

  app.get("/api/discover/films", (_req, res) => res.json({ items: [], total: 0 }));
  app.get("/api/discover/films/:id", (_req, res) => res.status(404).json({ error: "Not found" }));
  app.post("/api/discover/films/:id/save", (_req, res) => res.json({ ok: true }));
  app.get("/api/discover/usage", (_req, res) => res.json({ used: 0, limit: 10 }));

  app.get("/api/friends", (_req, res) => res.json([]));
  app.get("/api/friends/requests", (_req, res) => res.json([]));
  app.get("/api/video-shares", (_req, res) => res.json([]));
  app.get("/api/playlist-shares", (_req, res) => res.json([]));
  app.get("/api/category-shares", (_req, res) => res.json([]));
  app.get("/api/photo-category-shares", (_req, res) => res.json([]));
  app.get("/api/vault-source-shares", (_req, res) => res.json([]));
  app.get("/api/watch-invites", (_req, res) => res.json([]));
  app.get("/api/p2p/my-sessions", (_req, res) => res.json([]));
  app.get("/api/game-invites", (_req, res) => res.json([]));
  app.get("/api/videos/cleanup-summary", (_req, res) => res.json({ count: 0, items: [] }));
  app.get("/api/photos/cleanup-summary", (_req, res) => res.json({ count: 0, items: [] }));
  app.post("/api/videos/validate-ids", (_req, res) => res.json({ valid: [], invalid: [] }));
  app.get("/api/notifications", (_req, res) => res.json([]));

  app.get("/api/remote/session", (_req, res) => res.json({ sessionId: null }));
  app.post("/api/remote/session", (_req, res) => res.json({ sessionId: null, ok: true }));
  app.delete("/api/remote/session", (_req, res) => res.json({ ok: true }));

  // Any /api/* route that wasn't matched returns 404 JSON (not the HTML fallback)
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Serve built React app in production
  const rendererDist = path.join(__dirname, "../renderer/dist");  // vite builds to renderer/dist
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

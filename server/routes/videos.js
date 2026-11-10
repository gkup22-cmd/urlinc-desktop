const { Router } = require("express");
const { randomUUID } = require("crypto");
const { getDb } = require("../db");
const { videos } = require("../schema");
const { eq, desc } = require("drizzle-orm");

const router = Router();

// GET /api/videos/stats
router.get("/stats", (_req, res) => {
  try {
    const db = getDb();
    const rows = db.select().from(videos).all();
    const total = rows.length;
    // Group by category field if it exists, otherwise return empty
    const counts = {};
    for (const row of rows) {
      const cat = row.category || null;
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    }
    const byCategory = Object.entries(counts).map(([category, count]) => ({ category, count }));
    res.json({ total, byCategory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Map DB row fields to the shape the renderer expects
function mapVideo(row) {
  return {
    ...row,
    youtubeUrl: row.url,
    thumbnailUrl: row.thumbnail,
    createdAt: (row.createdAt || 0) * 1000,
    updatedAt: (row.updatedAt || 0) * 1000,
    tags: (() => { try { return JSON.parse(row.tags || "[]"); } catch { return []; } })(),
  };
}

// GET /api/videos — paginated list (cursor-based, limit param)
router.get("/", (req, res) => {
  try {
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const cursor = req.query.cursor ? parseInt(req.query.cursor) : null;
    const rows = db.select().from(videos).orderBy(desc(videos.createdAt)).all();
    const start = cursor ?? 0;
    const items = rows.slice(start, start + limit).map(mapVideo);
    const nextCursor = start + limit < rows.length ? String(start + limit) : null;
    res.json({ items, nextCursor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/videos — add a video
router.post("/", (req, res) => {
  try {
    const db = getDb();
    const { title, url, thumbnail, duration, description, tags } = req.body;
    if (!title || !url) return res.status(400).json({ error: "title and url are required" });

    const now = Math.floor(Date.now() / 1000);
    const id = randomUUID();
    db.insert(videos).values({
      id,
      title,
      url,
      thumbnail: thumbnail || null,
      duration: duration || null,
      description: description || null,
      tags: JSON.stringify(tags || []),
      createdAt: now,
      updatedAt: now,
    }).run();

    const row = db.select().from(videos).where(eq(videos.id, id)).get();
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/videos/:id
router.delete("/:id", (req, res) => {
  try {
    const db = getDb();
    db.delete(videos).where(eq(videos.id, req.params.id)).run();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

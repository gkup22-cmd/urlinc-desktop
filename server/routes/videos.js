const { Router } = require("express");
const { randomUUID } = require("crypto");
const { getDb } = require("../db");
const { videos } = require("../schema");
const { eq, desc } = require("drizzle-orm");

const router = Router();

// GET /api/videos — list all videos
router.get("/", (_req, res) => {
  try {
    const db = getDb();
    const rows = db.select().from(videos).orderBy(desc(videos.createdAt)).all();
    res.json(rows);
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

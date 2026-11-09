const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");

const router = Router();

// Multer stores uploads in userData/files/
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = req.app.locals.filesDir;
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

// POST /api/storage/upload
router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file received" });
  const fileUrl = `/api/storage/files/${req.file.filename}`;
  res.json({ url: fileUrl, filename: req.file.filename, size: req.file.size });
});

// GET /api/storage/files/:filename — serve a local file
router.get("/files/:filename", (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(req.app.locals.filesDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });
  res.sendFile(filePath);
});

module.exports = router;

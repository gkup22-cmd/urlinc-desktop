const { Router } = require("express");
const { getDb } = require("../db");
const { users } = require("../schema");

const router = Router();

// GET /api/auth/me — always returns the single local user
router.get("/me", (_req, res) => {
  try {
    const db = getDb();
    const user = db.select().from(users).get();
    if (!user) return res.status(404).json({ error: "No user found" });
    res.json({ ...user, isLocal: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// No login/logout needed for local mode — always authenticated as "local" user

module.exports = router;

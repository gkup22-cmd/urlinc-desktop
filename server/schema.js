const { sqliteTable, text, integer } = require("drizzle-orm/sqlite-core");

const videos = sqliteTable("videos", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  thumbnail: text("thumbnail"),
  duration: integer("duration"),
  description: text("description"),
  tags: text("tags").default("[]"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("You"),
  createdAt: integer("created_at").notNull(),
});

module.exports = { videos, users };

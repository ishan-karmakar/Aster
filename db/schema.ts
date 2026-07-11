import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  email: text("email").primaryKey(),
  fullName: text("full_name").notNull(),
  username: text("username").notNull(),
  classes: text("classes").notNull().default("[]"),
  createdAt: integer("created_at").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
}, (table) => [uniqueIndex("profiles_username_idx").on(table.username)]);

import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  email: text("email").primaryKey(),
  fullName: text("full_name").notNull(),
  username: text("username").notNull(),
  classes: text("classes").notNull().default("[]"),
  createdAt: integer("created_at").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
}, (table) => [uniqueIndex("profiles_username_idx").on(table.username)]);

export const assignments = sqliteTable("assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email").notNull(),
  subject: text("subject").notNull(),
  title: text("title").notNull(),
  dueAt: text("due_at").notNull(),
  priority: text("priority").notNull(),
  hours: integer("hours").notNull(),
  progress: integer("progress").notNull().default(0),
  reminderLabel: text("reminder_label").notNull().default("Never"),
  reminderAt: text("reminder_at"),
  reminderStatus: text("reminder_status").notNull().default("pending"),
  reminderAttempts: integer("reminder_attempts").notNull().default(0),
  createdAt: integer("created_at").notNull().default(0),
}, (table) => [
  index("assignments_owner_idx").on(table.userEmail),
  index("assignments_reminder_idx").on(table.reminderStatus, table.reminderAt),
]);

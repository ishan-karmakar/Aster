import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable(
  "profiles",
  {
    email: text("email").primaryKey(),
    fullName: text("full_name").notNull(),
    username: text("username").notNull(),
    classes: text("classes").notNull().default("[]"),
    createdAt: integer("created_at").notNull().default(0),
    updatedAt: integer("updated_at").notNull().default(0),
  },
  (table) => [uniqueIndex("profiles_username_idx").on(table.username)],
);

export const assignments = sqliteTable(
  "assignments",
  {
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
  },
  (table) => [
    index("assignments_owner_idx").on(table.userEmail),
    index("assignments_reminder_idx").on(
      table.reminderStatus,
      table.reminderAt,
    ),
  ],
);

export const plannerState = sqliteTable("planner_state", {
  userEmail: text("user_email").primaryKey(),
  state: text("state").notNull(),
  updatedAt: integer("updated_at").notNull().default(0),
});

export const syllabusImports = sqliteTable(
  "syllabus_imports",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    objectKey: text("object_key"),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    status: text("status").notNull(),
    extracted: text("extracted").notNull().default("[]"),
    createdAt: integer("created_at").notNull().default(0),
    updatedAt: integer("updated_at").notNull().default(0),
  },
  (table) => [index("syllabus_imports_owner_idx").on(table.userEmail)],
);

export const calendarConnections = sqliteTable("calendar_connections", {
  userEmail: text("user_email").primaryKey(),
  provider: text("provider").notNull(),
  refreshToken: text("refresh_token").notNull(),
  calendarId: text("calendar_id"),
  providerEmail: text("provider_email"),
  syncToken: text("sync_token"),
  status: text("status").notNull().default("connected"),
  updatedAt: integer("updated_at").notNull().default(0),
});

export const calendarEventLinks = sqliteTable(
  "calendar_event_links",
  {
    userEmail: text("user_email").notNull(),
    sessionId: text("session_id").notNull(),
    eventId: text("event_id").notNull(),
    eventUpdated: text("event_updated"),
    sessionUpdated: text("session_updated"),
  },
  (table) => [
    uniqueIndex("calendar_event_links_owner_session_idx").on(
      table.userEmail,
      table.sessionId,
    ),
  ],
);

export const calendarWebhooks = sqliteTable(
  "calendar_webhooks",
  {
    channelId: text("channel_id").primaryKey(),
    userEmail: text("user_email").notNull(),
    resourceId: text("resource_id"),
    expiration: text("expiration"),
    createdAt: integer("created_at").notNull().default(0),
  },
  (table) => [index("calendar_webhooks_owner_idx").on(table.userEmail)],
);

export const calendarSyncQueue = sqliteTable("calendar_sync_queue", {
  userEmail: text("user_email").primaryKey(),
  requestedAt: integer("requested_at").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: integer("next_attempt_at").notNull().default(0),
  lastError: text("last_error"),
});

CREATE TABLE `calendar_connections` (
	`user_email` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`refresh_token` text NOT NULL,
	`calendar_id` text,
	`provider_email` text,
	`sync_token` text,
	`status` text DEFAULT 'connected' NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `planner_state` (
	`user_email` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `syllabus_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`object_key` text,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`status` text NOT NULL,
	`extracted` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `syllabus_imports_owner_idx` ON `syllabus_imports` (`user_email`);
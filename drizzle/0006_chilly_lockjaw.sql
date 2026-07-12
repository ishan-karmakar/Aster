CREATE TABLE `calendar_sync_queue` (
	`user_email` text PRIMARY KEY NOT NULL,
	`requested_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendar_webhooks` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`resource_id` text,
	`expiration` text,
	`created_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `calendar_webhooks_owner_idx` ON `calendar_webhooks` (`user_email`);

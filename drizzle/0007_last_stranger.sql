ALTER TABLE `calendar_sync_queue` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `calendar_sync_queue` ADD `next_attempt_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `calendar_sync_queue` ADD `last_error` text;
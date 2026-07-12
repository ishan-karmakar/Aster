CREATE TABLE `calendar_event_links` (
	`user_email` text NOT NULL,
	`session_id` text NOT NULL,
	`event_id` text NOT NULL,
	`event_updated` text,
	`session_updated` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_event_links_owner_session_idx` ON `calendar_event_links` (`user_email`,`session_id`);
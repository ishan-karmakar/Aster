CREATE TABLE `profiles` (
	`email` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`username` text NOT NULL,
	`created_at` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_username_idx` ON `profiles` (`username`);
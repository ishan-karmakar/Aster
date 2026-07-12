CREATE TABLE `assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`subject` text NOT NULL,
	`title` text NOT NULL,
	`due_at` text NOT NULL,
	`priority` text NOT NULL,
	`hours` integer NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`reminder_label` text DEFAULT 'Never' NOT NULL,
	`reminder_at` text,
	`reminder_status` text DEFAULT 'pending' NOT NULL,
	`reminder_attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT 0 NOT NULL
);

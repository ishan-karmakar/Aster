CREATE INDEX `assignments_owner_idx` ON `assignments` (`user_email`);--> statement-breakpoint
CREATE INDEX `assignments_reminder_idx` ON `assignments` (`reminder_status`,`reminder_at`);
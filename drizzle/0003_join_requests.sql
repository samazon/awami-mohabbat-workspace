CREATE TABLE `join_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`profession` text NOT NULL,
	`contact` text NOT NULL,
	`locale` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`ip_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `join_requests_created_idx` ON `join_requests` (`created_at`);--> statement-breakpoint
CREATE INDEX `join_requests_ip_idx` ON `join_requests` (`ip_hash`,`created_at`);
CREATE TABLE `special_editions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`hash` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`title_ur` text NOT NULL,
	`title_en` text,
	`published_date` text,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `special_editions_hash_unique` ON `special_editions` (`hash`);--> statement-breakpoint
CREATE INDEX `special_editions_visible_date_idx` ON `special_editions` (`hidden`,`published_date`);
CREATE TABLE `gallery_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`hash` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`caption_ur` text,
	`caption_en` text,
	`category` text,
	`hidden` integer DEFAULT false NOT NULL,
	`sort_key` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_photos_hash_unique` ON `gallery_photos` (`hash`);--> statement-breakpoint
CREATE INDEX `gallery_photos_visible_sort_idx` ON `gallery_photos` (`hidden`,`sort_key`);
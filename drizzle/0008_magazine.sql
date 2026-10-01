CREATE TABLE `magazine_issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`title_ur` text NOT NULL,
	`title_en` text,
	`pdf_hash` text,
	`pdf_bytes` integer,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `magazine_issues_month_unique` ON `magazine_issues` (`month`);--> statement-breakpoint
CREATE TABLE `magazine_pages` (
	`issue_id` integer NOT NULL,
	`page_number` integer NOT NULL,
	`hash` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	PRIMARY KEY(`issue_id`, `page_number`),
	FOREIGN KEY (`issue_id`) REFERENCES `magazine_issues`(`id`) ON UPDATE no action ON DELETE cascade
);

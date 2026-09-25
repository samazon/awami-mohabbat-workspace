CREATE TABLE `columnists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name_ur` text NOT NULL,
	`name_en` text,
	`column_title_ur` text NOT NULL,
	`column_title_en` text,
	`banner_hash` text NOT NULL,
	`banner_width` integer NOT NULL,
	`banner_height` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `columnists_slug_unique` ON `columnists` (`slug`);--> statement-breakpoint
CREATE TABLE `homepage_columns` (
	`slot` integer PRIMARY KEY NOT NULL,
	`article_id` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "homepage_columns_slot_range" CHECK(`slot` IN (1, 2, 3))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `homepage_columns_article_id_unique` ON `homepage_columns` (`article_id`);--> statement-breakpoint
-- Fail closed: rebuilding `articles` cascades into `article_translations`
-- (D1 always enforces FKs), so refuse to run unless both tables are empty.
CREATE TABLE `__guard_0005` (`n` integer NOT NULL CHECK (`n` = 0));--> statement-breakpoint
INSERT INTO `__guard_0005` SELECT (SELECT count(*) FROM `articles`) + (SELECT count(*) FROM `article_translations`);--> statement-breakpoint
DROP TABLE `__guard_0005`;--> statement-breakpoint
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_article_translations` (
	`article_id` integer NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`excerpt` text NOT NULL,
	`body` text NOT NULL,
	`image_caption` text,
	`is_machine_translated` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`article_id`, `locale`),
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_article_translations`("article_id", "locale", "title", "author", "excerpt", "body", "image_caption", "is_machine_translated", "updated_at") SELECT "article_id", "locale", "title", "author", "excerpt", "body", "image_caption", "is_machine_translated", "updated_at" FROM `article_translations`;--> statement-breakpoint
DROP TABLE `article_translations`;--> statement-breakpoint
ALTER TABLE `__new_article_translations` RENAME TO `article_translations`;--> statement-breakpoint
CREATE TABLE `__new_articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`category` text NOT NULL,
	`columnist_id` integer,
	`published_date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`image_hash` text,
	`image_credit` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`columnist_id`) REFERENCES `columnists`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "articles_column_has_columnist" CHECK((`category` = 'column') = (`columnist_id` IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_articles`("id", "slug", "category", "columnist_id", "published_date", "status", "image_hash", "image_credit", "created_at", "updated_at") SELECT "id", "slug", "category", NULL, "published_date", "status", "image_hash", "image_credit", "created_at", "updated_at" FROM `articles`;--> statement-breakpoint
DROP TABLE `articles`;--> statement-breakpoint
ALTER TABLE `__new_articles` RENAME TO `articles`;--> statement-breakpoint
CREATE UNIQUE INDEX `articles_slug_unique` ON `articles` (`slug`);--> statement-breakpoint
CREATE INDEX `articles_status_date_idx` ON `articles` (`status`,`published_date`);--> statement-breakpoint
CREATE INDEX `articles_category_status_date_idx` ON `articles` (`category`,`status`,`published_date`);--> statement-breakpoint
PRAGMA defer_foreign_keys = off;

CREATE TABLE `ad_campaigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client` text NOT NULL,
	`slot_id` text NOT NULL,
	`type` text NOT NULL,
	`image_hash` text,
	`title` text,
	`body` text,
	`cta` text,
	`link_url` text NOT NULL,
	`alt_text` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`label_as` text DEFAULT 'sponsored' NOT NULL,
	`mobile_only` integer DEFAULT false NOT NULL,
	`new_tab` integer DEFAULT true NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`slot_id`) REFERENCES `ad_slots`(`slot_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ad_campaigns_slot_status_idx` ON `ad_campaigns` (`slot_id`,`status`,`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `ad_slots` (
	`slot_id` text PRIMARY KEY NOT NULL,
	`page` text NOT NULL,
	`kind` text NOT NULL,
	`fallback_mode` text NOT NULL,
	`google_unit_id` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `article_translations` (
	`article_id` integer NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`excerpt` text NOT NULL,
	`body` text NOT NULL,
	`image_caption` text,
	`is_machine_translated` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`article_id`, `locale`),
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`category` text NOT NULL,
	`published_date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`image_hash` text,
	`image_credit` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_slug_unique` ON `articles` (`slug`);--> statement-breakpoint
CREATE INDEX `articles_status_date_idx` ON `articles` (`status`,`published_date`);--> statement-breakpoint
CREATE TABLE `edition_pages` (
	`edition_id` integer NOT NULL,
	`page_number` integer NOT NULL,
	`hash` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`orig_bytes` integer NOT NULL,
	PRIMARY KEY(`edition_id`, `page_number`),
	FOREIGN KEY (`edition_id`) REFERENCES `editions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "edition_pages_range" CHECK("edition_pages"."page_number" BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE TABLE `edition_translations` (
	`edition_id` integer NOT NULL,
	`locale` text NOT NULL,
	`headline` text NOT NULL,
	`summary` text NOT NULL,
	`is_machine_translated` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`edition_id`, `locale`),
	FOREIGN KEY (`edition_id`) REFERENCES `editions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `editions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`hijri_date` text NOT NULL,
	`volume_number` integer NOT NULL,
	`issue_number` integer NOT NULL,
	`pdf_hash` text,
	`pdf_bytes` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "editions_date_iso" CHECK("editions"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editions_date_unique` ON `editions` (`date`);--> statement-breakpoint
CREATE INDEX `editions_status_date_idx` ON `editions` (`status`,`date`);--> statement-breakpoint
CREATE TABLE `emergency_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label_ur` text NOT NULL,
	`label_en` text NOT NULL,
	`number` text NOT NULL,
	`area` text DEFAULT 'both' NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`current_volume` integer NOT NULL,
	`current_issue` integer NOT NULL,
	`coverage_ur` text NOT NULL,
	`coverage_en` text NOT NULL,
	`editor_ur` text NOT NULL,
	`editor_en` text NOT NULL,
	`office_ur` text NOT NULL,
	`office_en` text NOT NULL,
	`bureau_ur` text NOT NULL,
	`bureau_en` text NOT NULL,
	`phone` text NOT NULL,
	`email` text NOT NULL,
	`facebook_url` text,
	`youtube_url` text,
	`linkedin_url` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "site_config_singleton" CHECK("site_config"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `utility_content` (
	`date` text PRIMARY KEY NOT NULL,
	`fajr` text NOT NULL,
	`zuhr` text NOT NULL,
	`asr` text NOT NULL,
	`maghrib` text NOT NULL,
	`isha` text NOT NULL,
	`prayer_source` text DEFAULT 'auto' NOT NULL,
	`gold_minor` integer NOT NULL,
	`gold_updated_at` integer NOT NULL,
	`gold_source` text NOT NULL,
	`silver_minor` integer NOT NULL,
	`silver_updated_at` integer NOT NULL,
	`silver_source` text NOT NULL,
	`petrol_minor` integer NOT NULL,
	`petrol_updated_at` integer NOT NULL,
	`petrol_source` text NOT NULL,
	`diesel_minor` integer NOT NULL,
	`diesel_updated_at` integer NOT NULL,
	`diesel_source` text NOT NULL
);

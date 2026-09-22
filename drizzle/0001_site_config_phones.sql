PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_site_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`current_volume` integer NOT NULL,
	`current_issue` integer NOT NULL,
	`coverage_ur` text NOT NULL,
	`coverage_en` text NOT NULL,
	`editor_ur` text NOT NULL,
	`editor_en` text NOT NULL,
	`office_ur` text NOT NULL,
	`office_en` text NOT NULL,
	`bureau_ur` text,
	`bureau_en` text,
	`phone` text NOT NULL,
	`phones` text NOT NULL,
	`email` text NOT NULL,
	`facebook_url` text,
	`youtube_url` text,
	`linkedin_url` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "site_config_singleton" CHECK("__new_site_config"."id" = 1)
);
--> statement-breakpoint
INSERT INTO `__new_site_config`("id", "current_volume", "current_issue", "coverage_ur", "coverage_en", "editor_ur", "editor_en", "office_ur", "office_en", "bureau_ur", "bureau_en", "phone", "phones", "email", "facebook_url", "youtube_url", "linkedin_url", "updated_at") SELECT "id", "current_volume", "current_issue", "coverage_ur", "coverage_en", "editor_ur", "editor_en", "office_ur", "office_en", "bureau_ur", "bureau_en", "phone", '[]', "email", "facebook_url", "youtube_url", "linkedin_url", "updated_at" FROM `site_config`;--> statement-breakpoint
DROP TABLE `site_config`;--> statement-breakpoint
ALTER TABLE `__new_site_config` RENAME TO `site_config`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
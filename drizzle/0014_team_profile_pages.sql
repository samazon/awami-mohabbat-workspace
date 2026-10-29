ALTER TABLE `team_members` ADD `profile_page` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `team_members` ADD `slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_slug_idx` ON `team_members` (`slug`);
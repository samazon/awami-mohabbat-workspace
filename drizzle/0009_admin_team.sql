CREATE TABLE `admin_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`admin_id` integer NOT NULL,
	`action` text NOT NULL,
	`target` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `admin_audit_at_idx` ON `admin_audit` (`at`);--> statement-breakpoint
CREATE TABLE `admin_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_email_unique` ON `admin_users` (`email`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_key` text NOT NULL,
	`sort_order` integer NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`name_en` text NOT NULL,
	`name_ur` text NOT NULL,
	`role_en` text,
	`role_ur` text,
	`place_en` text,
	`place_ur` text,
	`country` text,
	`photo_hash` text,
	`photo_ext` text,
	`photo_width` integer,
	`photo_height` integer,
	`hidden` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `team_members_group_order_idx` ON `team_members` (`group_key`,`sort_order`);--> statement-breakpoint
INSERT INTO `admin_users` (`email`, `name`, `active`, `created_at`) VALUES ('sommerbareen1@gmail.com', 'Sommer Bareen', 1, 1790985600000), ('awami_mohabbat@yahoo.com', 'Awami Mohabbat', 1, 1790985600000);

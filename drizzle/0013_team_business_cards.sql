CREATE TABLE `team_business_cards` (
	`member_id` integer PRIMARY KEY NOT NULL,
	`mobile` text,
	`phone2` text,
	`email` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE cascade
);

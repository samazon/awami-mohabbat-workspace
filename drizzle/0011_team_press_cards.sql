CREATE TABLE `team_press_cards` (
	`member_id` integer PRIMARY KEY NOT NULL,
	`cnic` text,
	`station` text,
	`address` text,
	`card_no` text,
	`valid_until` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE cascade
);

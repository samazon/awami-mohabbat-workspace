ALTER TABLE `team_press_cards` ADD `verify_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `team_press_cards_token_idx` ON `team_press_cards` (`verify_token`);
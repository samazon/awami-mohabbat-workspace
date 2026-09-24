-- Split the single "email or phone" field into two. Existing rows keep their
-- value: anything with an @ is treated as an email, everything else as a phone.
ALTER TABLE `join_requests` ADD `email` text;--> statement-breakpoint
ALTER TABLE `join_requests` ADD `phone` text;--> statement-breakpoint
UPDATE `join_requests` SET `email` = `contact` WHERE `contact` LIKE '%@%';--> statement-breakpoint
UPDATE `join_requests` SET `phone` = `contact` WHERE `contact` NOT LIKE '%@%';--> statement-breakpoint
ALTER TABLE `join_requests` DROP COLUMN `contact`;

ALTER TABLE `ad_campaigns` ADD `image_width` integer;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `image_height` integer;--> statement-breakpoint
INSERT OR IGNORE INTO `ad_slots` (`slot_id`, `page`, `kind`, `fallback_mode`, `display_order`) VALUES ('home-hero-side', 'home', 'portrait', 'hidden', 0);

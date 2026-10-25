ALTER TABLE `line_items` ADD `fingerprint` text;--> statement-breakpoint
ALTER TABLE `statements` ADD `date_from` text;--> statement-breakpoint
ALTER TABLE `statements` ADD `date_to` text;--> statement-breakpoint
ALTER TABLE `statements` ADD `format_profile` text;--> statement-breakpoint
ALTER TABLE `statements` ADD `rows_parsed` integer;--> statement-breakpoint
ALTER TABLE `statements` ADD `rows_skipped_duplicate` integer;
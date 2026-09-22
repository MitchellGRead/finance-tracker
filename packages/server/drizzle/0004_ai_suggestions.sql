-- AI suggested classification (TypeSafe Jev).
-- Shadow values: never read by reports, materialized into category_id / split_ratio
-- only when a line item is accepted.
-- Hand-written: drizzle's snapshot history is incomplete (0002/0003 have no
-- snapshots), so `drizzle-kit generate` would emit a destructive diff.
ALTER TABLE `line_items` ADD `suggested_category_id` integer REFERENCES `categories`(`id`);--> statement-breakpoint
ALTER TABLE `line_items` ADD `suggested_category_confidence` real;--> statement-breakpoint
ALTER TABLE `line_items` ADD `suggested_split_ratio` real;--> statement-breakpoint
ALTER TABLE `line_items` ADD `suggested_split_confidence` real;--> statement-breakpoint
ALTER TABLE `line_items` ADD `suggestion_status` text;--> statement-breakpoint
ALTER TABLE `line_items` ADD `suggestion_model` text;--> statement-breakpoint
ALTER TABLE `line_items` ADD `suggested_at` text;

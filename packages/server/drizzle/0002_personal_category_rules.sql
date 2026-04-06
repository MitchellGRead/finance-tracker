ALTER TABLE `category_rules` ADD `rule_type` text DEFAULT 'split' NOT NULL;--> statement-breakpoint
ALTER TABLE `category_rules` ADD `user_id` integer REFERENCES `users`(`id`);
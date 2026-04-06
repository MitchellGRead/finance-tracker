-- Create unified rules table
CREATE TABLE `rules` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `pattern` text NOT NULL,
  `rule_type` text DEFAULT 'split' NOT NULL,
  `user_id` integer REFERENCES `users`(`id`),
  `action` text,
  `category_id` integer REFERENCES `categories`(`id`),
  `created_by_user_id` integer NOT NULL REFERENCES `users`(`id`),
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);--> statement-breakpoint

-- Migrate category_rules into unified rules (action = NULL)
INSERT INTO `rules` (`pattern`, `rule_type`, `user_id`, `action`, `category_id`, `created_by_user_id`, `created_at`, `updated_at`)
SELECT `pattern`, `rule_type`, `user_id`, NULL, `category_id`, `created_by_user_id`, `created_at`, `updated_at`
FROM `category_rules`;--> statement-breakpoint

-- Merge accept_reject_rules: update matching rules or insert new ones
-- First, update category rules that have a matching pattern (case-insensitive)
UPDATE `rules` SET `action` = (
  SELECT `action` FROM `accept_reject_rules` ar
  WHERE LOWER(ar.`pattern`) = LOWER(`rules`.`pattern`)
  AND `rules`.`rule_type` = 'split'
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM `accept_reject_rules` ar
  WHERE LOWER(ar.`pattern`) = LOWER(`rules`.`pattern`)
  AND `rules`.`rule_type` = 'split'
);--> statement-breakpoint

-- Insert accept_reject_rules that have no matching category rule
INSERT INTO `rules` (`pattern`, `rule_type`, `user_id`, `action`, `category_id`, `created_by_user_id`, `created_at`, `updated_at`)
SELECT ar.`pattern`, 'split', NULL, ar.`action`, NULL, ar.`user_id`, ar.`created_at`, ar.`updated_at`
FROM `accept_reject_rules` ar
WHERE NOT EXISTS (
  SELECT 1 FROM `rules` r
  WHERE LOWER(r.`pattern`) = LOWER(ar.`pattern`)
  AND r.`rule_type` = 'split'
);--> statement-breakpoint

-- Drop old tables
DROP TABLE `category_rules`;--> statement-breakpoint
DROP TABLE `accept_reject_rules`;
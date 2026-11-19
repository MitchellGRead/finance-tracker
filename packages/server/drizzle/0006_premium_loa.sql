CREATE TABLE `anomaly_dismissals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`period_year` integer NOT NULL,
	`period_month` integer NOT NULL,
	`kind` text NOT NULL,
	`subject_key` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anomaly_dismissals_subject_idx` ON `anomaly_dismissals` (`period_year`,`period_month`,`kind`,`subject_key`);--> statement-breakpoint
CREATE TABLE `settlement_months` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`settlement_id` integer NOT NULL,
	`period_year` integer NOT NULL,
	`period_month` integer NOT NULL,
	`amount_owed` real NOT NULL,
	`is_adjustment` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settlement_months_settlement_period_idx` ON `settlement_months` (`settlement_id`,`period_year`,`period_month`);--> statement-breakpoint
CREATE UNIQUE INDEX `settlement_months_covered_idx` ON `settlement_months` (`period_year`,`period_month`) WHERE "settlement_months"."is_adjustment" = 0;--> statement-breakpoint
CREATE TABLE `settlement_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`settlement_id` integer NOT NULL,
	`amount` real NOT NULL,
	`paid_on` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_user_id` integer NOT NULL,
	`to_user_id` integer NOT NULL,
	`amount_owed` real NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

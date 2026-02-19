CREATE TABLE `api_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`last_request_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_usage_month_unique` ON `api_usage` (`month`);
ALTER TABLE `tracked_flights` ADD COLUMN `updated_at` integer DEFAULT (unixepoch()) NOT NULL;
--> statement-breakpoint
UPDATE `tracked_flights` SET `updated_at` = COALESCE(`updated_at`, `created_at`);

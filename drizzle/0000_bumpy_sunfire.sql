CREATE TABLE `api_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`last_request_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_usage_month_unique` ON `api_usage` (`month`);--> statement-breakpoint
CREATE TABLE `flights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`flight_number` text NOT NULL,
	`flight_date` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`scheduled_departure` text NOT NULL,
	`scheduled_arrival` text NOT NULL,
	`current_status` text,
	`gate` text,
	`terminal` text,
	`delay_minutes` integer,
	`last_polled_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `flights_flight_number_flight_date_idx` ON `flights` (`flight_number`,`flight_date`);--> statement-breakpoint
CREATE INDEX `flights_scheduled_departure_idx` ON `flights` (`scheduled_departure`);--> statement-breakpoint
CREATE TABLE `status_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`flight_id` integer NOT NULL,
	`old_status` text,
	`new_status` text NOT NULL,
	`details` text,
	`detected_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`flight_id`) REFERENCES `flights`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tracked_flights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` text NOT NULL,
	`flight_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`flight_id`) REFERENCES `flights`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_flights_chat_id_flight_id_unique` ON `tracked_flights` (`chat_id`,`flight_id`);--> statement-breakpoint
CREATE INDEX `tracked_flights_chat_id_idx` ON `tracked_flights` (`chat_id`);--> statement-breakpoint
CREATE INDEX `tracked_flights_flight_id_idx` ON `tracked_flights` (`flight_id`);
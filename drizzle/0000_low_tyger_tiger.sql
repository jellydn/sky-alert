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

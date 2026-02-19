DELETE FROM `tracked_flights`
WHERE `id` NOT IN (
	SELECT MIN(`id`)
	FROM `tracked_flights`
	GROUP BY `chat_id`, `flight_id`
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `flights_flight_number_flight_date_idx` ON `flights` (`flight_number`,`flight_date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `flights_scheduled_departure_idx` ON `flights` (`scheduled_departure`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `tracked_flights_chat_id_flight_id_unique` ON `tracked_flights` (`chat_id`,`flight_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tracked_flights_chat_id_idx` ON `tracked_flights` (`chat_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tracked_flights_flight_id_idx` ON `tracked_flights` (`flight_id`);

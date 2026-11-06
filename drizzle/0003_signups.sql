CREATE TABLE `mimipip_signups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL UNIQUE,
	`consent` text NOT NULL,
	`source` text NOT NULL,
	`country` text,
	`leave_key` text NOT NULL UNIQUE,
	`created_at` integer NOT NULL,
	`unsubscribed_at` integer
);

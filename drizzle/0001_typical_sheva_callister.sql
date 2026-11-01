CREATE TABLE `mimipip_payment_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`salt` text NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` integer NOT NULL
);

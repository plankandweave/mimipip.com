CREATE TABLE `mimipip_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`status` text NOT NULL,
	`amount` integer NOT NULL,
	`shipping` integer NOT NULL,
	`customer` text NOT NULL,
	`fulfilment` text NOT NULL,
	`razorpay_order_id` text,
	`payment_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mimipip_orders_token_hash_unique` ON `mimipip_orders` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `mimipip_orders_razorpay_order_id_unique` ON `mimipip_orders` (`razorpay_order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mimipip_orders_payment_id_unique` ON `mimipip_orders` (`payment_id`);
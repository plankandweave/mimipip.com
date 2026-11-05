ALTER TABLE `mimipip_orders` ADD `currency` text DEFAULT 'INR' NOT NULL;
ALTER TABLE `mimipip_orders` ADD `lines` text DEFAULT '[]' NOT NULL;
ALTER TABLE `mimipip_orders` ADD `lines_hash` text;
ALTER TABLE `mimipip_orders` ADD `amount_inr` real;
ALTER TABLE `mimipip_orders` ADD `os_status` text DEFAULT 'waiting' NOT NULL;
ALTER TABLE `mimipip_orders` ADD `os_error` text;
ALTER TABLE `mimipip_orders` ADD `os_tries` integer DEFAULT 0 NOT NULL;
ALTER TABLE `mimipip_orders` ADD `os_sent_at` integer;
CREATE INDEX `mimipip_orders_os` ON `mimipip_orders` (`status`,`os_status`);

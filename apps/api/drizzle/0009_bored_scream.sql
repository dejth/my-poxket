ALTER TABLE `users` ADD `name` varchar(100) NULL;
--> statement-breakpoint
UPDATE `users` SET `name` = `username` WHERE `name` IS NULL;
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(100) NOT NULL;

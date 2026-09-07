CREATE TABLE `categories` (
	`id` char(36) NOT NULL,
	`direction` enum('income','expense') NOT NULL,
	`name` varchar(100) NOT NULL,
	`normalized_name` varchar(100) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `categories_id_pk` PRIMARY KEY(`id`),
	CONSTRAINT `categories_direction_name_unique` UNIQUE(`direction`,`normalized_name`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` char(36) NOT NULL,
	`direction` enum('income','expense') NOT NULL,
	`amount_minor` bigint unsigned NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'THB',
	`transaction_date` date NOT NULL,
	`description` varchar(255) NOT NULL,
	`category_id` char(36) NOT NULL,
	`payment_method` enum('cash','bank_transfer','debit_card','other','credit_card') NOT NULL,
	`status` enum('active','superseded','cancelled') NOT NULL DEFAULT 'active',
	`corrects_transaction_id` char(36),
	`created_by_user_id` char(36) NOT NULL,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `transactions_id_pk` PRIMARY KEY(`id`),
	CONSTRAINT `transactions_correction_unique` UNIQUE(`corrects_transaction_id`),
	CONSTRAINT `transactions_amount_positive` CHECK(`transactions`.`amount_minor` > 0),
	CONSTRAINT `transactions_amount_maximum` CHECK(`transactions`.`amount_minor` <= 99999999999),
	CONSTRAINT `transactions_currency_thb` CHECK(`transactions`.`currency` = 'THB'),
	CONSTRAINT `transactions_credit_card_expense_only` CHECK(`transactions`.`payment_method` <> 'credit_card' OR `transactions`.`direction` = 'expense')
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_corrects_transaction_id_transactions_id_fk` FOREIGN KEY (`corrects_transaction_id`) REFERENCES `transactions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `categories_direction_active_index` ON `categories` (`direction`,`is_active`);--> statement-breakpoint
CREATE INDEX `transactions_date_index` ON `transactions` (`transaction_date`);--> statement-breakpoint
CREATE INDEX `transactions_direction_date_index` ON `transactions` (`direction`,`transaction_date`);--> statement-breakpoint
CREATE INDEX `transactions_category_date_index` ON `transactions` (`category_id`,`transaction_date`);--> statement-breakpoint
CREATE INDEX `transactions_status_date_index` ON `transactions` (`status`,`transaction_date`);

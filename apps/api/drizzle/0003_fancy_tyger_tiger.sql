CREATE TABLE `installment_occurrences` (
	`id` char(36) NOT NULL,
	`installment_plan_id` char(36) NOT NULL,
	`installment_number` smallint unsigned NOT NULL,
	`amount_minor` bigint unsigned NOT NULL,
	`due_date` date NOT NULL,
	`status` enum('unpaid','paid','cancelled') NOT NULL DEFAULT 'unpaid',
	`paid_date` date,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `installment_occurrences_id_pk` PRIMARY KEY(`id`),
	CONSTRAINT `installment_occurrences_plan_number_unique` UNIQUE(`installment_plan_id`,`installment_number`),
	CONSTRAINT `installment_occurrences_number_positive` CHECK(`installment_occurrences`.`installment_number` > 0),
	CONSTRAINT `installment_occurrences_amount_positive` CHECK(`installment_occurrences`.`amount_minor` > 0),
	CONSTRAINT `installment_occurrences_paid_date_status` CHECK((`installment_occurrences`.`status` = 'paid' AND `installment_occurrences`.`paid_date` IS NOT NULL) OR (`installment_occurrences`.`status` <> 'paid' AND `installment_occurrences`.`paid_date` IS NULL))
);
--> statement-breakpoint
CREATE TABLE `installment_plans` (
	`id` char(36) NOT NULL,
	`idempotency_key` char(36) NOT NULL,
	`description` varchar(255) NOT NULL,
	`total_amount_minor` bigint unsigned NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'THB',
	`category_id` char(36) NOT NULL,
	`credit_card_id` char(36),
	`payment_method` enum('cash','bank_transfer','debit_card','other','credit_card') NOT NULL,
	`first_payment_date` date NOT NULL,
	`total_installments` smallint unsigned NOT NULL,
	`status` enum('active','completed','cancelled') NOT NULL DEFAULT 'active',
	`created_by_user_id` char(36) NOT NULL,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `installment_plans_id_pk` PRIMARY KEY(`id`),
	CONSTRAINT `installment_plans_idempotency_key_unique` UNIQUE(`idempotency_key`),
	CONSTRAINT `installment_plans_amount_positive` CHECK(`installment_plans`.`total_amount_minor` > 0),
	CONSTRAINT `installment_plans_amount_maximum` CHECK(`installment_plans`.`total_amount_minor` <= 99999999999),
	CONSTRAINT `installment_plans_currency_thb` CHECK(`installment_plans`.`currency` = 'THB'),
	CONSTRAINT `installment_plans_total_installments_positive` CHECK(`installment_plans`.`total_installments` > 0),
	CONSTRAINT `installment_plans_credit_card_reference` CHECK((`installment_plans`.`payment_method` = 'credit_card' AND `installment_plans`.`credit_card_id` IS NOT NULL) OR (`installment_plans`.`payment_method` <> 'credit_card' AND `installment_plans`.`credit_card_id` IS NULL))
);
--> statement-breakpoint
ALTER TABLE `installment_occurrences` ADD CONSTRAINT `installment_occurrences_plan_fk` FOREIGN KEY (`installment_plan_id`) REFERENCES `installment_plans`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `installment_plans` ADD CONSTRAINT `installment_plans_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `installment_plans` ADD CONSTRAINT `installment_plans_credit_card_id_credit_cards_id_fk` FOREIGN KEY (`credit_card_id`) REFERENCES `credit_cards`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `installment_plans` ADD CONSTRAINT `installment_plans_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `installment_occurrences_status_due_date_index` ON `installment_occurrences` (`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `installment_plans_status_index` ON `installment_plans` (`status`);

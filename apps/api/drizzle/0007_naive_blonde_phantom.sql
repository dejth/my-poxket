CREATE TABLE `recurring_expense_occurrences` (
	`id` char(36) NOT NULL,
	`recurring_expense_rule_id` char(36) NOT NULL,
	`recurrence_period` char(7) NOT NULL,
	`description` varchar(255) NOT NULL,
	`amount_minor` bigint unsigned NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'THB',
	`category_id` char(36) NOT NULL,
	`credit_card_id` char(36),
	`payment_method` enum('cash','bank_transfer','debit_card','other','credit_card') NOT NULL,
	`due_date` date NOT NULL,
	`status` enum('unpaid','paid','cancelled') NOT NULL DEFAULT 'unpaid',
	`paid_date` date,
	`paid_amount_minor` bigint unsigned,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `recurring_expense_occurrences_id_pk` PRIMARY KEY(`id`),
	CONSTRAINT `recurring_expense_occurrences_rule_period_unique` UNIQUE(`recurring_expense_rule_id`,`recurrence_period`),
	CONSTRAINT `recurring_expense_occurrences_period_format` CHECK(`recurring_expense_occurrences`.`recurrence_period` REGEXP '^[0-9]{4}-[0-9]{2}$'),
	CONSTRAINT `recurring_expense_occurrences_amount_range` CHECK(`recurring_expense_occurrences`.`amount_minor` > 0 AND `recurring_expense_occurrences`.`amount_minor` <= 99999999999),
	CONSTRAINT `recurring_expense_occurrences_currency_thb` CHECK(`recurring_expense_occurrences`.`currency` = 'THB'),
	CONSTRAINT `recurring_expense_occurrences_credit_card_reference` CHECK((`recurring_expense_occurrences`.`payment_method` = 'credit_card' AND `recurring_expense_occurrences`.`credit_card_id` IS NOT NULL) OR (`recurring_expense_occurrences`.`payment_method` <> 'credit_card' AND `recurring_expense_occurrences`.`credit_card_id` IS NULL)),
	CONSTRAINT `recurring_expense_occurrences_paid_values` CHECK((`recurring_expense_occurrences`.`status` = 'paid' AND `recurring_expense_occurrences`.`paid_date` IS NOT NULL AND `recurring_expense_occurrences`.`paid_amount_minor` IS NOT NULL) OR (`recurring_expense_occurrences`.`status` <> 'paid' AND `recurring_expense_occurrences`.`paid_date` IS NULL AND `recurring_expense_occurrences`.`paid_amount_minor` IS NULL)),
	CONSTRAINT `recurring_expense_occurrences_paid_amount_range` CHECK(`recurring_expense_occurrences`.`paid_amount_minor` IS NULL OR (`recurring_expense_occurrences`.`paid_amount_minor` > 0 AND `recurring_expense_occurrences`.`paid_amount_minor` <= 99999999999))
);
--> statement-breakpoint
CREATE TABLE `recurring_expense_rules` (
	`id` char(36) NOT NULL,
	`idempotency_key` char(36) NOT NULL,
	`description` varchar(255) NOT NULL,
	`amount_minor` bigint unsigned NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'THB',
	`category_id` char(36) NOT NULL,
	`credit_card_id` char(36),
	`payment_method` enum('cash','bank_transfer','debit_card','other','credit_card') NOT NULL,
	`start_date` date NOT NULL,
	`recurrence_day` tinyint unsigned NOT NULL,
	`status` enum('active','stopped') NOT NULL DEFAULT 'active',
	`created_by_user_id` char(36) NOT NULL,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `recurring_expense_rules_id_pk` PRIMARY KEY(`id`),
	CONSTRAINT `recurring_expense_rules_idempotency_key_unique` UNIQUE(`idempotency_key`),
	CONSTRAINT `recurring_expense_rules_amount_range` CHECK(`recurring_expense_rules`.`amount_minor` > 0 AND `recurring_expense_rules`.`amount_minor` <= 99999999999),
	CONSTRAINT `recurring_expense_rules_currency_thb` CHECK(`recurring_expense_rules`.`currency` = 'THB'),
	CONSTRAINT `recurring_expense_rules_day_range` CHECK(`recurring_expense_rules`.`recurrence_day` BETWEEN 1 AND 31),
	CONSTRAINT `recurring_expense_rules_credit_card_reference` CHECK((`recurring_expense_rules`.`payment_method` = 'credit_card' AND `recurring_expense_rules`.`credit_card_id` IS NOT NULL) OR (`recurring_expense_rules`.`payment_method` <> 'credit_card' AND `recurring_expense_rules`.`credit_card_id` IS NULL))
);
--> statement-breakpoint
ALTER TABLE `recurring_expense_occurrences` ADD CONSTRAINT `recurring_expense_occurrences_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recurring_expense_occurrences` ADD CONSTRAINT `recurring_expense_occurrences_credit_card_id_credit_cards_id_fk` FOREIGN KEY (`credit_card_id`) REFERENCES `credit_cards`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recurring_expense_occurrences` ADD CONSTRAINT `recurring_expense_occurrences_rule_fk` FOREIGN KEY (`recurring_expense_rule_id`) REFERENCES `recurring_expense_rules`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recurring_expense_rules` ADD CONSTRAINT `recurring_expense_rules_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recurring_expense_rules` ADD CONSTRAINT `recurring_expense_rules_credit_card_id_credit_cards_id_fk` FOREIGN KEY (`credit_card_id`) REFERENCES `credit_cards`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recurring_expense_rules` ADD CONSTRAINT `recurring_expense_rules_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `recurring_expense_occurrences_status_due_date_index` ON `recurring_expense_occurrences` (`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `recurring_expense_rules_status_index` ON `recurring_expense_rules` (`status`);
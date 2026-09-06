CREATE TABLE `credit_cards` (
	`id` char(36) NOT NULL,
	`name` varchar(100) NOT NULL,
	`normalized_name` varchar(100) NOT NULL,
	`masked_suffix` char(4),
	`cutoff_day` tinyint unsigned NOT NULL,
	`due_day` tinyint unsigned NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `credit_cards_id_pk` PRIMARY KEY(`id`),
	CONSTRAINT `credit_cards_name_unique` UNIQUE(`normalized_name`),
	CONSTRAINT `credit_cards_masked_suffix_format` CHECK(`credit_cards`.`masked_suffix` IS NULL OR `credit_cards`.`masked_suffix` REGEXP '^[0-9]{4}$'),
	CONSTRAINT `credit_cards_cutoff_day_range` CHECK(`credit_cards`.`cutoff_day` BETWEEN 1 AND 31),
	CONSTRAINT `credit_cards_due_day_range` CHECK(`credit_cards`.`due_day` BETWEEN 1 AND 31)
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `credit_card_id` char(36);--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_credit_card_reference` CHECK ((`transactions`.`payment_method` = 'credit_card' AND `transactions`.`credit_card_id` IS NOT NULL) OR (`transactions`.`payment_method` <> 'credit_card' AND `transactions`.`credit_card_id` IS NULL));--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_credit_card_id_credit_cards_id_fk` FOREIGN KEY (`credit_card_id`) REFERENCES `credit_cards`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `transactions_card_status_date_index` ON `transactions` (`credit_card_id`,`status`,`transaction_date`);
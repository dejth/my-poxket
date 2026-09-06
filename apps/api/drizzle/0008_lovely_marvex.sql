CREATE TABLE `credit_card_statement_payments` (
	`id` char(36) NOT NULL,
	`credit_card_id` char(36) NOT NULL,
	`statement_end_date` date NOT NULL,
	`status` enum('unpaid','paid') NOT NULL DEFAULT 'unpaid',
	`paid_amount_minor` bigint unsigned,
	`paid_date` date,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `credit_card_statement_payments_id_pk` PRIMARY KEY(`id`),
	CONSTRAINT `credit_card_statement_payments_statement_unique` UNIQUE(`credit_card_id`,`statement_end_date`),
	CONSTRAINT `credit_card_statement_payments_paid_values` CHECK((`credit_card_statement_payments`.`status` = 'paid' AND `credit_card_statement_payments`.`paid_date` IS NOT NULL AND `credit_card_statement_payments`.`paid_amount_minor` IS NOT NULL) OR (`credit_card_statement_payments`.`status` = 'unpaid' AND `credit_card_statement_payments`.`paid_date` IS NULL AND `credit_card_statement_payments`.`paid_amount_minor` IS NULL)),
	CONSTRAINT `credit_card_statement_payments_amount_range` CHECK(`credit_card_statement_payments`.`paid_amount_minor` IS NULL OR (`credit_card_statement_payments`.`paid_amount_minor` > 0 AND `credit_card_statement_payments`.`paid_amount_minor` <= 99999999999))
);
--> statement-breakpoint
ALTER TABLE `credit_card_statement_payments` ADD CONSTRAINT `credit_card_statement_payments_credit_card_id_credit_cards_id_fk` FOREIGN KEY (`credit_card_id`) REFERENCES `credit_cards`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `credit_card_statement_payments_status_date_index` ON `credit_card_statement_payments` (`status`,`paid_date`);
ALTER TABLE `installment_occurrences` DROP CONSTRAINT `installment_occurrences_amount_positive`;--> statement-breakpoint
ALTER TABLE `installment_occurrences` MODIFY COLUMN `amount_minor` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `installment_occurrences` ADD CONSTRAINT `installment_occurrences_amount_positive` CHECK (`installment_occurrences`.`amount_minor` > 0);
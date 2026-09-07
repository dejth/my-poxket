ALTER TABLE `installment_occurrences` DROP CONSTRAINT `installment_occurrences_amount_positive`;--> statement-breakpoint
ALTER TABLE `installment_occurrences` DROP CONSTRAINT `installment_occurrences_paid_date_status`;--> statement-breakpoint
ALTER TABLE `installment_plans` DROP CONSTRAINT `installment_plans_amount_positive`;--> statement-breakpoint
ALTER TABLE `installment_plans` DROP CONSTRAINT `installment_plans_amount_maximum`;--> statement-breakpoint
ALTER TABLE `installment_occurrences` MODIFY COLUMN `amount_minor` bigint unsigned;--> statement-breakpoint
ALTER TABLE `installment_plans` MODIFY COLUMN `total_amount_minor` bigint unsigned;--> statement-breakpoint
ALTER TABLE `installment_occurrences` ADD `paid_amount_minor` bigint unsigned;--> statement-breakpoint
UPDATE `installment_occurrences` SET `paid_amount_minor` = `amount_minor` WHERE `status` = 'paid' AND `paid_amount_minor` IS NULL;--> statement-breakpoint
ALTER TABLE `installment_occurrences` ADD CONSTRAINT `installment_occurrences_paid_amount_positive` CHECK (`installment_occurrences`.`paid_amount_minor` IS NULL OR (`installment_occurrences`.`paid_amount_minor` > 0 AND `installment_occurrences`.`paid_amount_minor` <= 99999999999));--> statement-breakpoint
ALTER TABLE `installment_occurrences` ADD CONSTRAINT `installment_occurrences_amount_positive` CHECK (`installment_occurrences`.`amount_minor` IS NULL OR `installment_occurrences`.`amount_minor` > 0);--> statement-breakpoint
ALTER TABLE `installment_occurrences` ADD CONSTRAINT `installment_occurrences_paid_date_status` CHECK ((`installment_occurrences`.`status` = 'paid' AND `installment_occurrences`.`paid_date` IS NOT NULL AND `installment_occurrences`.`paid_amount_minor` IS NOT NULL) OR (`installment_occurrences`.`status` <> 'paid' AND `installment_occurrences`.`paid_date` IS NULL AND `installment_occurrences`.`paid_amount_minor` IS NULL));--> statement-breakpoint
ALTER TABLE `installment_plans` ADD CONSTRAINT `installment_plans_amount_positive` CHECK (`installment_plans`.`total_amount_minor` IS NULL OR `installment_plans`.`total_amount_minor` > 0);--> statement-breakpoint
ALTER TABLE `installment_plans` ADD CONSTRAINT `installment_plans_amount_maximum` CHECK (`installment_plans`.`total_amount_minor` IS NULL OR `installment_plans`.`total_amount_minor` <= 99999999999);

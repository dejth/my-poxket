ALTER TABLE `installment_occurrences` ADD `statement_payment_id` char(36);--> statement-breakpoint
ALTER TABLE `recurring_expense_occurrences` ADD `statement_payment_id` char(36);--> statement-breakpoint
ALTER TABLE `transactions` ADD `posting_date` date;--> statement-breakpoint
ALTER TABLE `installment_occurrences` ADD CONSTRAINT `installment_bill_payment_fk` FOREIGN KEY (`statement_payment_id`) REFERENCES `credit_card_statement_payments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recurring_expense_occurrences` ADD CONSTRAINT `recurring_bill_payment_fk` FOREIGN KEY (`statement_payment_id`) REFERENCES `credit_card_statement_payments`(`id`) ON DELETE restrict ON UPDATE no action;